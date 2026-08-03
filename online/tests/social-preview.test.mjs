import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes lossless, accessible social share previews", async () => {
  const [image, openGraph, alt] = await Promise.all([
    readFile(new URL("app/twitter-image.webp", root)),
    readFile(new URL("app/opengraph-image.webp", root)),
    readFile(new URL("app/twitter-image.alt.txt", root), "utf8"),
  ]);

  assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(image.subarray(12, 16).toString("ascii"), "VP8L");
  assert.equal(image[20], 0x2f, "Twitter preview must use the lossless WebP signature");
  const width = 1 + image[21] + ((image[22] & 0x3f) << 8);
  const height = 1 + ((image[22] >> 6) | (image[23] << 2) | ((image[24] & 0x0f) << 10));
  assert.equal(width, 1774);
  assert.equal(height, 887);
  assert.equal(width / height, 2);
  assert.equal(openGraph.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(openGraph.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(openGraph.subarray(12, 16).toString("ascii"), "VP8L");
  assert.equal(openGraph[20], 0x2f, "Open Graph preview must use the lossless WebP signature");
  const openGraphWidth = 1 + openGraph[21] + ((openGraph[22] & 0x3f) << 8);
  const openGraphHeight = 1 + ((openGraph[22] >> 6) | (openGraph[23] << 2) | ((openGraph[24] & 0x0f) << 10));
  assert.equal(openGraphWidth, 1200);
  assert.equal(openGraphHeight, 630);
  assert.match(alt, /Riftbomb/);
  assert.match(alt, /arena competitiva de bombas/);
});
