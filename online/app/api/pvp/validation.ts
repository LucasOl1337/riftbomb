export const MAX_SDP_LENGTH = 32_000;
// PVP_BODY_LIMIT_V1: bound chunked bodies before JSON.parse/request materialization.
export const MAX_REQUEST_BODY_BYTES = MAX_SDP_LENGTH * 2;
const UTF8_DECODER = new TextDecoder();

export type SessionDescription = {
  type: "offer" | "answer";
  sdp: string;
};

export function validDescription(
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

export function normalizeCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function validCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}

export async function readJsonBodyWithinLimit(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    throw new Error("payload_too_large");
  }
  const body = request.body;
  if (!body) {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid_body");
    }
    return value as Record<string, unknown>;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The request is already rejected; a failing cancellation must not
          // replace the stable public payload-too-large error.
        }
        throw new Error("payload_too_large");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = JSON.parse(UTF8_DECODER.decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_body");
  }
  return value as Record<string, unknown>;
}

export function validatePostAction(body: Record<string, unknown>): string | null {
  const action = body.action;

  if (action === "create") {
    return body.offer !== undefined && !validDescription(body.offer, "offer")
      ? "invalid_offer"
      : null;
  }

  if (action === "publish-offer") {
    const code = normalizeCode(body.code);
    const hostToken = typeof body.hostToken === "string" ? body.hostToken : "";
    return !validCode(code) || hostToken.length < 32 || !validDescription(body.offer, "offer")
      ? "invalid_offer"
      : null;
  }

  if (action === "answer") {
    const code = normalizeCode(body.code);
    return !validCode(code) || !validDescription(body.answer, "answer")
      ? "invalid_answer"
      : null;
  }

  if (action === "close") {
    const code = normalizeCode(body.code);
    const hostToken = typeof body.hostToken === "string" ? body.hostToken : "";
    return !validCode(code) || hostToken.length < 32 ? "invalid_room" : null;
  }

  return "unknown_action";
}
