import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const activeChildren = new Set();

function stopActiveChildren() {
  for (const child of activeChildren) child.kill();
}

function runNodeScript(label, scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: repositoryRoot,
      stdio: "inherit"
    });
    activeChildren.add(child);
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      activeChildren.delete(child);
      if (error) reject(error);
      else resolve();
    };

    child.once("error", (error) => {
      stopActiveChildren();
      finish(new Error(`${label} failed to start: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }
      stopActiveChildren();
      finish(new Error(
        `${label} failed with ${signal ? `signal ${signal}` : `code ${code}`}`,
      ));
    });
  });
}

const parallelSteps = [
  ["arena appearance", path.join(gameDirectory, "arena-appearance", "build-arena-appearance.mjs")],
  ["champion SFX", path.join(repositoryRoot, "champions", "package-champion-sfx.mjs")],
];

const results = await Promise.allSettled(
  parallelSteps.map(([label, scriptPath]) => runNodeScript(label, scriptPath)),
);
const failures = results.flatMap((result, index) => (
  result.status === "rejected"
    ? [`${parallelSteps[index][0]}: ${result.reason instanceof Error ? result.reason.message : result.reason}`]
    : []
));
if (failures.length > 0) {
  throw new Error(`Parallel runtime build failed:\n${failures.join("\n")}`);
}

await runNodeScript("riftbomb assembly", path.join(gameDirectory, "assemble-riftbomb.mjs"));
console.log("Built arena appearance and champion SFX in parallel before assembly.");
