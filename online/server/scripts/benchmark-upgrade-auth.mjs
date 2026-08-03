import { performance } from "node:perf_hooks";
import { connect } from "node:net";

process.env.PORT = "0";
process.env.GAME_SERVER_PROXY_SECRET = "benchmark-proxy-secret";

const { server, closeAuthoritativeServer, webSocketRuntimeSnapshot } =
  await import(`../src/server.mjs?benchmark=upgrade-auth-${Date.now()}`);

await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

function rejectUnauthorizedUpgrade(port) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let response = "";
    const startedAt = performance.now();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("upgrade response timed out"));
    }, 1_000);
    const finish = () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({
        status: response.split("\r\n", 1)[0],
        elapsedMs: performance.now() - startedAt
      });
    };
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.includes("\r\n\r\n")) finish();
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.on("connect", () => {
      socket.write([
        "GET /ws HTTP/1.1",
        "Host: 127.0.0.1",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGVzdC1rZXktZm9yLWF1dGg=",
        "x-riftbomb-proxy: wrong-proxy-secret",
        "",
        ""
      ].join("\r\n"));
    });
  });
}

const samples = [];
for (let warmup = 0; warmup < 2; warmup += 1) {
  await rejectUnauthorizedUpgrade(server.address().port);
}
for (let run = 0; run < 9; run += 1) {
  samples.push(await rejectUnauthorizedUpgrade(server.address().port));
}

const statuses = new Set(samples.map(({ status }) => status));
const runtime = webSocketRuntimeSnapshot();
console.log(JSON.stringify({
  runs: samples.length,
  status: [...statuses],
  medianRejectedUpgradeMs: Number(median(samples.map(({ elapsedMs }) => elapsedMs)).toFixed(3)),
  samples: samples.map(({ elapsedMs }) => Number(elapsedMs.toFixed(3))),
  transportRuntimeLoads: runtime.loaded ? 1 : 0,
  transportServerCreated: runtime.serverCreated,
  legacyFirstRejectRuntimeLoads: 1,
  runtimeLoadsAvoided: runtime.loaded ? 0 : 1,
  responsePreserved: statuses.size === 1 && statuses.has("HTTP/1.1 401 Unauthorized")
}, null, 2));

closeAuthoritativeServer();
