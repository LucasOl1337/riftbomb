import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const sfxPath = path.join(gameDirectory, "play-rift-sfx.js");
const rulesPath = path.join(gameDirectory, "run-champion-bomb-duel.js");
const documentPath = path.join(gameDirectory, "play-riftbomb.html");

const sfxSource = await readFile(sfxPath, "utf8");
const rulesSource = await readFile(rulesPath, "utf8");

function loadSfxEngine(globals = {}) {
  const sandbox = {
    console: { warn() {} },
    setTimeout,
    clearTimeout,
    Date,
    ...globals
  };
  if (!sandbox.window) sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(`
    Math.random = () => 0.5;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (from, to, amount) => from + (to - from) * amount;
    ${sfxSource}
    globalThis.SfxEngineForTest = SfxEngine;
  `, context);
  return context.SfxEngineForTest;
}

function loadGameClass() {
  const context = vm.createContext({
    console,
    Renderer: {
      colors: {
        whiteGold: "#fff",
        gold: "#fc0",
        ember: "#f50",
        gangplankOrange: "#f80"
      }
    }
  });
  vm.runInContext(`
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (from, to, amount) => from + (to - from) * amount;
    ${rulesSource}
    globalThis.GameForTest = Game;
  `, context);
  return context.GameForTest;
}

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push(["set", value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push(["exponential", value, time]);
  }
}

class FakeAudioNode {
  constructor(kind = "node") {
    this.kind = kind;
    this.connections = [];
    this.disconnectCount = 0;
  }

  connect(target) {
    this.connections.push(target);
    return target;
  }

  disconnect() {
    this.disconnectCount += 1;
  }
}

class FakeScheduledSource extends FakeAudioNode {
  constructor(kind) {
    super(kind);
    this.playbackRate = new FakeAudioParam(1);
    this.frequency = new FakeAudioParam(440);
    this.started = [];
    this.stopped = [];
    this.onended = null;
  }

  start(...args) {
    this.started.push(args);
  }

  stop(...args) {
    this.stopped.push(args);
  }
}

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 64;
    this.currentTime = 10;
    this.destination = new FakeAudioNode("destination");
    this.sources = [];
    this.resumeCalls = 0;
    this.closeCalls = 0;
  }

  createGain() {
    const node = new FakeAudioNode("gain");
    node.gain = new FakeAudioParam(1);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeAudioNode("compressor");
    for (const name of ["threshold", "knee", "ratio", "attack", "release"]) {
      node[name] = new FakeAudioParam();
    }
    return node;
  }

  createBiquadFilter() {
    const node = new FakeAudioNode("filter");
    node.frequency = new FakeAudioParam();
    node.Q = new FakeAudioParam();
    return node;
  }

  createConvolver() {
    return new FakeAudioNode("convolver");
  }

  createWaveShaper() {
    return new FakeAudioNode("waveshaper");
  }

  createStereoPanner() {
    const node = new FakeAudioNode("panner");
    node.pan = new FakeAudioParam();
    return node;
  }

  createBuffer(numberOfChannels, length) {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return {
      numberOfChannels,
      getChannelData(channel) {
        return channels[channel];
      }
    };
  }

  createBufferSource() {
    const source = new FakeScheduledSource("buffer-source");
    this.sources.push(source);
    return source;
  }

  createOscillator() {
    const source = new FakeScheduledSource("oscillator");
    this.sources.push(source);
    return source;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.closeCalls += 1;
    this.state = "closed";
    return Promise.resolve();
  }
}

function traceAction(action, options = {}) {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const trace = [];
  const pulses = [];
  sfx.ctx = { state: "running", currentTime: 10 };
  sfx.pulse = (amount) => pulses.push(Number(amount.toFixed(5)));
  const record = (kind, time, layer) => trace.push({
    kind,
    time: Number(time.toFixed(3)),
    bus: layer.bus,
    filter: layer.filter || layer.type || "sine",
    from: Math.round(layer.frequency ?? layer.from ?? 0),
    to: Math.round(layer.endFrequency ?? layer.to ?? 0),
    duration: Number(layer.duration.toFixed(3)),
    gain: Number((layer.gain ?? 0).toFixed(5)),
    pan: Number((layer.pan ?? 0).toFixed(3)),
    priority: Boolean(layer.priority)
  });
  sfx.noiseBurst = (time, layer) => {
    record("noise", time, layer);
    return true;
  };
  sfx.toneSweep = (time, layer) => {
    record("tone", time, layer);
    return true;
  };
  sfx.effect(action, 1, options);
  return { trace, pulses };
}

