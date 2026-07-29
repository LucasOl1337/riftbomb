import assert from "node:assert/strict";
import test from "node:test";

import { createPersistedRoom } from "../app/api/pvp/room-storage.ts";

function createInstrumentedDatabase(insertChanges = [1]) {
  const calls = [];
  let remoteCalls = 0;
  let insertIndex = 0;

  function resultFor(statement) {
    const isInsert = statement.sql.startsWith("INSERT OR IGNORE");
    return {
      success: true,
      meta: { changes: isInsert ? (insertChanges[insertIndex++] ?? 0) : 0 },
    };
  }

  return {
    calls,
    get remoteCalls() {
      return remoteCalls;
    },
    prepare(sql) {
      const statement = {
        sql: sql.trim(),
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first() {
          throw new Error("not implemented by this test double");
        },
        async run() {
          remoteCalls += 1;
          calls.push({ kind: "run", statements: [statement] });
          return resultFor(statement);
        },
      };
      return statement;
    },
    async batch(statements) {
      remoteCalls += 1;
      calls.push({ kind: "batch", statements });
      return statements.map(resultFor);
    },
  };
}

const options = {
  now: 1_000,
  expiresAt: 601_000,
  hostToken: "host-token",
  offer: '{"type":"offer","sdp":"test"}',
};

test("creates a room with cleanup and insert in one D1 call", async () => {
  const db = createInstrumentedDatabase();
  const code = await createPersistedRoom(db, {
    ...options,
    createCode: () => "ABC234",
  });

  assert.equal(code, "ABC234");
  assert.equal(db.remoteCalls, 1);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].kind, "batch");
  assert.match(db.calls[0].statements[0].sql, /^DELETE FROM pvp_rooms/);
  assert.deepEqual(db.calls[0].statements[0].values, [options.now]);
  assert.match(db.calls[0].statements[1].sql, /^INSERT OR IGNORE INTO pvp_rooms/);
  assert.deepEqual(db.calls[0].statements[1].values, [
    "ABC234",
    options.hostToken,
    options.offer,
    options.now,
    options.expiresAt,
  ]);
});

test("retries a code collision without repeating cleanup", async () => {
  const db = createInstrumentedDatabase([0, 1]);
  const codes = ["ABC234", "DEF567"];
  const code = await createPersistedRoom(db, {
    ...options,
    createCode: () => codes.shift(),
  });

  assert.equal(code, "DEF567");
  assert.equal(db.remoteCalls, 2);
  assert.deepEqual(db.calls.map((call) => call.kind), ["batch", "run"]);
  assert.equal(
    db.calls.flatMap((call) => call.statements).filter((statement) =>
      statement.sql.startsWith("DELETE FROM pvp_rooms"),
    ).length,
    1,
  );
});
