import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../public/online-duel.js", import.meta.url);

function extract(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `${start} must exist`);
  assert.notEqual(to, -1, `${end} must follow ${start}`);
  return source.slice(from, to);
}

test("resume bearer is exactly 32 random bytes encoded as lowercase hex", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function createResumeToken", "  function validResumeToken");
  const createResumeToken = new Function(
    "RESUME_TOKEN_BYTES",
    `${declaration}; return createResumeToken;`
  )(32);
  const token = createResumeToken((bytes) => {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
  });
  assert.equal(token, Array.from({ length: 32 }, (_, index) =>
    index.toString(16).padStart(2, "0")).join(""));
  assert.match(token, /^[a-f0-9]{64}$/);
});

test("role_taken retry is bounded, selective and cancelable", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "async function retryRoleTaken", "  function createLatestSnapshotBuffer");
  const retryRoleTaken = new Function(
    "RESUME_ROLE_RETRY_DELAYS_MS",
    `${declaration}; return retryRoleTaken;`
  )([1, 2]);

  const waits = [];
  let attempts = 0;
  const result = await retryRoleTaken(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("role_taken");
    return "resumed";
  }, { delays: [5, 10], wait: async (delay) => waits.push(delay) });
  assert.equal(result, "resumed");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [5, 10]);

  let fatalAttempts = 0;
  await assert.rejects(retryRoleTaken(async () => {
    fatalAttempts += 1;
    throw new Error("resume_denied");
  }, { delays: [1, 1], wait: async () => {} }), /resume_denied/);
  assert.equal(fatalAttempts, 1, "credential failures must never be retried");

  let active = true;
  await assert.rejects(retryRoleTaken(async () => {
    throw new Error("role_taken");
  }, {
    delays: [1, 1],
    active: () => active,
    wait: async () => { active = false; }
  }), /resume_cancelled/);
});

test("only definitive resume rejection may discard the saved bearer", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function definitiveResumeFailure", "  async function retryRoleTaken");
  const definitiveResumeFailure = new Function(
    `${declaration}; return definitiveResumeFailure;`
  )();
  for (const message of [
    "resume_denied", "resume_expired", "room_not_found", "invalid_resume", "invalid_hello"
  ]) {
    assert.equal(definitiveResumeFailure(new Error(message)), true, message);
  }
  for (const message of [
    "role_taken", "authoritative_server_timeout", "authoritative_server_unavailable", "server_full"
  ]) {
    assert.equal(definitiveResumeFailure(new Error(message)), false, message);
  }
  const resume = extract(source, "async function tryResumeSession", "  function inputMask");
  assert.match(resume, /if \(credentialRejected\) clearSession\(\)/);
});

test("an ambiguous first hello failure preserves the pre-persisted bearer", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function definitiveResumeFailure", "  async function retryRoleTaken");
  const definitiveInitialConnectionFailure = new Function(
    `${declaration}; return definitiveInitialConnectionFailure;`
  )();
  for (const message of ["authoritative_server_timeout", "authoritative_server_unavailable", "server_full"]) {
    assert.equal(definitiveInitialConnectionFailure(new Error(message)), false, message);
  }
  for (const message of [
    "resume_denied", "resume_expired", "room_not_found", "invalid_resume", "role_taken", "room_full"
  ]) {
    assert.equal(definitiveInitialConnectionFailure(new Error(message)), true, message);
  }
  const failure = extract(source, "function failConnection", "  function resetConnection");
  assert.match(failure, /if \(definitiveInitialConnectionFailure\(error\)\) clearSession\(\)/);
});