test("the SFX module stays explicitly registered before game startup", async () => {
  const document = await readFile(documentPath, "utf8");
  const entrypoint = '<script src="./play-rift-sfx.js"></script>';
  const samplePack = '<script src="./arena-appearance/load-arena-sfx.js"></script>';
  const championPack = '<script src="./load-champion-sfx.js"></script>';
  assert.equal(document.split(entrypoint).length - 1, 1);
  assert.equal(document.split(samplePack).length - 1, 1);
  assert.equal(document.split(championPack).length - 1, 1);
  assert.ok(document.indexOf(samplePack) < document.indexOf(entrypoint));
  assert.ok(document.indexOf(championPack) < document.indexOf(entrypoint));
  assert.ok(document.indexOf(entrypoint) < document.indexOf('<script src="./start-champion-duel.js"></script>'));
});

test("distortion and final ceiling curves remain finite, symmetric and bounded", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const distortion = [...sfx.distortionCurve(18)];
  const ceiling = [...sfx.softClipCurve()];

  assert.equal(distortion.length, 1024);
  assert.equal(ceiling.length, 1024);
  assert.ok(distortion.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1));
  assert.ok(ceiling.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 0.891));
  assert.ok(distortion[0] < -0.99 && distortion.at(-1) > 0.99);
  assert.ok(ceiling[0] < -0.889 && ceiling.at(-1) > 0.889);
  assert.ok(Math.abs(distortion[511] + distortion[512]) < 1e-6);
  assert.ok(Math.abs(ceiling[511] + ceiling[512]) < 1e-6);
  for (let index = 1; index < distortion.length; index++) {
    assert.ok(distortion[index] >= distortion[index - 1], "distortion curve must stay monotonic");
    assert.ok(ceiling[index] >= ceiling[index - 1], "ceiling curve must stay monotonic");
  }
  for (let index = 0; index < distortion.length; index += 97) {
    const mirror = distortion.length - 1 - index;
    assert.ok(Math.abs(distortion[index] + distortion[mirror]) < 1e-6);
  }
});

test("invalid volume input cannot poison a bus AudioParam with NaN", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const initial = sfx.getVolume("explosion");

  assert.equal(sfx.setVolume("explosion", "not-a-number"), initial);
  assert.equal(sfx.getVolume("explosion"), initial);
  assert.equal(sfx.setVolume("explosion", -2), 0);
  assert.equal(sfx.setVolume("explosion", 4), 1);
  assert.ok(Object.values(sfx.getVolumes()).every(Number.isFinite));
});

test("arena and champion detonations use their declared buses and distinct signatures", () => {
  const SfxEngine = loadSfxEngine();
  const arena = traceAction("explosion");
  const powder = traceAction("barrelBoom");
  const shadow = traceAction("markPop");
  const blood = traceAction("hemoplaguePop");
  const finisher = traceAction("kill");
  const cannon = traceAction("cannonImpact");

  const detonations = [arena, powder, shadow, blood, finisher, cannon];
  assert.ok(detonations.every(({ trace }) => trace.length >= 4));
  for (const championTrace of [powder, shadow, blood, finisher]) {
    assert.ok(championTrace.trace.length >= 4);
    assert.ok(championTrace.trace.every((layer) => layer.bus === "kill"));
    assert.equal(championTrace.pulses.length, 1, "detonations pulse once instead of effect + explosion twice");
  }
  assert.ok(arena.trace.every((layer) => layer.bus === "explosion"));
  assert.ok(cannon.trace.every((layer) => layer.bus === "ultimate"));
  const signatures = detonations.map(({ trace }) => JSON.stringify(trace));
  assert.equal(new Set(signatures).size, detonations.length, "every blast profile needs its own signature");
  for (const profile of Object.values(SfxEngine.BLAST_PROFILES)) {
    assert.ok(Number.isFinite(profile.level) && profile.level > 0 && profile.level <= 1);
  }

  const panned = traceAction("barrelBoom", { pan: 0.46 }).trace;
  assert.ok(panned.slice(0, 4).every((layer) => layer.pan === 0.46));
  assert.ok(panned.slice(0, 4).every((layer) => layer.priority));
});

