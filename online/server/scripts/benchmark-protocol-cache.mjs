import { performance } from "node:perf_hooks";
import {
  AuthoritativeRooms,
  invalidateProtocolCache
} from "../src/authoritative-rooms.mjs";

const ROOM_COUNT = 128;
const ITERATIONS = 10_000;
const REPEATS = 3;

function createFixture() {
  const rooms = new Map();
  const manager = new AuthoritativeRooms({ rooms, transport: { broadcast() {} } });
  for (let index = 0; index < ROOM_COUNT; index += 1) {
    const room = manager.create(`CACHE${index.toString().padStart(3, "0")}`, {});
    room.inputEpoch = 1;
    room.game = {};
  }
  return { manager, rooms: [...rooms.values()] };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function legacyInputProtocol(room) {
  return {
    v: 1,
    epoch: room.inputEpoch,
    accepted: room.inputAccepted.slice(),
    ack: room.inputApplied.slice()
  };
}

function legacyActionProtocol(room) {
  return {
    v: 1,
    epoch: room.inputEpoch,
    ack: room.actionAck.slice()
  };
}

function runSample(churn, cached) {
  const { manager, rooms } = createFixture();
  const previous = rooms.map(() => ({
    input: null,
    accepted: null,
    action: null,
    ack: null
  }));
  let checksum = 0;

  for (const room of rooms) {
    if (cached) {
      manager.inputProtocol(room);
      manager.actionProtocol(room);
    } else {
      legacyInputProtocol(room);
      legacyActionProtocol(room);
    }
  }

  const materialized = {
    inputEnvelopes: 0,
    inputArrays: 0,
    actionEnvelopes: 0,
    actionArrays: 0
  };
  const startedAt = performance.now();
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex += 1) {
      const room = rooms[roomIndex];
      if (churn) {
        room.inputAccepted[0] = iteration + 1;
        if (cached) invalidateProtocolCache(room, "input");
        if (iteration % 2 === 0) {
          room.actionAck[0] = iteration + 1;
          if (cached) invalidateProtocolCache(room, "action");
        }
      }
      const input = cached
        ? manager.inputProtocol(room)
        : legacyInputProtocol(room);
      const action = cached
        ? manager.actionProtocol(room)
        : legacyActionProtocol(room);
      const last = previous[roomIndex];
      if (input !== last.input) materialized.inputEnvelopes += 1;
      if (input.accepted !== last.accepted) materialized.inputArrays += 1;
      if (action !== last.action) materialized.actionEnvelopes += 1;
      if (action.ack !== last.ack) materialized.actionArrays += 1;
      previous[roomIndex] = {
        input,
        accepted: input.accepted,
        action,
        ack: action.ack
      };
      checksum += input.accepted[0] + action.ack[0];
    }
  }
  return {
    ms: performance.now() - startedAt,
    ...materialized,
    checksum
  };
}

for (const [name, churn] of [["stable", false], ["cursor-churn", true]]) {
  const baselineSamples = Array.from(
    { length: REPEATS },
    () => runSample(churn, false)
  );
  const cachedSamples = Array.from(
    { length: REPEATS },
    () => runSample(churn, true)
  );
  console.log(JSON.stringify({
    mode: name,
    rooms: ROOM_COUNT,
    iterations: ITERATIONS,
    baseline: {
      samples: baselineSamples,
      medianMs: median(baselineSamples.map(({ ms }) => ms))
    },
    cached: {
      samples: cachedSamples,
      medianMs: median(cachedSamples.map(({ ms }) => ms))
    }
  }));
}
