import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocket } from "ws";

const RUNS = Number(process.env.BOOT_BENCH_RUNS || 9);
const TIMEOUT_MS = 5_000;
const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const duelRuntimePath = fileURLToPath(
  new URL("../../../game/create-authoritative-duel.mjs", import.meta.url)
);

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function openUntil(port, hello, expectedType) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`first match timed out waiting for ${expectedType}`));
    }, TIMEOUT_MS);
    socket.on("open", () => socket.send(JSON.stringify(hello)));
    socket.on("message", (data) => {
      const message = JSON.parse(data);
      if (message.type !== expectedType) return;
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function measureFirstMatch(port) {
  const host = await openUntil(port, {
    type: "hello",
    room: "ABC234",
    role: "host"
  }, "connected");
  let guest;
  try {
    const startedAt = performance.now();
    guest = await openUntil(port, {
      type: "hello",
      room: "ABC234",
      role: "guest",
      ready: true
    }, "start");
    return performance.now() - startedAt;
  } finally {
    host.terminate();
    guest?.terminate();
  }
}

async function measureBoot(index, eager) {
  const startedAt = performance.now();
  const port = 20_000 + process.pid % 8_000 + index * 2 + Number(eager);
  const imports = [
    eager ? `await import(${JSON.stringify(pathToFileURL(duelRuntimePath).href)});` : "",
    `await import(${JSON.stringify(pathToFileURL(serverPath).href)});`
  ].join("");
  const child = spawn(process.execPath, ["--input-type=module", "--eval", imports], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    const bootMs = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`boot timed out: ${stderr.trim()}`));
      }, TIMEOUT_MS);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (!chunk.includes("Riftbomb authoritative server listening")) return;
        clearTimeout(timeout);
        resolve(performance.now() - startedAt);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`server exited with ${code}: ${stderr.trim()}`));
      });
    });
    return { bootMs, firstMatchMs: await measureFirstMatch(port) };
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
  }
}

const eagerSamplesMs = [];
const lazySamplesMs = [];
for (let index = 0; index < RUNS; index += 1) {
  const order = index % 2 === 0 ? [true, false] : [false, true];
  for (const eager of order) {
    const sample = await measureBoot(index, eager);
    (eager ? eagerSamplesMs : lazySamplesMs).push(sample);
  }
}

const eagerBoot = eagerSamplesMs.map(({ bootMs }) => bootMs);
const lazyBoot = lazySamplesMs.map(({ bootMs }) => bootMs);
const eagerMatch = eagerSamplesMs.map(({ firstMatchMs }) => firstMatchMs);
const lazyMatch = lazySamplesMs.map(({ firstMatchMs }) => firstMatchMs);
const eagerMedian = percentile(eagerBoot, 0.5);
const lazyMedian = percentile(lazyBoot, 0.5);
const summarize = (values) => ({
  samplesMs: values.map((value) => Number(value.toFixed(3))),
  medianMs: Number(percentile(values, 0.5).toFixed(3)),
  p95Ms: Number(percentile(values, 0.95).toFixed(3))
});

console.log(JSON.stringify({
  runsPerMode: RUNS,
  eager: {
    boot: summarize(eagerBoot),
    firstMatch: summarize(eagerMatch)
  },
  lazy: {
    boot: summarize(lazyBoot),
    firstMatch: summarize(lazyMatch)
  },
  medianDeltaMs: Number((lazyMedian - eagerMedian).toFixed(3)),
  medianDeltaPercent: Number((((lazyMedian / eagerMedian) - 1) * 100).toFixed(2))
}, null, 2));
