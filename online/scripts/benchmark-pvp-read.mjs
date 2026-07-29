import { DatabaseSync } from "node:sqlite";

const LEGACY_SQL =
  "SELECT host_token, offer, answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";
const HOST_SQL =
  "SELECT host_token = ? AS is_host, answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";
const GUEST_SQL =
  "SELECT offer, answer IS NOT NULL AS has_answer, expires_at FROM pvp_rooms WHERE code = ? AND expires_at >= ?";

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
  const guest = database.prepare(GUEST_SQL).get("ABC234", 1_000);

  console.log(
    JSON.stringify({
      run,
      before: { materializedBytes: byteLength(legacy), calls: 1 },
      hostAfter: { materializedBytes: byteLength(host), calls: 1 },
      guestAfter: { materializedBytes: byteLength(guest), calls: 1 },
      plans: {
        before: planFor(LEGACY_SQL, ["ABC234", 1_000]),
        hostAfter: planFor(HOST_SQL, [hostToken, "ABC234", 1_000]),
        guestAfter: planFor(GUEST_SQL, ["ABC234", 1_000]),
      },
    }),
  );
}
