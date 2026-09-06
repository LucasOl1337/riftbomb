#!/usr/bin/env node
// Append a written note to the active local Training session.
// Prefers the Vite sink at 127.0.0.1:4174; falls back to the JSONL on disk.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsDirectory = path.join(repositoryRoot, "learning-records", "agent-play");
const defaultUrl = process.env.AGENT_PLAY_URL || "http://127.0.0.1:4174";

function usage() {
  console.log(`Usage:
  npm run note:agent-play -- --text "Dominus felt unfair after crate starve" [--kind feel]
  node game/note-agent-play-session.mjs --text "..." [--kind feel|unfair|death_reason|hypothesis|retest]

Options:
  --text, -t          Note body (required)
  --kind, -k          feel | unfair | death_reason | hypothesis | retest
  --hypothesis        Optional claim kept distinct from confirmed bugs
  --death-reason      Optional cause note
  --session           ap-… id (default: current)
  --url               Local Vite origin (default: ${defaultUrl})
`);
}

function parseArgs(argv) {
  const options = { kind: "feel", url: defaultUrl, text: "", session: "", hypothesis: "", deathReason: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if ((arg === "--text" || arg === "-t") && next) { options.text = next; index += 1; }
    else if ((arg === "--kind" || arg === "-k") && next) { options.kind = next; index += 1; }
    else if (arg === "--hypothesis" && next) { options.hypothesis = next; index += 1; }
    else if (arg === "--death-reason" && next) { options.deathReason = next; index += 1; }
    else if (arg === "--session" && next) { options.session = next; index += 1; }
    else if (arg === "--url" && next) { options.url = next; index += 1; }
    else if (!arg.startsWith("-") && !options.text) options.text = arg;
  }
  return options;
}

async function postNote(options) {
  const response = await fetch(`${options.url.replace(/\/$/, "")}/__agent-play/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: options.session || undefined,
      text: options.text,
      kind: options.kind,
      hypothesis: options.hypothesis || undefined,
      deathReason: options.deathReason || undefined
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return { via: "http", path: `${options.url}/__agent-play/sessions/${body.event.sessionId}`, event: body.event };
}

async function latestSessionId() {
  try {
    const pointer = JSON.parse(await readFile(path.join(recordsDirectory, "current.json"), "utf8"));
    if (pointer.sessionId) return pointer.sessionId;
  } catch {
    // Scan the directory.
  }
  const names = (await readdir(recordsDirectory).catch(() => []))
    .filter((name) => name.startsWith("ap-") && name.endsWith(".jsonl"))
    .sort();
  return names.at(-1)?.slice(0, -6) || "";
}

async function appendNoteToDisk(options) {
  const sessionId = options.session || await latestSessionId();
  if (!sessionId) throw new Error("no session file yet; start Training with npm run dev first");
  const filePath = path.join(recordsDirectory, `${sessionId}.jsonl`);
  let seq = 1;
  try {
    const lines = (await readFile(filePath, "utf8")).split(/\n/).filter(Boolean);
    seq = (JSON.parse(lines.at(-1)).seq || lines.length) + 1;
  } catch {
    // New file.
  }
  const event = {
    v: 1,
    sessionId,
    seq,
    t: Date.now(),
    matchTime: 0,
    type: "note",
    payload: {
      text: options.text,
      kind: options.kind,
      ...(options.hypothesis ? { hypothesis: options.hypothesis } : {}),
      ...(options.deathReason ? { deathReason: options.deathReason } : {})
    }
  };
  await writeFile(filePath, `${JSON.stringify(event)}\n`, { flag: "a" });
  return { via: "file", path: path.relative(repositoryRoot, filePath), event };
}

const options = parseArgs(process.argv.slice(2));
if (options.help || !options.text.trim()) {
  usage();
  process.exit(options.help ? 0 : 1);
}

try {
  const result = await postNote(options).catch(async (error) => {
    const fallback = await appendNoteToDisk(options);
    fallback.httpError = error instanceof Error ? error.message : String(error);
    return fallback;
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
