import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(onlineRoot, "..");

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function buildRuntime() {
  const npmCli = process.env.npm_execpath;
  if (npmCli) {
    runNode([npmCli, "run", "build"], repositoryRoot);
    return;
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "build"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

buildRuntime();
runNode([path.join(scriptDir, "package-riftbomb.mjs"), "--root-build-ready"], onlineRoot);

const child = spawn(
  process.execPath,
  [
    path.join(onlineRoot, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
    "--strictPort",
  ],
  {
    cwd: onlineRoot,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.join(onlineRoot, ".wrangler", "wrangler.log"),
    },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => childExit(signal));
}

let stopping = false;
function childExit(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
