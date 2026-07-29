/**
 * Deploy the built vinext artifact (dist/) to Cloudflare Workers + custom domain.
 *
 * Usage (from online/):
 *   node scripts/deploy-cloudflare.mjs
 *   node scripts/deploy-cloudflare.mjs --build
 *
 * Requires:
 *   - wrangler login (or CLOUDFLARE_API_TOKEN)
 *   - CLOUDFLARE_ACCOUNT_ID (optional if set in wrangler.production.jsonc)
 *   - dist/ from `npm run build`
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(__dirname, "..");
const distServer = path.join(onlineRoot, "dist", "server");
const distClient = path.join(onlineRoot, "dist", "client");
const productionConfigPath = path.join(onlineRoot, "wrangler.production.jsonc");
const distWranglerPath = path.join(distServer, "wrangler.json");

const ACCOUNT_ID = "f838f7d26348a09f88fb38ea03272857";
const D1_NAME = "riftbomb-online";
const D1_ID = "0d1c4351-7070-4d8f-8035-d5e1ae291a61";
const WORKER_NAME = "riftbomb-online";
const DOMAIN = "bombpvp.com";

function firstCredentialValue(value) {
  return value?.trim().split(/\s+/u).find(Boolean) || "";
}

function normalizeCloudflareEnvironment() {
  const token = firstCredentialValue(process.env.CLOUDFLARE_API_TOKEN);
  if (token) {
    process.env.CLOUDFLARE_API_TOKEN = token;
  }
  process.env.CLOUDFLARE_ACCOUNT_ID =
    firstCredentialValue(process.env.CLOUDFLARE_ACCOUNT_ID) || ACCOUNT_ID;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? onlineRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || ACCOUNT_ID,
    },
    shell: options.shell ?? false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function assertExists(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function patchDistWrangler() {
  await assertExists(distWranglerPath, "dist wrangler.json");
  await assertExists(path.join(distServer, "index.js"), "worker entry");
  await assertExists(distClient, "client assets");

  const current = JSON.parse(await readFile(distWranglerPath, "utf8"));
  const productionSource = JSON.parse(await readFile(productionConfigPath, "utf8"));
  const production = {
    ...current,
    name: WORKER_NAME,
    account_id: ACCOUNT_ID,
    main: "index.js",
    no_bundle: true,
    compatibility_date: current.compatibility_date || "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    preview_urls: true,
    assets: {
      directory: "../client",
      binding: "ASSETS",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: D1_NAME,
        database_id: D1_ID,
      },
    ],
    vars: productionSource.vars || {},
    routes: [
      {
        pattern: DOMAIN,
        custom_domain: true,
      },
    ],
    observability: { enabled: true },
  };

  await writeFile(distWranglerPath, JSON.stringify(production, null, 2));
  console.log(`Patched ${path.relative(onlineRoot, distWranglerPath)} for production deploy.`);
}

async function main() {
  const wantBuild = process.argv.includes("--build");
  normalizeCloudflareEnvironment();

  if (wantBuild) {
    console.log("Building verified online artifact...");
    if (process.platform === "win32") {
      run("bash", ["scripts/build-verified.sh"], { shell: false });
    } else {
      run("bash", ["scripts/build-verified.sh"]);
    }
  }

  await patchDistWrangler();

  console.log(`Deploying ${WORKER_NAME} → https://${DOMAIN} ...`);
  // Deploy from dist/server so relative asset paths and generated wrangler.json match.
  const wranglerBin = path.join(onlineRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  run(
    process.execPath,
    [wranglerBin, "deploy", "-c", "wrangler.json", "--name", WORKER_NAME],
    { cwd: distServer },
  );

  console.log("");
  console.log("Deploy finished.");
  console.log(`  Production: https://${DOMAIN}`);
  console.log(`  Workers.dev: https://${WORKER_NAME}.<subdomain>.workers.dev (see wrangler output)`);
  console.log(`  D1: ${D1_NAME} (${D1_ID})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
