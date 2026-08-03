import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("advertises the real gameplay preview in the landing sitemap", async () => {
  const [sitemap, image] = await Promise.all([
    readFile(new URL("public/sitemap.xml", root), "utf8"),
    readFile(new URL("app/twitter-image.webp", root)),
  ]);

  assert.match(
    sitemap,
    /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/,
  );
  assert.match(
    sitemap,
    /<image:loc>https:\/\/bombpvp\.com\/twitter-image\.webp<\/image:loc>/,
  );
  assert.match(sitemap, /<image:title>Riftbomb/);
  assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(image.subarray(12, 16).toString("ascii"), "VP8L");
});
