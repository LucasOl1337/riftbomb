import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("loads the online duel layer into the reconstructed game", async () => {
  const page = await readFile(new URL("public/riftbomb.html", root), "utf8");
  const loader = await readFile(
    new URL("public/riftbomb-loader.js", root),
    "utf8",
  );
  const packager = await readFile(
    new URL("scripts/package-riftbomb.mjs", root),
    "utf8",
  );

  assert.match(page, /src="\/riftbomb-loader\.js"/);
  assert.match(loader, /online-duel\.css/);
  assert.match(loader, /online-duel\.js/);
  assert.match(packager, /riftbomb\.html/);
  assert.match(packager, /PART_SIZE/);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
});

test("ships host-authoritative room and snapshot behavior", async () => {
  const client = await readFile(new URL("public/online-duel.js", root), "utf8");
  assert.match(client, /RTCPeerConnection/);
  assert.match(client, /action: "create"/);
  assert.match(client, /SNAPSHOT_INTERVAL/);
  assert.match(client, /state\.role === "guest"/);
  assert.match(client, /game\.p2Human = false/);
});

test("declares persistent signaling storage", async () => {
  const hosting = JSON.parse(
    await readFile(new URL(".openai/hosting.json", root), "utf8"),
  );
  assert.equal(hosting.d1, "DB");

  const route = await readFile(new URL("app/api/pvp/route.ts", root), "utf8");
  assert.match(route, /CREATE TABLE IF NOT EXISTS pvp_rooms/);
  assert.match(route, /ROOM_LIFETIME_MS/);
  assert.match(route, /invalid_host_token/);
});