test("snapshot boot buffer keeps newest state and ACK while carrying the first full grid", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function createLatestSnapshotBuffer", "  function createReliableInputStream");
  const createLatestSnapshotBuffer = new Function(
    `${declaration}; return createLatestSnapshotBuffer;`
  )();
  const buffer = createLatestSnapshotBuffer();
  const grid = [[0, 1], [1, 0]];
  assert.equal(buffer.push({ s: 41, grid, round: 2, input: { ack: [3, 4] } }), true);
  assert.equal(buffer.push({ s: 42, round: 3, input: { ack: [5, 6] } }), true);
  assert.equal(buffer.push({ s: 41, round: 99 }), false);
  assert.deepEqual(buffer.peek(), {
    s: 42,
    round: 3,
    input: { ack: [5, 6] },
    grid
  });
  assert.deepEqual(buffer.take(), {
    s: 42,
    round: 3,
    input: { ack: [5, 6] },
    grid
  });
  assert.equal(buffer.peek(), null);
});

test("snapshots synchronize delivery immediately but render only the coalesced state after boot", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const bufferDeclaration = extract(
    source,
    "function createLatestSnapshotBuffer",
    "  function createReliableInputStream"
  );
  const receiveDeclaration = extract(source, "function receiveSnapshot", "  function applySnapshot");
  const createLatestSnapshotBuffer = new Function(
    `${bufferDeclaration}; return createLatestSnapshotBuffer;`
  )();
  const bufferedSnapshots = createLatestSnapshotBuffer();
  const state = { resuming: true, receivedSequence: 0, role: "guest" };
  const game = { mode: "intro" };
  const synchronized = [];
  const applied = [];
  const receiveSnapshot = new Function(
    "state",
    "game",
    "reliableInput",
    "localOnlinePlayerId",
    "bufferedSnapshots",
    "applySnapshot",
    "runtimeBootRecord",
    `${receiveDeclaration}; return receiveSnapshot;`
  )(
    state,
    game,
    {
      currentEpoch: () => 7,
      synchronize: (input) => synchronized.push(input.ack[1])
    },
    () => 2,
    bufferedSnapshots,
    (snapshot) => applied.push(snapshot),
    null
  );
  const players = [{ id: 1 }, { id: 2 }];
  receiveSnapshot({ v: 3, s: 41, players, grid: [[7]], input: { ack: [0, 4] } });
  receiveSnapshot({ v: 3, s: 42, players, round: 9, input: { ack: [0, 5] } });
  assert.deepEqual(synchronized, [4, 5]);
  assert.deepEqual(applied, []);

  state.resuming = false;
  game.mode = "playing";
  receiveSnapshot(bufferedSnapshots.take());
  assert.equal(applied.length, 1);
  assert.equal(applied[0].s, 42);
  assert.equal(applied[0].round, 9);
  assert.deepEqual(applied[0].grid, [[7]]);
});

test("duplicate controls for one input epoch share a single asynchronous runtime boot", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declarations = extract(source, "function messageInputEpoch", "  function connectAuthoritative");
  let releaseBoot;
  const bootBarrier = new Promise((resolve) => { releaseBoot = resolve; });
  let bootCount = 0;
  const game = { mode: "intro" };
  const state = { role: "guest" };
  const runtime = new Function(
    "game",
    "state",
    "beginConfiguredGame",
    "returnToIntroUi",
    `
      let lifecycleGeneration = 3;
      let matchRuntimeEpoch = 0;
      let runtimeBootRecord = null;
      let runtimeBootTail = Promise.resolve();
      ${declarations}
      return { ensureOnlineMatchRuntime };
    `
  )(
    game,
    state,
    async () => {
      bootCount += 1;
      await bootBarrier;
      game.mode = "playing";
    },
    () => {}
  );
  const control = { type: "resume", input: { epoch: 12 } };
  const first = runtime.ensureOnlineMatchRuntime(control, 3);
  const duplicate = runtime.ensureOnlineMatchRuntime(control, 3);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bootCount, 1);
  releaseBoot();
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true]);
  assert.equal(bootCount, 1);

  game.mode = "matchover";
  await runtime.ensureOnlineMatchRuntime({ type: "rematch" }, 3);
  assert.equal(bootCount, 2);
  await runtime.ensureOnlineMatchRuntime({ type: "rematch" }, 3);
  assert.equal(bootCount, 2, "a late duplicate legacy rematch must reuse the active epoch");
});

