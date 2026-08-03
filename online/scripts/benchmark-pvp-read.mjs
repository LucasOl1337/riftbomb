import { DatabaseSync } from "node:sqlite";

const LEGACY_SQL =
  "SELECT host_token, offer, answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";
const HOST_SQL =
  "SELECT host_token = ? AS is_host, answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";
const HOST_CONDITIONAL_SQL =
  "SELECT host_token = ? AS is_host, CASE WHEN host_token = ? THEN answer ELSE NULL END AS answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";
const GUEST_SQL =
  "SELECT offer, answer IS NOT NULL AS has_answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";
const GUEST_CONDITIONAL_SQL =
  "SELECT CASE WHEN answer IS NULL THEN offer ELSE NULL END AS offer, answer IS NOT NULL AS has_answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";

const database = new DatabaseSync(":memory:");
database.exec(`
  CREATE TABLE pvp_rooms (
    code TEXT PRIMARY KEY NOT NULL,
    host_token TEXT NOT NULL,
    offer TEXT NOT NULL,
    answer TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    guest_joined_at INTEGER
  )
`);

const hostToken = "a".repeat(48);
const offer = JSON.stringify({ type: "offer", sdp: "o".repeat(32_000) });
const answer = JSON.stringify({ type: "answer", sdp: "a".repeat(32_000) });
database
  .prepare(
    "INSERT INTO pvp_rooms (code, host_token, offer, answer, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
  .run("ABC234", hostToken, offer, answer, 1_000, 601_000);
database
  .prepare(
    "INSERT INTO pvp_rooms (code, host_token, offer, answer, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
  .run("DEF567", hostToken, offer, null, 1_000, 601_000);

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function planFor(sql, parameters) {
  return database
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...parameters)
    .map((row) => row.detail);
}

for (let run = 1; run <= 3; run += 1) {
  const legacy = database.prepare(LEGACY_SQL).get("ABC234", 1_000);
  const host = database.prepare(HOST_SQL).get(hostToken, "ABC234", 1_000);
  const hostInvalid = database
    .prepare(HOST_SQL)
    .get("wrong-token", "ABC234", 1_000);
  const hostConditional = database
    .prepare(HOST_CONDITIONAL_SQL)
    .get(hostToken, hostToken, "ABC234", 1_000);
  const hostInvalidConditional = database
    .prepare(HOST_CONDITIONAL_SQL)
    .get("wrong-token", "wrong-token", "ABC234", 1_000);
  const guest = database.prepare(GUEST_SQL).get("ABC234", 1_000);
  const guestConditional = database
    .prepare(GUEST_CONDITIONAL_SQL)
    .get("ABC234", 1_000);
  const guestWaiting = database
    .prepare(GUEST_CONDITIONAL_SQL)
    .get("DEF567", 1_000);

  console.log(
    JSON.stringify({
      run,
      before: { materializedBytes: byteLength(legacy), calls: 1 },
      hostAfter: { materializedBytes: byteLength(host), calls: 1 },
      hostInvalidBefore: {
        materializedBytes: byteLength(hostInvalid),
        calls: 1,
      },
      hostConditionalAfter: {
        materializedBytes: byteLength(hostConditional),
        calls: 1,
      },
      hostInvalidConditionalAfter: {
        materializedBytes: byteLength(hostInvalidConditional),
        calls: 1,
      },
      guestAfter: { materializedBytes: byteLength(guest), calls: 1 },
      guestConditionalAfter: {
        materializedBytes: byteLength(guestConditional),
        calls: 1,
      },
      guestWaitingAfter: { materializedBytes: byteLength(guestWaiting), calls: 1 },
      plans: {
        before: planFor(LEGACY_SQL, ["ABC234", 1_000]),
        hostAfter: planFor(HOST_SQL, [hostToken, "ABC234", 1_000]),
        hostConditionalAfter: planFor(HOST_CONDITIONAL_SQL, [
          hostToken,
          hostToken,
          "ABC234",
          1_000,
        ]),
        guestAfter: planFor(GUEST_SQL, ["ABC234", 1_000]),
        guestConditionalAfter: planFor(GUEST_CONDITIONAL_SQL, [
          "ABC234",
          1_000,
        ]),
      },
    }),
  );
}
