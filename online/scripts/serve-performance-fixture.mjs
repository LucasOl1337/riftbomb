import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(scriptDirectory, "..", "public");
const port = Number(process.env.RIFTBOMB_PERF_PORT || 4179);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

function sendJson(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/riftbomb.html" : url.pathname;
  const relativePath = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  const filePath = path.resolve(publicDirectory, relativePath);
  const publicPrefix = `${publicDirectory}${path.sep}`;

  if (!filePath.startsWith(publicPrefix)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error("not_a_file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": details.size,
      "content-type": contentTypes.get(path.extname(filePath)) || "application/octet-stream",
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/pvp" && request.method === "POST") {
    try {
      const body = await readJson(request);
      if (body.action === "create") {
        setTimeout(() => sendJson(response, 201, {
          code: "PERF42",
          hostToken: "f".repeat(48),
          expiresAt: Date.now() + 600_000,
        }), 50);
        return;
      }
      if (body.action === "answer" || body.action === "close") {
        sendJson(response, 200, { ok: true });
        return;
      }
    } catch {
      sendJson(response, 400, { error: "invalid_body" });
      return;
    }
  }

  if (url.pathname === "/api/pvp") {
    sendJson(response, 404, { error: "room_not_found" });
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Riftbomb performance fixture listening on http://127.0.0.1:${port}`);
});
