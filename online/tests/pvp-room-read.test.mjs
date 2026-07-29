import assert from "node:assert/strict";
import test from "node:test";

import {
  readPersistedGuestRoom,
  readPersistedHostRoom,
} from "../app/api/pvp/room-storage.ts";

function createDatabase(result) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first() {
          calls.push(statement);
          return result;
        },
        async run() {
          throw new Error("not used by this test double");
        },
      };
      return statement;
    },
    async batch() {
      throw new Error("not used by this test double");
    },
  };
}

test("host lookup returns only authorization, answer, and expiry", async () => {
  const expected = { is_host: 1, answer: "answer-sdp", expires_at: 601_000 };
  const db = createDatabase(expected);

  assert.deepEqual(
    await readPersistedHostRoom(db, "ABC234", "host-token", 1_000),
    expected,
  );
  assert.equal(db.calls.length, 1);
  assert.match(
    db.calls[0].sql,
    /^SELECT host_token = \? AS is_host, answer, expires_at /,
  );
  assert.doesNotMatch(db.calls[0].sql, /\boffer\b/);
  assert.deepEqual(db.calls[0].values, ["host-token", "ABC234", 1_000]);
});

test("guest lookup returns only offer, answer presence, and expiry", async () => {
  const expected = { offer: "offer-sdp", has_answer: 1, expires_at: 601_000 };
  const db = createDatabase(expected);

  assert.deepEqual(await readPersistedGuestRoom(db, "ABC234", 1_000), expected);
  assert.equal(db.calls.length, 1);
  assert.match(
    db.calls[0].sql,
    /^SELECT offer, answer IS NOT NULL AS has_answer, expires_at /,
  );
  assert.doesNotMatch(db.calls[0].sql, /\bhost_token\b/);
  assert.deepEqual(db.calls[0].values, ["ABC234", 1_000]);
});