test("Katarina champion SFX map covers the combat effects with PT-BR catalog labels", async () => {
  const mapPath = path.join(gameDirectory, "..", "champions", "katarina", "sfx", "sfx-map.json");
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  assert.equal(map.champion, "katarina");
  assert.equal(map.locale, "pt_BR");
  for (const effect of ["katQ", "katW", "deathLotus", "shunpo", "daggerLand", "bladeHit"]) {
    assert.ok(map.actions[effect], `${effect} must be mapped for Katarina`);
    assert.equal(map.actions[effect].gameEffect, effect);
    assert.ok(map.actions[effect].lolsound?.label, `${effect} needs a catalog label`);
    assert.ok(Array.isArray(map.actions[effect].files), `${effect}.files must be an array`);
  }
  assert.match(map.referenceCatalog.site, /lolsound\.com\/champion\/Katarina/i);
});

test("champion action samples prefer the bank over procedural synth when decoded", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const samples = [];
  sfx.ctx = { state: "running", currentTime: 2 };
  sfx.master = {};
  sfx.sampleBuffers.katQ = { duration: 0.8 };
  sfx.sampleVariants.katQ = ["katQ"];
  sfx.sampleMeta.katQ = {
    gain: 0.7, reverb: 0.16, preferSample: true, champion: "katarina", voice: true
  };
  sfx.playSample = (name, time, layer) => {
    samples.push({ name, time: Number(time.toFixed(3)), bus: layer.bus, gain: layer.gain, pan: layer.pan });
    return true;
  };
  sfx.whoosh = () => {
    throw new Error("procedural katQ must not run when the sample plays");
  };
  sfx.metalStrike = () => {
    throw new Error("procedural katQ must not run when the sample plays");
  };

  sfx.effect("katQ", 1, { pan: -0.2 });

  assert.equal(samples.length, 1);
  assert.equal(samples[0].name, "katQ");
  assert.equal(samples[0].bus, "projectile");
  assert.equal(samples[0].pan, -0.2);
  assert.ok(samples[0].gain > 0.4);
});

test("champion VO shares a cooldown so skill spam falls back to synth", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const samples = [];
  const whooshes = [];
  sfx.ctx = { state: "running", currentTime: 10 };
  sfx.master = {};
  for (const name of ["katQ", "katW", "bladeHit"]) {
    sfx.sampleBuffers[name] = { duration: 0.6 };
    sfx.sampleVariants[name] = [name];
    sfx.sampleMeta[name] = {
      gain: 0.7, reverb: 0.16, preferSample: true, champion: "katarina", voice: true
    };
  }
  sfx.playSample = (name, time) => {
    samples.push({ name, time: Number(time.toFixed(3)) });
    return true;
  };
  sfx.whoosh = (time) => {
    whooshes.push(Number(time.toFixed(3)));
    return true;
  };
  sfx.metalStrike = () => true;
  sfx.toneSweep = () => true;
  sfx.noiseBurst = () => true;

  sfx.effect("katQ", 1, { pan: 0 });
  sfx.ctx.currentTime = 10.4;
  sfx.effect("katW", 1, { pan: 0 });
  sfx.ctx.currentTime = 10.8;
  sfx.effect("bladeHit", 1, { pan: 0 });

  assert.equal(samples.length, 1, "only the first VO within the cooldown may speak");
  assert.equal(samples[0].name, "katQ");
  assert.ok(whooshes.length >= 1, "gated skills keep procedural combat layers");

  sfx.ctx.currentTime = 10 + SfxEngine.VOICE_COOLDOWN + 0.05;
  sfx.effect("katW", 1, { pan: 0 });
  assert.equal(samples.at(-1).name, "katW", "after the cooldown another line may speak");
});

