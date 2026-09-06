import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SESSION_ID = /^ap-[A-Za-z0-9-]+$/;
const MAX_BODY_BYTES = 128 * 1024;
const PREFIX = "/__agent-play";

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

function readRequestBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createAgentPlayStore(directory, { relativePath = "learning-records/agent-play" } = {}) {
  const seqBySession = new Map();
  let currentId = null;

  const fileFor = (sessionId) => path.join(directory, `${sessionId}.jsonl`);

  async function ensureDirectory() {
    await mkdir(directory, { recursive: true });
  }

  async function writePointer(sessionId) {
    currentId = sessionId;
    await writeFile(path.join(directory, "current.json"), `${JSON.stringify({
      sessionId,
      path: `${relativePath}/${sessionId}.jsonl`,
      updatedAt: Date.now()
    }, null, 2)}\n`);
  }

  async function knownSeq(sessionId) {
    if (seqBySession.has(sessionId)) return seqBySession.get(sessionId);
    try {
      const parsed = parseJsonl(await readFile(fileFor(sessionId), "utf8"));
      const last = parsed.at(-1)?.seq || parsed.length;
      seqBySession.set(sessionId, last);
      return last;
    } catch {
      seqBySession.set(sessionId, 0);
      return 0;
    }
  }

  function parseJsonl(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async function latestId() {
    if (currentId) return currentId;
    try {
      const pointer = JSON.parse(await readFile(path.join(directory, "current.json"), "utf8"));
      if (SESSION_ID.test(pointer.sessionId)) {
        currentId = pointer.sessionId;
        return currentId;
      }
    } catch {
      // Fall through to directory scan.
    }
    const names = (await readdir(directory).catch(() => []))
      .filter((name) => name.startsWith("ap-") && name.endsWith(".jsonl"))
      .sort();
    currentId = names.at(-1)?.slice(0, -6) || null;
    return currentId;
  }

  return {
    directory,
    async appendEvents(events) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error("events must be a non-empty array");
      }
      await ensureDirectory();
      for (const incoming of events) {
        if (!incoming || !SESSION_ID.test(incoming.sessionId) || !incoming.type) {
          throw new Error("invalid agent-play event");
        }
        const event = { ...incoming };
        if (!Number.isInteger(event.seq) || event.seq <= 0) {
          event.seq = (await knownSeq(event.sessionId)) + 1;
        }
        seqBySession.set(event.sessionId, event.seq);
        await writeFile(fileFor(event.sessionId), `${JSON.stringify(event)}\n`, { flag: "a" });
        await writePointer(event.sessionId);
      }
    },
    async addNote({ sessionId, text, kind = "feel", hypothesis, deathReason } = {}) {
      const trimmed = String(text || "").trim();
      if (!trimmed) throw new Error("note text is required");
      const id = sessionId || await latestId();
      if (!id || !SESSION_ID.test(id)) throw new Error("no active agent-play session");
      const seq = (await knownSeq(id)) + 1;
      const payload = { text: trimmed, kind };
      if (hypothesis) payload.hypothesis = String(hypothesis);
      if (deathReason) payload.deathReason = String(deathReason);
      const event = {
        v: 1,
        sessionId: id,
        seq,
        t: Date.now(),
        matchTime: 0,
        type: "note",
        payload
      };
      await this.appendEvents([event]);
      return event;
    },
    async readSession(sessionId) {
      const id = sessionId === "current" || !sessionId ? await latestId() : sessionId;
      if (!id) return { sessionId: "", path: "", events: [] };
      if (!SESSION_ID.test(id)) throw new Error("invalid session id");
      const relative = `${relativePath}/${id}.jsonl`;
      try {
        const text = await readFile(fileFor(id), "utf8");
        return { sessionId: id, path: relative, events: parseJsonl(text), text };
      } catch (error) {
        if (error && error.code === "ENOENT") {
          return { sessionId: id, path: relative, events: [], text: "" };
        }
        throw error;
      }
    },
    async listSessions() {
      await ensureDirectory();
      const names = (await readdir(directory))
        .filter((name) => name.startsWith("ap-") && name.endsWith(".jsonl"))
        .sort()
        .reverse();
      return {
        current: await latestId(),
        sessions: names.map((name) => ({
          sessionId: name.slice(0, -6),
          path: `${relativePath}/${name}`
        }))
      };
    },
    async status() {
      const current = await this.readSession("current");
      return {
        ok: true,
        recording: true,
        sessionId: current.sessionId || null,
        path: current.sessionId ? current.path : null,
        eventCount: current.events.length
      };
    }
  };
}

function attachRoutes(server, store) {
  server.middlewares.use(async (request, response, next) => {
    const url = String(request.url || "").split("?")[0];
    if (!url.startsWith(PREFIX)) return next();

    try {
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.setHeader("allow", "GET,POST,OPTIONS");
        response.end();
        return;
      }

      if (request.method === "GET" && url === `${PREFIX}/status`) {
        json(response, 200, await store.status());
        return;
      }
      if (request.method === "GET" && url === `${PREFIX}/sessions`) {
        json(response, 200, await store.listSessions());
        return;
      }
      if (request.method === "GET" && url.startsWith(`${PREFIX}/sessions/`)) {
        const id = decodeURIComponent(url.slice(`${PREFIX}/sessions/`.length));
        json(response, 200, await store.readSession(id));
        return;
      }
      if (request.method === "POST" && (url === `${PREFIX}/events` || url === `${PREFIX}/notes`)) {
        const body = JSON.parse((await readRequestBody(request, MAX_BODY_BYTES)) || "{}");
        if (url.endsWith("/notes")) {
          json(response, 200, { ok: true, event: await store.addNote(body) });
          return;
        }
        const events = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [body];
        await store.appendEvents(events);
        json(response, 200, { ok: true, accepted: events.length });
        return;
      }

      json(response, 404, { ok: false, error: "unknown agent-play route" });
    } catch (error) {
      json(response, 400, { ok: false, error: error instanceof Error ? error.message : "agent-play failed" });
    }
  });
}

export function agentPlayDevPlugin(options = {}) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = options.repoRoot || path.resolve(scriptDir, "../..");
  const directory = options.directory || path.join(repoRoot, "learning-records", "agent-play");
  const store = options.store || createAgentPlayStore(directory);

  return {
    name: "agent-play-dev",
    apply: "serve",
    configureServer(server) {
      attachRoutes(server, store);
    },
    configurePreviewServer(server) {
      attachRoutes(server, store);
    }
  };
}