test("quick pending resume persists before handshake and reuses the exact bearer after reload", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declarations = extract(source, "function savePendingResume", "  function returnToIntroUi");
  const values = new Map();
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const token = "ab".repeat(32);
  const build = (state) => new Function(
    "state",
    "sessionStorage",
    "PENDING_RESUME_KEY",
    "validResumeToken",
    "clearPendingResume",
    "saveSession",
    "createResumeToken",
    `${declarations}; return { ensureResumeToken, readPendingResume, savePendingResume };`
  )(
    state,
    sessionStorage,
    "pending",
    (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    () => values.delete("pending"),
    () => {},
    () => { throw new Error("must reuse pending token"); }
  );

  const firstPage = {
    resumeToken: token,
    quickMatch: true,
    roomCode: "",
    hostChampion: "katarina",
    arena: "lattice"
  };
  build(firstPage).savePendingResume();
  assert.equal(JSON.parse(values.get("pending")).resumeToken, token);

  const reloadedPage = { ...firstPage, resumeToken: "" };
  const reloaded = build(reloadedPage);
  assert.equal(reloaded.ensureResumeToken(), token);
  assert.equal(reloadedPage.resumeToken, token);
  assert.equal(JSON.parse(values.get("pending")).resumeToken, token);
});

test("resume secret stays out of bridge, URL and log paths", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const bridge = extract(source, "function clientStateSnapshot", "  function publishClientState");
  const resume = extract(source, "async function tryResumeSession", "  function inputMask");
  const connection = extract(source, "function connectAuthoritative", "  async function onConnected");
  assert.doesNotMatch(bridge, /resumeToken/);
  assert.doesNotMatch(resume, /signaling\(|joinRoom\(/);
  assert.match(resume, /connectAuthoritative\(saved\.role/);
  assert.match(connection, /resumeToken/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*resumeToken/);
  assert.doesNotMatch(source, /searchParams\.set\([^\n]*resumeToken/);
});

test("iframe ready publication preserves the saved session until auto-resume", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function publishClientState", "  function clearSession");
  const calls = [];
  const frame = {
    parent: { postMessage: (message) => calls.push(["post", message.reason]) },
    location: { origin: "https://example.test" }
  };
  const publishClientState = new Function(
    "window",
    "RUNTIME_SOURCE",
    "CLIENT_BRIDGE_VERSION",
    "clientStateSnapshot",
    "saveSession",
    `${declaration}; return publishClientState;`
  )(
    frame,
    "runtime",
    1,
    () => ({ role: "offline" }),
    () => calls.push(["save"])
  );

  publishClientState("ready");
  assert.deepEqual(calls, [["post", "ready"]],
    "startup must not erase the credential before the 120 ms auto-resume");
  publishClientState("update");
  assert.deepEqual(calls.at(-1), ["save"]);
});

test("offline startup status cannot erase a saved credential", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function saveSession", "  function readSession");
  const values = new Map([["session", "protected-credential"]]);
  const saveSession = new Function(
    "state",
    "sessionStorage",
    "SESSION_KEY",
    "clearSavedSession",
    `${declaration}; return saveSession;`
  )(
    { role: "offline", roomCode: "" },
    { setItem: (key, value) => values.set(key, value) },
    "session",
    () => values.delete("session")
  );
  saveSession();
  assert.equal(values.get("session"), "protected-credential");
});

test("a challenge URL matching the saved room chooses resume instead of a fresh join", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const declaration = extract(source, "function sessionMatchesRoom", "  function savePendingResume");
  const sessionMatchesRoom = new Function(
    `${declaration}; return sessionMatchesRoom;`
  )();
  assert.equal(sessionMatchesRoom({ roomCode: "ABC234" }, "abc234"), true);
  assert.equal(sessionMatchesRoom({ roomCode: "ABC234" }, "XYZ567"), false);

  const startup = extract(source, "const parentRoom =", "  document.querySelector");
  assert.match(startup, /const resumeParentSession = sessionMatchesRoom\(startupSession, parentRoom\)/);
  assert.match(startup, /if \(resumeParentSession\)/);
  assert.match(source, /if \(parentRoom && !resumeParentSession\) return;/);
});

