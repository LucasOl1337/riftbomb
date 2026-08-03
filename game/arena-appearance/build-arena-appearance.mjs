import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packagers = Object.freeze([
  "package-arena-appearance.mjs",
  "package-explosion-frames.mjs",
  "package-arena-sfx.mjs",
]);

function runPackager(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, scriptName)], {
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${scriptName} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
  });
}

const results = await Promise.allSettled(packagers.map(runPackager));
const failures = results.flatMap((result, index) =>
  result.status === "rejected"
    ? [`${packagers[index]}: ${result.reason instanceof Error ? result.reason.message : result.reason}`]
    : [],
);

if (failures.length > 0) {
  throw new Error(`Arena packaging failed:\n${failures.join("\n")}`);
}

console.log(`Packaged ${packagers.length} independent arena bundles in parallel.`);
