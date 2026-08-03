import { performance } from "node:perf_hooks";

import {
  normalizeCode,
  validCode,
  validatePostAction,
} from "../app/api/pvp/validation.ts";

const SIMULATED_SCHEMA_CALL_MS = 20;

function createDatabase() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async ensureSchema() {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_SCHEMA_CALL_MS));
    },
  };
}

async function legacyInvalidPost(db, body) {
  await db.ensureSchema();
  return validatePostAction(body);
}

async function optimizedInvalidPost(db, body) {
  const error = validatePostAction(body);
  if (error) return error;
  await db.ensureSchema();
  return null;
}

async function legacyInvalidGet(db, rawCode) {
  await db.ensureSchema();
  return validCode(normalizeCode(rawCode)) ? null : "invalid_room";
}

async function optimizedInvalidGet(db, rawCode) {
  const code = normalizeCode(rawCode);
  if (!validCode(code)) return "invalid_room";
  await db.ensureSchema();
  return null;
}

async function legacyValidPost(db, body) {
  await db.ensureSchema();
  return validatePostAction(body);
}

async function optimizedValidPost(db, body) {
  const error = validatePostAction(body);
  if (error) return error;
  await db.ensureSchema();
  return null;
}

async function legacyValidGet(db, rawCode) {
  await db.ensureSchema();
  return validCode(normalizeCode(rawCode)) ? null : "invalid_room";
}

async function optimizedValidGet(db, rawCode) {
  const code = normalizeCode(rawCode);
  if (!validCode(code)) return "invalid_room";
  await db.ensureSchema();
  return null;
}

const invalidPost = {
  action: "publish-offer",
  code: "bad",
  hostToken: "short",
  offer: { type: "offer", sdp: "invalid" },
};
const validPost = { action: "create" };

async function measurePair(legacy, optimized, input) {
  const legacyDb = createDatabase();
  const legacyStart = performance.now();
  await legacy(legacyDb, input);
  const legacyMs = performance.now() - legacyStart;

  const optimizedDb = createDatabase();
  const optimizedStart = performance.now();
  await optimized(optimizedDb, input);
  const optimizedMs = performance.now() - optimizedStart;

  return {
    before: { calls: legacyDb.calls, milliseconds: Number(legacyMs.toFixed(2)) },
    after: { calls: optimizedDb.calls, milliseconds: Number(optimizedMs.toFixed(2)) },
  };
}

for (let run = 1; run <= 3; run += 1) {
  console.log(
    JSON.stringify({
      run,
      simulatedSchemaCallMs: SIMULATED_SCHEMA_CALL_MS,
      invalidPost: await measurePair(legacyInvalidPost, optimizedInvalidPost, invalidPost),
      invalidGet: await measurePair(legacyInvalidGet, optimizedInvalidGet, "bad"),
      validPost: await measurePair(legacyValidPost, optimizedValidPost, validPost),
      validGet: await measurePair(legacyValidGet, optimizedValidGet, "ABC234"),
    }),
  );
}
