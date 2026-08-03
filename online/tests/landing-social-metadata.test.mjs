import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes commercial social metadata for the canonical landing", async () => {
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");

  assert.ok(layout.includes('const siteUrl = "https://bombpvp.com";'));
  assert.ok(
    layout.includes(
      'const siteTitle = "Riftbomb — Bombas. Campeões. Sobreviva.";',
    ),
  );
  assert.ok(
    layout.includes(
      '"Duelos Bomber Rift em tempo real no navegador. Fila rápida, convite por link ou treino — sem download."',
    ),
  );
  assert.ok(layout.includes("metadataBase: new URL(siteUrl)"));
  assert.ok(layout.includes("title: siteTitle"));
  assert.ok(layout.includes("description: siteDescription"));
  assert.ok(layout.includes("openGraph: {"));
  assert.ok(layout.includes('locale: "pt_BR"'));
  assert.ok(layout.includes("url: `${siteUrl}/`"));
  assert.ok(layout.includes('siteName: "Riftbomb"'));
  assert.ok(layout.includes("twitter: {"));
  assert.ok(layout.includes('card: "summary_large_image"'));
  assert.ok(layout.includes('canonical: "/"'));
  assert.ok(layout.includes('apple: "/apple-touch-icon.png"'));
  assert.ok(layout.includes('url: "/favicon.ico"'));
  assert.ok(layout.includes('"codex-preview": "development"'));
  assert.ok(layout.includes('statusBarStyle: "black-translucent"'));
  assert.doesNotMatch(layout, /title:\s*"Riftbomb — War Table"/);
});
