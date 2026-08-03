/**
 * STAGE_RELEASE_V1 — package Oracle install layout for install-ubuntu.sh.
 *
 * install-ubuntu expects:
 *   $release_dir/game/
 *   $release_dir/online/server/  (with package-lock.json, src/, deploy/)
 *
 * Usage (from online/server or any cwd):
 *   node deploy/stage-release.mjs
 *   node deploy/stage-release.mjs --out /tmp/riftbomb-release
 *   node deploy/stage-release.mjs --dry-run
 *   node deploy/stage-release.mjs --tarball
 *
 * Windows GNU tar needs --force-local for drive-letter destinations.
 */
import { spawnSync } from "node:child_process";
import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const onlineRoot = path.resolve(serverRoot, "..");
const repoRoot = path.resolve(onlineRoot, "..");

function parseArgs(argv = process.argv.slice(2)) {
  let outDir = path.join(repoRoot, ".release", "riftbomb-oracle");
  let dryRun = false;
  let wantTarball = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--tarball") wantTarball = true;
    else if (arg === "--out" && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    }
  }
  return { outDir, dryRun, wantTarball };
}

async function assertExists(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function skipNodeModules(src) {
  const parts = src.split(path.sep);
  return !parts.includes("node_modules");
}

export async function assertStageSources(root = repoRoot) {
  const gameSrc = path.join(root, "game");
  const serverSrc = path.join(root, "online", "server");
  await assertExists(path.join(serverSrc, "package.json"), "server package.json");
  await assertExists(path.join(serverSrc, "package-lock.json"), "server package-lock");
  await assertExists(path.join(serverSrc, "src", "server.mjs"), "server entry");
  await assertExists(path.join(serverSrc, "src", "authoritative-rooms.mjs"), "authoritative rooms");
  await assertExists(path.join(serverSrc, "deploy", "install-ubuntu.sh"), "install-ubuntu");
  await assertExists(path.join(serverSrc, "deploy", "riftbomb-game.service"), "systemd unit");
  await assertExists(path.join(gameSrc, "create-authoritative-duel.mjs"), "duel runtime");
  await assertExists(path.join(gameSrc, "run-champion-bomb-duel.js"), "duel rules");
  await assertExists(path.join(gameSrc, "apply-combat-rules.js"), "combat rules");
  return { gameSrc, serverSrc };
}

function createTarball(stageDir, tarballPath) {
  const args = [
    ...(process.platform === "win32" ? ["--force-local"] : []),
    "-cf",
    tarballPath,
    "-C",
    stageDir,
    "game",
    "online",
  ];
  const result = spawnSync("tar", args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`tar failed while writing ${tarballPath} (exit ${result.status ?? "null"})`);
  }
  return tarballPath;
}

export async function stageRelease({
  root = repoRoot,
  outDir = path.join(root, ".release", "riftbomb-oracle"),
  dryRun = false,
  wantTarball = false,
} = {}) {
  const { gameSrc, serverSrc } = await assertStageSources(root);
  if (dryRun) {
    return {
      dryRun: true,
      outDir,
      layout: ["game/", "online/server/"],
      marker: "STAGE_RELEASE_V1",
    };
  }

  await rm(outDir, { recursive: true, force: true });
  const stagedGame = path.join(outDir, "game");
  const stagedServer = path.join(outDir, "online", "server");
  await mkdir(stagedServer, { recursive: true });
  await cp(gameSrc, stagedGame, { recursive: true, filter: skipNodeModules });
  await cp(serverSrc, stagedServer, { recursive: true, filter: skipNodeModules });

  // install-ubuntu gate needs these exact relative paths
  await assertExists(path.join(outDir, "online", "server", "package-lock.json"), "staged package-lock");
  await assertExists(path.join(outDir, "game", "create-authoritative-duel.mjs"), "staged duel runtime");
  await assertExists(
    path.join(outDir, "online", "server", "deploy", "install-ubuntu.sh"),
    "staged install-ubuntu",
  );

  let tarball = null;
  if (wantTarball) {
    await mkdir(path.dirname(outDir), { recursive: true });
    tarball = path.join(path.dirname(outDir), "riftbomb-oracle-release.tar");
    await rm(tarball, { force: true });
    createTarball(outDir, tarball);
  }

  return {
    dryRun: false,
    outDir,
    tarball,
    layout: ["game/", "online/server/"],
    marker: "STAGE_RELEASE_V1",
  };
}

async function main() {
  const { outDir, dryRun, wantTarball } = parseArgs();
  const result = await stageRelease({ outDir, dryRun, wantTarball });
  if (result.dryRun) {
    console.log("STAGE_RELEASE_V1 dry-run ok");
    console.log(`  would stage: ${outDir}`);
    console.log(`  layout: ${result.layout.join(" + ")}`);
    return;
  }
  console.log("STAGE_RELEASE_V1 staged Oracle release");
  console.log(`  dir: ${result.outDir}`);
  console.log(`  layout: ${result.layout.join(" + ")}`);
  if (result.tarball) console.log(`  tar: ${result.tarball}`);
  console.log("  install: sudo bash online/server/deploy/install-ubuntu.sh <stage-dir>");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
