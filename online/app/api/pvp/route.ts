import {
  createPersistedRoom,
  readPersistedGuestRoom,
  readPersistedHostRoom,
  type D1Database,
} from "./room-storage";
import {
  normalizeCode,
  validCode,
  validatePostAction,
  readJsonBodyWithinLimit,
  type SessionDescription,
} from "./validation";

const ROOM_LIFETIME_MS = 10 * 60 * 1000;
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
    const body = await readJsonBodyWithinLimit(request);
    const action = body.action;
    const validationError = validatePostAction(body);
    if (validationError) return response({ error: validationError }, 400);
    const now = Date.now();
    await ensureSchema(db);

    if (action === "create") {
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
    const url = new URL(request.url);
    const code = normalizeCode(url.searchParams.get("code"));
    const hostToken = url.searchParams.get("hostToken") || "";
    if (!validCode(code)) return response({ error: "invalid_room" }, 400);

    const now = Date.now();
    await ensureSchema(db);
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
    const offer = room.offer
      ? (JSON.parse(room.offer) as SessionDescription | null)
      : null;
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
