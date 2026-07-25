import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import path from "node:path";

const courseDirectory = path.dirname(fileURLToPath(import.meta.url));

async function courseFiles(directory = courseDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await courseFiles(target));
    else files.push(target);
  }

  return files;
}

test("every local course link resolves after the move", async () => {
  const documents = (await courseFiles()).filter((file) => /\.(?:html|md)$/i.test(file));
  const unresolved = [];

  for (const documentPath of documents) {
    const source = await readFile(documentPath, "utf8");
    const document = documentPath.endsWith(".md")
      ? source.replace(/```[\s\S]*?```|`[^`\n]+`/g, "")
      : source;
    const links = [
      ...document.matchAll(/(?:href|src)=["']([^"']+)["']/g),
      ...document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)
    ].map((match) => match[1]);

    for (const link of links) {
      if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
      const target = path.resolve(path.dirname(documentPath), decodeURI(link.split("#")[0]));
      try {
        await stat(target);
      } catch {
        unresolved.push(`${path.relative(courseDirectory, documentPath)} -> ${link}`);
      }
    }
  }

  assert.deepEqual(unresolved, []);
});
