import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const championsRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(championsRoot);

/**
 * Label (LoLSound) → game effect keys used by play-rift-sfx.js
 * Extend per champion when a roster bank is imported.
 */
const DEFAULT_LABEL_TO_EFFECTS = Object.freeze({
  "Q cast": ["katQ"],
  "W cast": ["katW"],
  "R cast": ["deathLotus"],
  // Ambient banter (10s cadence), not every skill/dash.
  "Move Standard": ["move", "idle"],
  "Attack General": ["bladeHit"],
  "Basic Attack cast": ["hit"],
  // Light combat SFX proxy — not a spoken line gate.
  "Basic Attack2 cast": ["daggerLand"],
  "Crit Attack cast": ["voracity"],
  Death: ["championDeath"]
});

const CHAMPION_LABEL_MAPS = Object.freeze({
  katarina: DEFAULT_LABEL_TO_EFFECTS
});

function slugFileName(soundName) {
  const base = path.basename(soundName).replace(/\.[^.]+$/i, "");
  return `${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.m4a`;
}

export async function importLolSoundChampionSfx({
  champion = "katarina",
  locale = "pt_BR",
  skin = null,
  repositoryRoot: root = repositoryRoot
} = {}) {
  const championInfo = await (await fetch(`https://lolsound.com/api/v1/champions/${champion}`)).json();
  const baseSkin = championInfo.skins?.find((entry) => entry.isBaseSkin) || championInfo.skins?.[0];
  const skinCode = skin || baseSkin?.code;
  if (!skinCode) throw new Error(`No skin found for ${champion}`);

  const api = `https://lolsound.com/api/v1/champions/${champion}/skins/${skinCode}/sounds?language=${locale}`;
  const list = await (await fetch(api)).json();
  if (!Array.isArray(list)) throw new Error(`Unexpected sounds payload for ${champion}`);

  const labelToEffects = CHAMPION_LABEL_MAPS[champion] || DEFAULT_LABEL_TO_EFFECTS;
  const sfxDir = path.join(root, "champions", champion, "sfx");
  const audioDir = path.join(sfxDir, "pt-br");
  await mkdir(audioDir, { recursive: true });

  const effectFiles = Object.create(null);
  const downloaded = [];

  for (const sound of list) {
    const effects = labelToEffects[sound.label];
    if (!effects?.length) continue;
    const fileName = slugFileName(sound.name);
    const rel = `pt-br/${fileName}`;
    const abs = path.join(audioDir, fileName);
    const response = await fetch(sound.url);
    if (!response.ok) throw new Error(`Download failed ${sound.url} (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(abs, buffer);
    for (const effect of effects) {
      if (!effectFiles[effect]) effectFiles[effect] = [];
      effectFiles[effect].push(rel);
    }
    downloaded.push({
      effects,
      file: rel,
      bytes: buffer.length,
      label: sound.label,
      category: sound.category,
      url: sound.url,
      id: sound.id
    });
  }

  const mapPath = path.join(sfxDir, "sfx-map.json");
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  map.locale = locale;
  map.referenceCatalog = {
    site: `https://lolsound.com/champion/${championInfo.alias || champion}`,
    localeControl: locale,
    api,
    skin: skinCode,
    importedAt: new Date().toISOString()
  };
  const voiceDefaults = {
    move: { voice: true, force: false, bus: "dash", gain: 0.58 },
    idle: { voice: true, force: false, bus: "dash", gain: 0.55 },
    championDeath: { voice: true, force: true, bus: "kill", gain: 0.78 },
    deathLotus: { voice: true, force: true, bus: "ultimate", gain: 0.78 },
    katQ: { voice: true, force: false, bus: "projectile", gain: 0.7 },
    katW: { voice: true, force: false, bus: "cast", gain: 0.66 },
    bladeHit: { voice: true, force: false, bus: "impact", gain: 0.58 },
    hit: { voice: true, force: false, bus: "impact", gain: 0.55 },
    voracity: { voice: true, force: false, bus: "impact", gain: 0.6 },
    daggerLand: { voice: false, force: false, bus: "projectile", gain: 0.5, kind: "sfx" },
    shunpo: { voice: true, force: false, bus: "dash", gain: 0.62 }
  };

  for (const [effect, files] of Object.entries(effectFiles)) {
    const defaults = voiceDefaults[effect] || { voice: true, force: false, bus: "ui", gain: 0.6 };
    if (!map.actions[effect]) {
      map.actions[effect] = {
        gameEffect: effect,
        bus: defaults.bus,
        files: [],
        gain: defaults.gain,
        reverb: 0.16,
        preferSample: true,
        voice: defaults.voice,
        force: defaults.force
      };
    }
    map.actions[effect].files = files;
    map.actions[effect].voice = defaults.voice;
    map.actions[effect].force = defaults.force === true;
    if (defaults.kind) map.actions[effect].kind = defaults.kind;
    if (defaults.kind === "sfx") {
      map.actions[effect].lolsound = {
        ...(map.actions[effect].lolsound || {}),
        kind: "sfx"
      };
    }
    map.actions[effect].source = {
      catalog: map.referenceCatalog.site,
      api,
      locale,
      skin: skinCode,
      label: map.actions[effect].lolsound?.label || downloaded.find((row) => row.effects.includes(effect))?.label
    };
  }

  // Clear legacy shunpo VO bank — Move Standard is ambient, dash keeps synth.
  if (map.actions.shunpo && !effectFiles.shunpo) {
    map.actions.shunpo.files = [];
    map.actions.shunpo.preferSample = false;
    map.actions.shunpo.notes = "Shunpo dash uses procedural whoosh; Move Standard is ambient move/idle VO.";
  }
  await writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`);

  const rows = downloaded.map((row) =>
    `| ${row.effects.join(", ")} | \`${row.file}\` | LoLSound ${row.label} | ${new Date().toISOString().slice(0, 10)} | ${row.bytes} B |`
  ).join("\n");
  const provenance = `# ${championInfo.name || champion} SFX provenance

## Source

| Field | Value |
|-------|--------|
| Catalog | [${map.referenceCatalog.site}](${map.referenceCatalog.site}) |
| API | \`${api}\` |
| Locale | **${locale}** |
| Skin | \`${skinCode}\` |
| Imported | ${new Date().toISOString().slice(0, 10)} |
| Count | ${downloaded.length} clips mapped into game effects |

## File log

| Game effect | File | Source | Date | Notes |
|-------------|------|--------|------|-------|
${rows || "| *(none)* | | | | |"}
`;
  await writeFile(path.join(sfxDir, "PROVENANCE.md"), provenance);
  await writeFile(
    path.join(sfxDir, "import-manifest.json"),
    `${JSON.stringify({
      champion,
      locale,
      skin: skinCode,
      api,
      downloadedAt: new Date().toISOString(),
      count: downloaded.length,
      effectCounts: Object.fromEntries(Object.entries(effectFiles).map(([key, files]) => [key, files.length])),
      files: downloaded
    }, null, 2)}\n`
  );

  return {
    champion,
    locale,
    skin: skinCode,
    count: downloaded.length,
    effectCounts: Object.fromEntries(Object.entries(effectFiles).map(([key, files]) => [key, files.length])),
    files: downloaded
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const champion = process.argv[2] || "katarina";
  const locale = process.argv[3] || "pt_BR";
  const result = await importLolSoundChampionSfx({ champion, locale });
  console.log(
    `Imported ${result.count} ${result.locale} clips for ${result.champion} (${result.skin}): ` +
    JSON.stringify(result.effectCounts)
  );
}
