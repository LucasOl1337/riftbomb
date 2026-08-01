import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const clientAssetRoot = path.resolve(prototypeRoot, "..", "public", "client");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.RIFTBOMB_DESIGN_PORT ?? "4177", 10);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function resolveInside(root, relativePath) {
  const candidate = path.resolve(root, relativePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
    ? candidate
    : null;
}

async function fileResponse(request, response) {
  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const isClientAsset = decodedPath.startsWith("/client/");
  const root = isClientAsset ? clientAssetRoot : prototypeRoot;
  const relativePath = isClientAsset
    ? decodedPath.slice("/client/".length)
    : decodedPath === "/"
      ? "index.html"
      : decodedPath.slice(1);
  const filePath = resolveInside(root, relativePath);

  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
    response.writeHead(200, {
      "Cache-Control": isClientAsset ? "public, max-age=300" : "no-store",
      "Content-Length": fileStat.size,
      "Content-Security-Policy": "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": contentType,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  void fileResponse(request, response);
});

server.listen(port, host, () => {
  console.log(`Riftbomb War Table: http://${host}:${port}/`);
  console.log("Pressione Ctrl+C para encerrar.");
});