test("forced death and ultimate VO ignore the shared cooldown", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const samples = [];
  sfx.ctx = { state: "running", currentTime: 3 };
  sfx.master = {};
  for (const [name, force] of [["katQ", false], ["deathLotus", true], ["championDeath", true]]) {
    sfx.sampleBuffers[name] = { duration: 0.7 };
    sfx.sampleVariants[name] = [name];
    sfx.sampleMeta[name] = {
      gain: 0.75, reverb: 0.18, preferSample: true, champion: "katarina", voice: true, force
    };
  }
  sfx.playSample = (name) => {
    samples.push(name);
    return true;
  };
  sfx.whoosh = () => true;
  sfx.metalStrike = () => true;
  sfx.toneSweep = () => true;
  sfx.noiseBurst = () => true;

  sfx.effect("katQ", 1);
  sfx.ctx.currentTime = 3.2;
  sfx.effect("deathLotus", 1);
  sfx.ctx.currentTime = 3.4;
  sfx.effect("championDeath", 1);

  assert.deepEqual(samples, ["katQ", "deathLotus", "championDeath"]);
});

test("ambient move VO waits for the interval and the shared voice gate", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const samples = [];
  sfx.ctx = { state: "running", currentTime: 20 };
  sfx.master = {};
  sfx.sampleBuffers.move = { duration: 0.5 };
  sfx.sampleVariants.move = ["move"];
  sfx.sampleMeta.move = {
    gain: 0.55, reverb: 0.14, preferSample: true, champion: "katarina", voice: true
  };
  sfx.playSample = (name) => {
    samples.push(name);
    return true;
  };

  const game = {
    players: [{ alive: true, moving: true, x: 1, z: 0 }],
    audioPanAt: () => 0.1
  };

  sfx.tickChampionMoveVoice(game, 4);
  assert.equal(samples.length, 0, "interval not reached yet");
  sfx.tickChampionMoveVoice(game, SfxEngine.MOVE_VOICE_INTERVAL);
  assert.equal(samples[0], "move");

  sfx.tickChampionMoveVoice(game, SfxEngine.MOVE_VOICE_INTERVAL);
  assert.equal(samples.length, 1, "shared VO gate blocks back-to-back move banter");

  sfx.ctx.currentTime = 20 + SfxEngine.VOICE_COOLDOWN + 0.1;
  sfx._moveVoiceTimer = SfxEngine.MOVE_VOICE_INTERVAL;
  sfx.tickChampionMoveVoice(game, 0.016);
  assert.equal(samples.length, 2);
});

test("arena blasts prefer the packaged explosion sample when it is decoded", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const samples = [];
  const tones = [];
  sfx.ctx = { state: "running", currentTime: 4 };
  sfx.master = {};
  sfx.sampleBuffers.explosion = { duration: 3.4 };
  sfx.playSample = (name, time, layer) => {
    samples.push({ name, time: Number(time.toFixed(3)), ...layer });
    return true;
  };
  sfx.toneSweep = (time, layer) => {
    tones.push({ time: Number(time.toFixed(3)), bus: layer.bus, gain: layer.gain });
    return true;
  };
  sfx.noiseBurst = () => {
    throw new Error("procedural arena stack must not run when the sample plays");
  };

  sfx.explosion(1, { profile: "arena", pan: 0.2, visualLife: 0.72 });

  assert.equal(samples.length, 1);
  assert.equal(samples[0].name, "explosion");
  assert.equal(samples[0].bus, "explosion");
  assert.equal(samples[0].pan, 0.2);
  assert.ok(samples[0].duration <= 0.72 + 1e-6, "sample must not outlive the blast visual");
  assert.ok(samples[0].duration >= 0.5, "sample still covers the fire corridor window");
  assert.ok(samples[0].fadeOut <= samples[0].duration * 0.25 + 1e-6, "fade stays inside the visual window");
  assert.equal(tones.length, 1, "sample path keeps a thin sub bed");
  assert.equal(tones[0].bus, "explosion");
});

test("fuse scheduling emits one newest tick per update and never replays rollback", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const events = [];
  const game = {
    bombs: [
      { id: 1, age: 0, fuse: 2.35, exploded: false },
      { id: 2, age: 0, fuse: 2.35, exploded: false }
    ],
    particles: [],
    players: []
  };
  sfx.effect = (...args) => events.push(args);

  sfx.update(game, 0.016);
  assert.equal(events.length, 0, "first authoritative sighting establishes a baseline");

  game.bombs[0].age = 0.82;
  game.bombs[1].age = 0.82;
  sfx.update(game, 0.016);
  assert.equal(events.length, 1, "synchronised bombs coalesce to one readable click");

  game.bombs[0].age = 2.22;
  game.bombs[1].age = 2.22;
  sfx.update(game, 0.016);
  assert.equal(events.length, 2, "crossing several thresholds emits only the newest click");
  const latestStrength = events.at(-1)[1];

  game.bombs[0].age = 1.2;
  game.bombs[1].age = 1.2;
  sfx.update(game, 0.016);
  assert.equal(events.length, 2, "snapshot rollback cannot replay a threshold");

  game.bombs[0].age = game.bombs[0].fuse;
  game.bombs[1].age = game.bombs[1].fuse;
  sfx.update(game, 0.016);
  assert.equal(events.length, 2, "a chain-forced fuse at 100% does not chirp before exploding");
  assert.ok(latestStrength > events[0][1]);

  game.bombs = [];
  sfx.update(game, 0.016);
  assert.equal(sfx._fuseProgress.size, 0);
});

