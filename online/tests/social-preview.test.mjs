import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes a wide, accessible Twitter share preview", async () => {
  const [image, alt] = await Promise.all([
    readFile(new URL("app/twitter-image.png", root)),
    readFile(new URL("app/twitter-image.alt.txt", root), "utf8"),
  ]);

  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(image.readUInt32BE(16), 1774);
  assert.equal(image.readUInt32BE(20), 887);
  assert.equal(image.readUInt32BE(16) / image.readUInt32BE(20), 2);
  assert.match(alt, /Riftbomb/);
  assert.match(alt, /arena competitiva de bombas/);
});