test("canceling Quick Match settles a pending connection attempt", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const cancel = extract(source, "function cancelQuickMatch", "  function setStatus");
  assert.match(cancel, /pendingConnectCancel\?\.\(\)/);
  assert.match(cancel, /pendingConnectCancel = null/);
  assert.ok(cancel.indexOf("pendingConnectCancel?.()") < cancel.indexOf("state.socket = null"));
});

test("starting Quick Match replaces only the old saved room before persisting pending state", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = extract(source, "async function startQuickMatch", "  async function createRoom");
  assert.ok(start.indexOf("clearSavedSession()") < start.indexOf("connectAuthoritative"));
  assert.ok(start.indexOf("clearPendingResume()") < start.indexOf("connectAuthoritative"));
  const readSession = extract(source, "function readSession", "  function sessionMatchesRoom");
  const readPending = extract(source, "function readPendingResume", "  function ensureResumeToken");
  assert.doesNotMatch(readSession, /SESSION_MAX_AGE_MS|Date\.now\(\) -/);
  assert.doesNotMatch(readPending, /SESSION_MAX_AGE_MS|Date\.now\(\) -/);
});

test("confirmed lobbies resume only their existing protected seat", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const connection = extract(source, "function connectAuthoritative", "  async function onConnected");
  assert.match(connection, /resumeOnly: resume && \(\s*resumePhase === "match" \|\| state\.sessionConfirmed\s*\)/);
  assert.match(connection, /const wasConfirmed = state\.sessionConfirmed;\s*state\.sessionConfirmed = true/);
  assert.match(connection, /freshLobbyClaim = resume && resumePhase === "lobby" && !wasConfirmed/);

  const persistence = extract(source, "function saveSession", "  function readSession");
  assert.match(persistence, /confirmed: Boolean\(state\.sessionConfirmed\)/);
  const resume = extract(source, "async function tryResumeSession", "  function inputMask");
  assert.match(resume, /state\.sessionConfirmed = saved\.confirmed === true/);
});

test("presence recovery clears the rival disconnect state", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const connection = extract(source, "function connectAuthoritative", "  async function onConnected");
  assert.match(connection, /if \(message\.type === "presence"\)/);
  assert.match(connection, /message\.playerId === localOnlinePlayerId\(\)/);
  assert.match(connection, /state\.rivalConnected = message\.connected === true/);
  assert.match(connection, /Player \$\{message\.playerId\} reconnected\. Match continues\./);
});

test("explicit leave revokes the protected server seat before local cleanup", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const release = extract(source, "function releaseCurrentSeat", "  function receiveSnapshot");
  assert.match(release, /sendControl\(\{ type: "leave" \}\)/);
  const leave = extract(source, "function leaveOnlineSession", "  function cancelQuickMatch");
  assert.ok(leave.indexOf("releaseCurrentSeat()") < leave.indexOf("state.socket?.close()"));
  for (const [start, end] of [
    ["async function startQuickMatch", "  async function createRoom"],
    ["async function createRoom", "  async function joinRoom"],
    ["async function joinRoom", "  function failConnection"],
    ["function chooseOffline", "  async function tryResumeSession"]
  ]) {
    const flow = extract(source, start, end);
    assert.ok(flow.indexOf("releaseCurrentSeat()") < flow.indexOf("resetConnection()"), start);
  }
  const control = extract(source, "function handleControl", "  function updatePresetSummary");
  assert.match(control, /message\.type === "room-closed"/);
  assert.match(control, /clearSession\(\)/);
});