test("the voice budget reserves capacity for explosions and danger cues", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  let routineVoices = 0;
  while (routineVoices < 100 && sfx._claimVoice(false)) routineVoices += 1;
  assert.ok(routineVoices > 0 && routineVoices < SfxEngine.MAX_VOICES);
  assert.equal(sfx._claimVoice(false), false);

  let totalVoices = routineVoices;
  while (totalVoices < 100 && sfx._claimVoice(true)) totalVoices += 1;
  assert.equal(totalVoices, SfxEngine.MAX_VOICES);
  assert.equal(sfx._claimVoice(true), false);
});

test("every literal gameplay SFX action has an explicit volume bus", () => {
  const SfxEngine = loadSfxEngine();
  const emittedActions = new Set(
    [...rulesSource.matchAll(/this\.playSfxAt\("([^"]+)"/g)].map((match) => match[1])
  );
  for (const variant of [
    "renektonQ", "renektonQEmpowered", "renektonW", "renektonWEmpowered",
    "renektonE", "renektonDice", "vladimirQ", "vladimirQEmpowered"
  ]) emittedActions.add(variant);

  for (const action of emittedActions) {
    assert.ok(SfxEngine.ACTION_BUS[action], `${action} needs an explicit SFX bus`);
  }
  for (const [action, bus] of Object.entries(SfxEngine.ACTION_BUS)) {
    assert.ok(Object.hasOwn(SfxEngine.VOLUME_DEFAULTS, bus), `${action} points at missing ${bus} bus`);
  }
});

test("world-space danger panning is centered and capped", () => {
  const Game = loadGameClass();
  const match = Object.create(Game.prototype);
  match.cols = 13;
  match.tile = 1.32;
  match.players = [];

  assert.equal(match.audioPanAt(0, 0), 0);
  assert.equal(match.audioPanAt(-999, 0), -0.75);
  assert.equal(match.audioPanAt(999, 0), 0.75);
  assert.equal(match.audioPanAt(Number.NaN), 0);

  match.players = [{ id: 1, x: 4, z: -2 }];
  match.renderer = { viewPlayerId: 1, viewZoom: 1, cameraRight: [1, 0, 0] };
  assert.equal(match.audioPanAt(4, -2), 0, "the followed player is the acoustic center");
  assert.ok(match.audioPanAt(6, -2) > 0);
  assert.ok(match.audioPanAt(2, -2) < 0);
  match.renderer.cameraRight = [0, 0, 1];
  assert.ok(match.audioPanAt(4, 0) > 0, "panning follows the rendered camera right vector");
});

test("audio graph publication is atomic and a failed build can retry", async () => {
  const instances = [];
  class RetryAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.failGraph = instances.length === 0;
      instances.push(this);
    }

    createConvolver() {
      if (this.failGraph) throw new Error("simulated graph failure");
      return super.createConvolver();
    }
  }
  const SfxEngine = loadSfxEngine({
    window: { AudioContext: RetryAudioContext, setTimeout, clearTimeout }
  });
  const sfx = new SfxEngine();

  await assert.rejects(sfx.start(), /simulated graph failure/);
  assert.equal(sfx.ctx, null);
  assert.equal(sfx.master, null);
  assert.equal(Object.keys(sfx.busDry).length, 0);
  assert.equal(instances[0].state, "closed");

  await sfx.start();
  assert.equal(sfx.ctx, instances[1]);
  assert.ok(sfx.master);
  assert.deepEqual(Object.keys(sfx.busDry).sort(),
    Object.keys(SfxEngine.VOLUME_DEFAULTS).filter((name) => name !== "master").sort());
});

