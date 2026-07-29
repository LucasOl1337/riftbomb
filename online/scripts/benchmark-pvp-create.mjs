import { performance } from "node:perf_hooks";

import { createPersistedRoom } from "../app/api/pvp/room-storage.ts";

const SIMULATED_D1_CALL_MS = 20;

function waitForDatabase() {
  return new Promise((resolve) => setTimeout(resolve, SIMULATED_D1_CALL_MS));
}

function createDatabase() {
  let calls = 0;
  const database = {
    get calls() {
      return calls;
    },
    prepare(sql) {
      const statement = {
        sql,
        bind() {
          return statement;
        },
        async first() {
          throw new Error("not used by this benchmark");
        },
        async run() {
          calls += 1;
          await waitForDatabase();
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      calls += 1;
      await waitForDatabase();
      return statements.map((statement) => ({
        success: true,
        meta: { changes: statement.sql.startsWith("INSERT") ? 1 : 0 },
      }));
    },
  };
  return database;
}

async function legacyCreate(db) {
  await db.prepare("DELETE FROM pvp_rooms WHERE expires_at < ?").bind(1).run();
  await db.prepare("INSERT OR IGNORE INTO pvp_rooms").bind().run();
}

async function optimizedCreate(db) {
  await createPersistedRoom(db, {
    now: 1,
    expiresAt: 2,
    hostToken: "token",
    offer: "null",
    createCode: () => "ABC234",
  });
}

for (let run = 1; run <= 3; run += 1) {
  const legacyDb = createDatabase();
  const legacyStart = performance.now();
  await legacyCreate(legacyDb);
  const legacyMs = performance.now() - legacyStart;

  const optimizedDb = createDatabase();
  const optimizedStart = performance.now();
  await optimizedCreate(optimizedDb);
  const optimizedMs = performance.now() - optimizedStart;

  console.log(
    JSON.stringify({
      run,
      simulatedCallMs: SIMULATED_D1_CALL_MS,
      before: { calls: legacyDb.calls, milliseconds: Number(legacyMs.toFixed(2)) },
      after: { calls: optimizedDb.calls, milliseconds: Number(optimizedMs.toFixed(2)) },
    }),
  );
}
