import {
  createPersistedRoom,
  readPersistedGuestRoom,
  readPersistedHostRoom,
  type D1Database,
} from "./room-storage";

type SessionDescription = {
  type: "offer" | "answer";
  sdp: string;
};

const ROOM_LIFETIME_MS = 10 * 60 * 1000;
const MAX_SDP_LENGTH = 32_000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let schemaReady: Promise<void> | null = null;

function response(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function getDatabase(): Promise<D1Database | null> {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { DB?: D1Database }).DB ?? null;
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS pvp_rooms (
          code TEXT PRIMARY KEY NOT NULL,
          host_token TEXT NOT NULL,
          offer TEXT NOT NULL,
          answer TEXT,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          guest_joined_at INTEGER
        )
      `),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS pvp_rooms_expires_at_idx ON pvp_rooms (expires_at)",
      ),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_SDP_LENGTH * 2) {
    throw new Error("payload_too_large");
  }
  const value = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_body");
  }
  return value as Record<string, unknown>;
}

function validDescription(
  value: unknown,
  expectedType: SessionDescription["type"],
): value is SessionDescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const description = value as Record<string, unknown>;
  return (
    description.type === expectedType &&
    typeof description.sdp === "string" &&
    description.sdp.length > 0 &&
    description.sdp.length <= MAX_SDP_LENGTH
  );
}

function normalizeCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function validCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}

function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(
    bytes,
    (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length],
  ).join("");
}

function createHostToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request): Promise<Response> {
  const db = await getDatabase();
  if (!db) return response({ error: "pvp_storage_unavailable" }, 503);

  try {
    await ensureSchema(db);
    const body = await readBody(request);
    const action = body.action;
    const now = Date.now();

    if (action === "create") {
      if (body.offer !== undefined && !validDescription(body.offer, "offer")) {
        return response({ error: "invalid_offer" }, 400);
      }

      const offer = body.offer ? JSON.stringify(body.offer) : "null";
      const hostToken = createHostToken();
      const expiresAt = now + ROOM_LIFETIME_MS;
      const code = await createPersistedRoom(db, {
        now,
        expiresAt,
        hostToken,
        offer,
        createCode: createRoomCode,
      });
      if (code) return response({ code, hostToken, expiresAt }, 201);
      return response({ error: "room_code_unavailable" }, 503);
    }

    if (action === "publish-offer") {
      const code = normalizeCode(body.code);
      const hostToken = typeof body.hostToken === "string" ? body.hostToken : "";
      if (!validCode(code) || hostToken.length < 32 || !validDescription(body.offer, "offer")) {
        return response({ error: "invalid_offer" }, 400);
      }
      const result = await db
        .prepare(
          "UPDATE pvp_rooms SET offer = ? WHERE code = ? AND host_token = ? AND expires_at >= ? AND answer IS NULL",
        )
        .bind(JSON.stringify(body.offer), code, hostToken, now)
        .run();
      if ((result.meta?.changes ?? 0) < 1) {
        return response({ error: "room_unavailable" }, 409);
      }
      return response({ ok: true });
    }

    if (action === "answer") {
      const code = normalizeCode(body.code);
      if (!validCode(code) || !validDescription(body.answer, "answer")) {
        return response({ error: "invalid_answer" }, 400);
      }
      const result = await db
        .prepare(
          "UPDATE pvp_rooms SET answer = ?, guest_joined_at = ? WHERE code = ? AND expires_at >= ? AND answer IS NULL",
        )
        .bind(JSON.stringify(body.answer), now, code, now)
        .run();
      if ((result.meta?.changes ?? 0) < 1) {
        return response({ error: "room_unavailable" }, 409);
      }
      return response({ ok: true });
    }

    if (action === "close") {
      const code = normalizeCode(body.code);
      const hostToken =
        typeof body.hostToken === "string" ? body.hostToken : "";
      if (!validCode(code) || hostToken.length < 32) {
        return response({ error: "invalid_room" }, 400);
      }
      await db
        .prepare("DELETE FROM pvp_rooms WHERE code = ? AND host_token = ?")
        .bind(code, hostToken)
        .run();
      return response({ ok: true });
    }

    return response({ error: "unknown_action" }, 400);
  } catch (error) {
    if (
      error instanceof Error &&
      ["payload_too_large", "invalid_body"].includes(error.message)
    ) {
      return response({ error: error.message }, 400);
    }
    console.error("PvP signaling request failed");
    return response({ error: "signaling_failed" }, 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  const db = await getDatabase();
  if (!db) return response({ error: "pvp_storage_unavailable" }, 503);

  try {
    await ensureSchema(db);
    const url = new URL(request.url);
    const code = normalizeCode(url.searchParams.get("code"));
    const hostToken = url.searchParams.get("hostToken") || "";
    if (!validCode(code)) return response({ error: "invalid_room" }, 400);

    const now = Date.now();
    if (hostToken) {
      const room = await readPersistedHostRoom(db, code, hostToken, now);
      if (!room) return response({ error: "room_not_found" }, 404);
      if (!room.is_host) {
        return response({ error: "invalid_host_token" }, 403);
      }
      return response({
        answer: room.answer ? JSON.parse(room.answer) : null,
        expiresAt: room.expires_at,
      });
    }

    const room = await readPersistedGuestRoom(db, code, now);
    if (!room) return response({ error: "room_not_found" }, 404);
    if (room.has_answer) return response({ error: "room_full" }, 409);
    const offer = JSON.parse(room.offer) as SessionDescription | null;
    if (!offer) return response({ preparing: true, expiresAt: room.expires_at });
    return response({
      offer,
      expiresAt: room.expires_at,
    });
  } catch {
    console.error("PvP signaling lookup failed");
    return response({ error: "signaling_failed" }, 500);
  }
}