test("a retry waits for asynchronous cleanup of a failed candidate context", async () => {
  const instances = [];
  let finishClose = null;
  class SlowCleanupAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.failGraph = instances.length === 0;
      instances.push(this);
    }

    createConvolver() {
      if (this.failGraph) throw new Error("candidate failed");
      return super.createConvolver();
    }

    close() {
      this.closeCalls += 1;
      return new Promise((resolve) => {
        finishClose = () => {
          this.state = "closed";
          resolve();
        };
      });
    }
  }
  const SfxEngine = loadSfxEngine({
    window: { AudioContext: SlowCleanupAudioContext, setTimeout, clearTimeout }
  });
  const sfx = new SfxEngine();
  await assert.rejects(sfx.start(), /candidate failed/);
  const retry = sfx.start();
  await Promise.resolve();
  assert.equal(instances.length, 1, "retry must not allocate before the failed context closes");
  finishClose();
  await retry;
  assert.equal(instances.length, 2);
  assert.equal(sfx.ctx, instances[1]);
});

test("concurrent starts share one resume and a timed-out resume can retry", async () => {
  class DeferredAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.state = "suspended";
    }

    resume() {
      this.resumeCalls += 1;
      return new Promise((resolve) => {
        this.releaseResume = () => {
          this.state = "running";
          resolve();
        };
      });
    }
  }
  const SharedEngine = loadSfxEngine({
    window: { AudioContext: DeferredAudioContext, setTimeout, clearTimeout }
  });
  const shared = new SharedEngine();
  const first = shared.start();
  const second = shared.start();
  await Promise.resolve();
  assert.equal(shared.ctx.resumeCalls, 1);
  shared.ctx.releaseResume();
  await Promise.all([first, second]);
  assert.equal(shared.ctx.state, "running");

  let fireTimeout = null;
  class HangingAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.state = "suspended";
    }

    resume() {
      this.resumeCalls += 1;
      return new Promise(() => {});
    }
  }
  const RetryEngine = loadSfxEngine({
    window: {
      AudioContext: HangingAudioContext,
      setTimeout(callback) {
        fireTimeout = callback;
        return 17;
      },
      clearTimeout() {}
    }
  });
  const retry = new RetryEngine();
  const hanging = retry.start();
  await Promise.resolve();
  fireTimeout();
  await assert.rejects(hanging, /timed out/);
  assert.equal(retry._resumePromise, null);
  retry.ctx.resume = function resumeAfterGesture() {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  };
  await retry.start();
  assert.equal(retry.ctx.state, "running");
  assert.equal(retry.ctx.resumeCalls, 2);
});

test("a superseded resume stays bound to its original AudioContext", async () => {
  const instances = [];
  class RebuiltAudioContext extends FakeAudioContext {
    constructor() {
      super();
      instances.push(this);
      if (instances.length === 1) this.state = "suspended";
    }

    resume() {
      this.resumeCalls += 1;
      return new Promise((resolve) => {
        this.finishResume = () => {
          this.state = "running";
          resolve();
        };
      });
    }
  }
  const SfxEngine = loadSfxEngine({
    window: { AudioContext: RebuiltAudioContext, setTimeout, clearTimeout }
  });
  const sfx = new SfxEngine();
  const oldStart = sfx.start();
  assert.equal(instances[0].resumeCalls, 1);
  instances[0].state = "closed";
  const rebuiltStart = sfx.start();
  await rebuiltStart;
  assert.equal(instances.length, 2);
  assert.equal(instances[1].resumeCalls, 0);
  instances[0].finishResume();
  await oldStart;
  assert.equal(instances[0].resumeCalls, 1);
  assert.equal(instances[1].resumeCalls, 0);
  assert.equal(sfx.ctx, instances[1]);
});

test("pending audio preserves danger cues, deduplicates sources and drops stale routine events", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();

  sfx._queuePendingEffect("effect", ["bombTick", 1, {}]);
  assert.equal(sfx._pendingEffects.length, 0, "fuse ticks are never replayed late");
  for (let index = 0; index < 12; index++) {
    sfx._queuePendingEffect("effect", ["pickup", 1, { sourceId: `pickup-${index}` }]);
  }
  sfx._queuePendingEffect("explosion", [0.8, { profile: "blood", sourceId: 77 }]);
  sfx._queuePendingEffect("explosion", [1.1, { profile: "blood", sourceId: 77 }]);
  assert.equal(sfx._pendingEffects.length, 12);
  const queuedBlast = sfx._pendingEffects.filter((entry) => entry.sourceKey === "explosion:blood:77");
  assert.equal(queuedBlast.length, 1);
  assert.equal(queuedBlast[0].args[0], 1.1, "the newest strength replaces the stale copy");

  const now = Date.now();
  for (const entry of sfx._pendingEffects) {
    if (entry.priority === 0) entry.queuedAt = now - 400;
  }
  const played = [];
  sfx.ctx = { state: "running" };
  sfx.effect = (...args) => played.push(["effect", ...args]);
  sfx.explosion = (...args) => played.push(["explosion", ...args]);
  sfx._flushPendingEffects();
  assert.equal(played.length, 1);
  assert.equal(played[0][0], "explosion");
  assert.equal(sfx._pendingEffects.length, 0);
});

test("the fresh gesture cue leads a coalesced pending blast backlog", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  for (let id = 1; id <= 8; id++) {
    sfx._queuePendingEffect("explosion", [1, { sourceId: id }]);
  }
  sfx._queuePendingEffect("effect", ["bomb", 1, { sourceId: "fresh" }]);
  const played = [];
  sfx.ctx = { state: "running" };
  sfx.effect = (...args) => played.push(["effect", ...args]);
  sfx.explosion = (...args) => played.push(["explosion", ...args]);

  sfx._flushPendingEffects();
  assert.equal(played[0][0], "effect");
  assert.equal(played[0][1], "bomb");
  assert.equal(played.filter(([kind]) => kind === "explosion").length, 1);
  assert.equal(played.find(([kind]) => kind === "explosion")[2].sourceId, 8,
    "the newest pending blast wins instead of the oldest");
});

test("voice cleanup is idempotent and old generations cannot decrement a rebuilt graph", () => {
  const SfxEngine = loadSfxEngine();
  const sfx = new SfxEngine();
  const source = {};
  const node = new FakeAudioNode();
  sfx._activeVoices = 1;
  const release = sfx._trackVoice(source, [node]);
  source.onended();
  source.onended();
  release();
  assert.equal(sfx._activeVoices, 0);
  assert.equal(node.disconnectCount, 1);

  const staleSource = {};
  const staleNode = new FakeAudioNode();
  sfx._activeVoices = 1;
  sfx._trackVoice(staleSource, [staleNode]);
  sfx._resetAudioGraph();
  sfx._activeVoices = 3;
  staleSource.onended();
  assert.equal(sfx._activeVoices, 3);
  assert.equal(staleNode.disconnectCount, 1);
});

test("priority blast layers still start when routine voices fill their budget", async () => {
  const SfxEngine = loadSfxEngine({
    window: { AudioContext: FakeAudioContext, setTimeout, clearTimeout }
  });
  const sfx = new SfxEngine();
  await sfx.start();
  while (sfx._claimVoice(false)) { /* fill the routine allocation */ }
  const before = sfx.ctx.sources.length;
  sfx.explosion(1, { sourceId: "danger" });
  assert.ok(sfx.ctx.sources.length >= before + 4, "crack, body, sub and tail keep reserved voices");
  assert.ok(sfx._activeVoices <= SfxEngine.MAX_VOICES);
});

test("only audible blasts enter overlap and distant finishers keep their signature tail", () => {
  const SfxEngine = loadSfxEngine();
  const silent = new SfxEngine();
  silent.ctx = { state: "running", currentTime: 10 };
  silent.noiseBurst = () => false;
  silent.toneSweep = () => false;
  silent.explosion(1, { sourceId: "silent" });
  assert.equal(silent._recentBlasts.length, 0);
  assert.equal(silent.actionPulse, 0);

  const sfx = new SfxEngine();
  sfx.ctx = { state: "running", currentTime: 10 };
  const layers = [];
  sfx.noiseBurst = (time, options) => {
    layers.push([time, options]);
    return true;
  };
  sfx.toneSweep = (time, options) => {
    layers.push([time, options]);
    return true;
  };
  sfx.explosion(1, { profile: "arena", pan: -0.7, sourceId: "left" });
  const afterArena = layers.length;
  sfx.ctx.currentTime = 10.05;
  sfx.explosion(1, { profile: "finisher", pan: 0.7, sourceId: "right" });
  assert.equal(layers.length - afterArena, 5, "a distant finisher keeps core, tail and stinger");
});

test("fuse selection is invariant to bomb array order and uses the most advanced bomb pan", () => {
  const run = (bombs) => {
    const SfxEngine = loadSfxEngine();
    const sfx = new SfxEngine();
    const events = [];
    const game = {
      bombs: bombs.map((bomb) => ({ ...bomb, age: 0 })),
      particles: [],
      players: [],
      audioPanAt(x) {
        return x / 10;
      }
    };
    sfx.effect = (...args) => events.push(args);
    sfx.update(game, 0.016);
    for (const bomb of game.bombs) bomb.age = bomb.nextAge;
    sfx.update(game, 0.016);
    return events[0];
  };
  const bombs = [
    { id: "early", fuse: 2, nextAge: 1.6, x: -4, exploded: false },
    { id: "late", fuse: 2, nextAge: 1.64, x: 5, exploded: false }
  ];
  const forward = run(bombs);
  const reverse = run([...bombs].reverse());
  assert.equal(forward[1], reverse[1]);
  assert.equal(forward[2].pan, 0.5);
  assert.equal(reverse[2].pan, 0.5);
});

test("arena explosion emits once with camera pan and stable source metadata", () => {
  const Game = loadGameClass();
  const match = Object.create(Game.prototype);
  match.cols = 13;
  match.rows = 11;
  match.tile = 1.32;
  match.grid = Array.from({ length: match.rows }, () => Array(match.cols).fill(0));
  match.blasts = [];
  match.particles = [];
  match.players = [];
  match.bombs = [];
  match.renderer = { addShock() {}, viewPlayerId: 0 };
  match.spawnParticles = () => {};
  match.damageAtCells = () => {};
  const explosions = [];
  match.sfx = { explosion: (...args) => explosions.push(args) };
  const bomb = { id: 42, r: 5, c: 6, x: 3, z: -2, range: 0, ownerId: 1, exploded: false };
  match.bombs.push(bomb);

  match.explodeBomb(bomb);
  match.explodeBomb(bomb);
  assert.equal(explosions.length, 1);
  assert.equal(explosions[0][1].sourceId, 42);
  assert.equal(explosions[0][1].pan, match.audioPanAt(3, -2));
});

test("skill detonations lead their finisher and cannon catch-up emits one sound per frame", () => {
  const barrelBlock = rulesSource.slice(
    rulesSource.indexOf("detonateGangplankBarrel("),
    rulesSource.indexOf("updateGangplank(dt)")
  );
  const barrelSoundIndex = barrelBlock.indexOf('playSfxAt("barrelBoom"');
  const barrelHitIndex = barrelBlock.indexOf("this.hitSkill(");
  assert.ok(barrelSoundIndex >= 0 && barrelHitIndex >= 0);
  assert.ok(barrelSoundIndex < barrelHitIndex);

  const vladimirBlock = rulesSource.slice(
    rulesSource.indexOf("updateVladimir(dt)"),
    rulesSource.indexOf("blastPathClear(")
  );
  const bloodSoundIndex = vladimirBlock.indexOf('playSfxAt("hemoplaguePop"');
  const bloodHitIndex = vladimirBlock.indexOf('this.hitSkill(rival, 0.44');
  assert.ok(bloodSoundIndex >= 0 && bloodHitIndex >= 0);
  assert.ok(bloodSoundIndex < bloodHitIndex);

  const Game = loadGameClass();
  const match = Object.create(Game.prototype);
  match.players = [];
  match.gangplankBarrels = [];
  match.projectiles = [];
  match.rows = 2;
  match.cols = 2;
  match.grid = [[], []];
  match.tile = 1.32;
  match.gangplankBarrages = [{
    ownerId: 1, x: 0, z: 0, radius: 2, age: 2, fuse: 2.4, detonated: false, tick: -1
  }];
  const sounds = [];
  match.playSfxAt = (...args) => sounds.push(args);
  match.spawnParticles = () => {};
  match.updateGangplank(0.05);
  assert.equal(sounds.filter(([name]) => name === "cannonImpact").length, 1);
});
