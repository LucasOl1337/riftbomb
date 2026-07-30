"use strict";

    /**
     * Riftbomb SFX — modular Web Audio synth with per-action volume buses.
     *
     * Graph:
     *   voice → panner → dry/wet sends → [action bus] → dryBus / reverbBus
     *        → master → compressor → destination
     *
     * Controllers live in SFX_VOLUME_DEFAULTS + SfxEngine.setVolume(name, 0..1).
     * Map effect names → buses via SFX_ACTION_BUS.
     */

    /** Default linear gains. Tune here or via sfx.setVolume at runtime. */
    const SFX_VOLUME_DEFAULTS = Object.freeze({
      master: 0.78,
      // Arena bombs
      explosion: 0.55,
      bomb: 0.85,
      // Pickups / utility
      pickup: 1.0,
      // Movement / dashes
      dash: 1.0,
      // Skill projectiles & blades
      projectile: 1.0,
      cast: 0.95,
      impact: 0.88,
      // Ultimates / big channels
      ultimate: 0.9,
      // Finishers
      kill: 0.82,
      // Fallback / UI-ish tones
      ui: 1.0
    });

    /**
     * Which bus each effect(type) hits. Unknown types fall back to `ui`.
     * explosion() defaults to `explosion`; champion profiles preserve their action bus.
     */
    const SFX_ACTION_BUS = Object.freeze({
      bomb: "bomb",
      bombTick: "bomb",
      explosion: "explosion",

      pickup: "pickup",
      shield: "pickup",
      removeScurvy: "pickup",

      dash: "dash",
      shunpo: "dash",
      zedW: "dash",
      zedSwap: "dash",
      renektonE: "dash",
      renektonDice: "dash",
      sanguinePool: "dash",

      katQ: "projectile",
      zedQ: "projectile",
      gangplankQ: "projectile",
      daggerLand: "projectile",
      vladimirQ: "projectile",
      vladimirQEmpowered: "projectile",

      katW: "cast",
      powderKeg: "cast",
      gangplankE: "cast",

      hit: "impact",
      bladeHit: "impact",
      zedE: "impact",
      renektonW: "impact",
      renektonWEmpowered: "impact",
      voracity: "impact",

      deathLotus: "ultimate",
      ult: "ultimate",
      renektonQ: "ultimate",
      renektonQEmpowered: "ultimate",
      tidesOfBlood: "ultimate",
      deathMark: "ultimate",
      dominus: "ultimate",
      hemoplague: "ultimate",
      cannonBarrage: "ultimate",
      cannonImpact: "ultimate",

      kill: "kill",
      markPop: "kill",
      hemoplaguePop: "kill",
      barrelBoom: "kill"
    });

    const SFX_PULSE = Object.freeze({
      bomb: 0.2,
      bombTick: 0.05,
      pickup: 0.08,
      hit: 0.18,
      bladeHit: 0.2,
      deathLotus: 0.4,
      deathMark: 0.34,
      dominus: 0.38,
      cannonBarrage: 0.38
    });

    /** Fuse progress points are intentionally irregular so the last second accelerates. */
    const SFX_FUSE_TICKS = Object.freeze([0.32, 0.46, 0.58, 0.68, 0.76, 0.83, 0.89, 0.94, 0.975]);

    /** Keep routine effects from consuming the voices reserved for danger cues. */
    const SFX_MAX_VOICES = 40;
    const SFX_RESERVED_VOICES = 8;
    const SFX_PENDING_LIMIT = 12;
    const SFX_RESUME_TIMEOUT_MS = 1500;

    /**
     * Procedural blast identities. Arena bombs alone get the full pressure/debris tail;
     * champion detonations stay shorter and occupy a recognisably different band.
     */
    const SFX_BLAST_PROFILES = Object.freeze({
      arena: Object.freeze({
        level: 1,
        crackFilter: "highpass", crackFrom: 4300, crackTo: 1050, crackDuration: 0.045, crackGain: 0.09, crackDrive: 12,
        bodyFilter: "lowpass", bodyFrom: 2300, bodyTo: 105, bodyDuration: 0.6, bodyGain: 0.1, bodyDrive: 7,
        subFrom: 94, subTo: 36, subDuration: 0.54, subGain: 0.12,
        tailFrom: 1450, tailTo: 180, tailDuration: 0.52, tailGain: 0.052,
        debris: 2, debrisPitch: 1700, debrisGain: 0.012, reverb: 0.28, pulse: 0.3
      }),
      powder: Object.freeze({
        level: 0.65,
        crackFilter: "highpass", crackFrom: 5900, crackTo: 1450, crackDuration: 0.032, crackGain: 0.095, crackDrive: 9,
        bodyFilter: "bandpass", bodyFrom: 1500, bodyTo: 145, bodyDuration: 0.42, bodyGain: 0.1, bodyDrive: 6,
        subFrom: 108, subTo: 42, subDuration: 0.4, subGain: 0.085,
        tailFrom: 980, tailTo: 210, tailDuration: 0.34, tailGain: 0.038,
        debris: 2, debrisPitch: 920, debrisGain: 0.014, reverb: 0.2, pulse: 0.34,
        resonance: 245
      }),
      shadow: Object.freeze({
        level: 0.62,
        crackFilter: "bandpass", crackFrom: 3200, crackTo: 520, crackDuration: 0.075, crackGain: 0.075, crackDrive: 8,
        bodyFilter: "bandpass", bodyFrom: 820, bodyTo: 92, bodyDuration: 0.48, bodyGain: 0.085, bodyDrive: 5,
        subFrom: 126, subTo: 39, subDuration: 0.46, subGain: 0.09,
        tailFrom: 430, tailTo: 1200, tailDuration: 0.28, tailGain: 0.03,
        debris: 1, debrisPitch: 2500, debrisGain: 0.008, reverb: 0.36, pulse: 0.4,
        resonance: 610
      }),
      blood: Object.freeze({
        level: 0.6,
        crackFilter: "lowpass", crackFrom: 1250, crackTo: 260, crackDuration: 0.11, crackGain: 0.07, crackDrive: 4,
        bodyFilter: "lowpass", bodyFrom: 720, bodyTo: 82, bodyDuration: 0.52, bodyGain: 0.1, bodyDrive: 3,
        subFrom: 156, subTo: 44, subDuration: 0.54, subGain: 0.09,
        tailFrom: 520, tailTo: 96, tailDuration: 0.42, tailGain: 0.046,
        debris: 1, debrisPitch: 1100, debrisGain: 0.009, reverb: 0.32, pulse: 0.38,
        resonance: 176
      }),
      finisher: Object.freeze({
        level: 0.72,
        crackFilter: "highpass", crackFrom: 3400, crackTo: 780, crackDuration: 0.04, crackGain: 0.072, crackDrive: 6,
        bodyFilter: "lowpass", bodyFrom: 1100, bodyTo: 150, bodyDuration: 0.26, bodyGain: 0.07, bodyDrive: 4,
        subFrom: 118, subTo: 48, subDuration: 0.28, subGain: 0.07,
        tailFrom: 900, tailTo: 280, tailDuration: 0.2, tailGain: 0.026,
        debris: 0, debrisPitch: 1200, debrisGain: 0, reverb: 0.24, pulse: 0.42,
        resonance: 540, resonanceRatio: 1.5
      }),
      cannon: Object.freeze({
        level: 0.65,
        crackFilter: "highpass", crackFrom: 3900, crackTo: 900, crackDuration: 0.026, crackGain: 0.075, crackDrive: 8,
        bodyFilter: "lowpass", bodyFrom: 950, bodyTo: 130, bodyDuration: 0.26, bodyGain: 0.072, bodyDrive: 5,
        subFrom: 102, subTo: 46, subDuration: 0.3, subGain: 0.06,
        tailFrom: 680, tailTo: 220, tailDuration: 0.19, tailGain: 0.026,
        debris: 0, debrisPitch: 1100, debrisGain: 0, reverb: 0.2, pulse: 0.18,
        resonance: 180, resonanceRatio: 0.72
      })
    });

    class SfxEngine {
      constructor() {
        this.ctx = null;
        this.master = null;
        this.dryBus = null;
        this.reverbBus = null;
        this.reverb = null;
        this.reverbFilter = null;
        this.reverbTone = null;
        this.outputFilter = null;
        this.limiter = null;
        this.noiseBuffer = null;
        this.intensity = 0;
        this.actionPulse = 0;
        /** Fuse progress already ticked per live bomb id. */
        this._fuseProgress = new Map();
        /** @type {Record<string, number>} */
        this.volumes = { ...SFX_VOLUME_DEFAULTS };
        /** @type {Record<string, GainNode>} dry-side action buses */
        this.busDry = Object.create(null);
        /** @type {Record<string, GainNode>} wet-side action buses */
        this.busWet = Object.create(null);
        /** Active bus for nested synth helpers during one effect/explosion */
        this._routeBus = "ui";
        this._activeVoices = 0;
        this._voiceGeneration = 0;
        this._recentBlasts = [];
        this._pendingEffects = [];
        this._pendingSequence = 0;
        this._resumePromise = null;
        this._resumeContext = null;
        this._graphCleanupPromise = null;
      }

      async start() {
        if (this._graphCleanupPromise) {
          const cleanup = this._graphCleanupPromise;
          await cleanup;
          if (this._graphCleanupPromise === cleanup) this._graphCleanupPromise = null;
        }
        if (this.ctx?.state === "closed") this._resetAudioGraph();
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          const graph = this._createAudioGraph(AudioContext);
          Object.assign(this, graph);
          this._voiceGeneration += 1;
          this._activeVoices = 0;
          this._recentBlasts = [];
        }
        if (this.ctx.state !== "running") {
          if (!this._resumePromise || this._resumeContext !== this.ctx) {
            let timeoutId = null;
            const resumeContext = this.ctx;
            let resume;
            try {
              resume = Promise.resolve(resumeContext.resume());
            } catch (error) {
              resume = Promise.reject(error);
            }
            const timeout = new Promise((resolve, reject) => {
              timeoutId = window.setTimeout(
                () => reject(new Error("AudioContext resume timed out")),
                SFX_RESUME_TIMEOUT_MS
              );
            });
            this._resumePromise = Promise.race([resume, timeout]).finally(() => {
              if (timeoutId != null) window.clearTimeout(timeoutId);
            });
            this._resumeContext = resumeContext;
          }
          const resumeAttempt = this._resumePromise;
          const resumeContext = this._resumeContext;
          try {
            await resumeAttempt;
          } catch (error) {
            if (resumeContext !== this.ctx) return this.start();
            throw error;
          } finally {
            if (this._resumePromise === resumeAttempt) {
              this._resumePromise = null;
              this._resumeContext = null;
            }
          }
          if (resumeContext !== this.ctx) return this.start();
        }
        if (this.ctx.state !== "running") throw new Error(`AudioContext remained ${this.ctx.state}`);
        this._flushPendingEffects();
      }

      _createAudioGraph(AudioContext) {
        const ctx = new AudioContext();
        try {
          const master = ctx.createGain();
          master.gain.value = this.volumes.master;

          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -18;
          compressor.knee.value = 16;
          compressor.ratio.value = 6;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.15;

          const dryBus = ctx.createGain();
          dryBus.gain.value = 1;
          const reverbBus = ctx.createGain();
          reverbBus.gain.value = 1;
          const reverbFilter = ctx.createBiquadFilter();
          reverbFilter.type = "highpass";
          reverbFilter.frequency.value = 150;
          reverbFilter.Q.value = 0.7;
          const reverbTone = ctx.createBiquadFilter();
          reverbTone.type = "lowpass";
          reverbTone.frequency.value = 7000;
          reverbTone.Q.value = 0.5;
          const reverb = ctx.createConvolver();
          reverb.buffer = this.createImpulse(1.8, 2.7, ctx);
          reverbBus.connect(reverbFilter);
          reverbFilter.connect(reverbTone);
          reverbTone.connect(reverb);
          reverb.connect(master);
          dryBus.connect(master);

          const outputFilter = ctx.createBiquadFilter();
          outputFilter.type = "highpass";
          outputFilter.frequency.value = 30;
          outputFilter.Q.value = 0.72;
          const limiter = ctx.createWaveShaper();
          limiter.curve = this.softClipCurve();
          limiter.oversample = "2x";
          master.connect(outputFilter);
          outputFilter.connect(compressor);
          compressor.connect(limiter);
          limiter.connect(ctx.destination);

          const noiseBuffer = this.createNoise(2.2, ctx);
          const { busDry, busWet } = this._buildActionBuses(ctx, dryBus, reverbBus);
          return {
            ctx, master, dryBus, reverbBus, reverbFilter, reverbTone,
            reverb, outputFilter, limiter, noiseBuffer, busDry, busWet
          };
        } catch (error) {
          try {
            this._graphCleanupPromise = Promise.resolve(ctx.close?.()).catch(() => {});
          } catch {
            this._graphCleanupPromise = Promise.resolve();
          }
          throw error;
        }
      }

      _resetAudioGraph() {
        this._voiceGeneration += 1;
        this._activeVoices = 0;
        this._recentBlasts = [];
        this._resumePromise = null;
        this._resumeContext = null;
        this.ctx = null;
        this.master = null;
        this.dryBus = null;
        this.reverbBus = null;
        this.reverbFilter = null;
        this.reverbTone = null;
        this.reverb = null;
        this.outputFilter = null;
        this.limiter = null;
        this.noiseBuffer = null;
        this.busDry = Object.create(null);
        this.busWet = Object.create(null);
      }

      _queuePendingEffect(kind, args) {
        const priority = this._pendingPriority(kind, args);
        if (priority < 0) return;
        const queuedAt = Date.now();
        const options = kind === "explosion" ? args[1] : args[2];
        const actionKey = kind === "explosion" ? (options?.profile || "arena") : args[0];
        const sourceKey = options?.sourceId == null ? null : `${kind}:${actionKey}:${options.sourceId}`;
        if (sourceKey) {
          const duplicate = this._pendingEffects.find((entry) => entry.sourceKey === sourceKey);
          if (duplicate) {
            for (const entry of this._pendingEffects) entry.foreground = false;
            duplicate.args = args;
            duplicate.queuedAt = queuedAt;
            duplicate.order = ++this._pendingSequence;
            duplicate.priority = priority;
            duplicate.foreground = true;
            return;
          }
        }
        if (this._pendingEffects.length >= SFX_PENDING_LIMIT) {
          let weakestIndex = 0;
          for (let index = 1; index < this._pendingEffects.length; index++) {
            if (this._pendingEffects[index].priority < this._pendingEffects[weakestIndex].priority) {
              weakestIndex = index;
            }
          }
          if (priority < this._pendingEffects[weakestIndex].priority) return;
          this._pendingEffects.splice(weakestIndex, 1);
        }
        for (const entry of this._pendingEffects) entry.foreground = false;
        this._pendingEffects.push({
          kind, args, priority, queuedAt, sourceKey,
          foreground: true,
          order: ++this._pendingSequence
        });
      }

      _pendingPriority(kind, args) {
        if (kind === "explosion") return 3;
        const name = args[0] === "ult" ? "deathLotus" : args[0];
        if (name === "bombTick") return -1;
        if (["explosion", "barrelBoom", "markPop", "hemoplaguePop", "kill", "cannonImpact"].includes(name)) return 3;
        if (["shield", "hit", "bladeHit", "voracity"].includes(name)) return 2;
        if (name === "pickup") return 0;
        return 1;
      }

      _flushPendingEffects() {
        if (!this.ctx || this.ctx.state !== "running" || !this._pendingEffects.length) return;
        const now = Date.now();
        const eligible = this._pendingEffects.splice(0)
          .filter((entry) => now - entry.queuedAt <= (entry.priority >= 2 ? 900 : 300));
        const foreground = eligible
          .filter((entry) => entry.foreground)
          .sort((left, right) => right.order - left.order)[0] || null;
        const backlog = eligible
          .filter((entry) => entry !== foreground)
          .sort((left, right) => right.priority - left.priority || right.order - left.order);
        const pending = foreground ? [foreground] : [];
        let replayedBlast = foreground?.priority === 3;
        for (const entry of backlog) {
          if (entry.priority === 3 && replayedBlast) continue;
          pending.push(entry);
          if (entry.priority === 3) replayedBlast = true;
          if (pending.length >= 6) break;
        }
        for (const entry of pending) {
          if (entry.kind === "explosion") this.explosion(...entry.args);
          else this.effect(...entry.args);
        }
      }

      _buildActionBuses(ctx, dryBus, reverbBus) {
        const busDry = Object.create(null);
        const busWet = Object.create(null);
        for (const name of Object.keys(SFX_VOLUME_DEFAULTS)) {
          if (name === "master") continue;
          const dry = ctx.createGain();
          const wet = ctx.createGain();
          const value = this.volumes[name] ?? 1;
          dry.gain.value = value;
          wet.gain.value = value;
          dry.connect(dryBus);
          wet.connect(reverbBus);
          busDry[name] = dry;
          busWet[name] = wet;
        }
        return { busDry, busWet };
      }

      /** List bus names (including master). */
      listBuses() {
        return Object.keys(SFX_VOLUME_DEFAULTS);
      }

      /** Snapshot of all volumes 0..1. */
      getVolumes() {
        return { ...this.volumes };
      }

      getVolume(name) {
        const key = this._resolveBus(name);
        return this.volumes[key] ?? 1;
      }

      /**
       * Set a bus volume. Accepts bus name (explosion, impact…) or effect type (katQ, bomb…).
       * @param {string} name
       * @param {number} value linear 0..1 (clamped)
       */
      setVolume(name, value) {
        const key = this._resolveBus(name);
        const numeric = Number(value);
        const next = Number.isFinite(numeric) ? clamp(numeric, 0, 1) : this.volumes[key];
        this.volumes[key] = next;
        if (key === "master") {
          if (this.master) this.master.gain.value = next;
          return next;
        }
        if (this.busDry[key]) this.busDry[key].gain.value = next;
        if (this.busWet[key]) this.busWet[key].gain.value = next;
        return next;
      }

      resetVolumes() {
        for (const [key, value] of Object.entries(SFX_VOLUME_DEFAULTS)) {
          this.setVolume(key, value);
        }
        return this.getVolumes();
      }

      _resolveBus(name) {
        if (!name) return "ui";
        if (Object.prototype.hasOwnProperty.call(SFX_VOLUME_DEFAULTS, name)) return name;
        return SFX_ACTION_BUS[name] || SFX_ACTION_BUS[name === "ult" ? "deathLotus" : name] || "ui";
      }

      busForAction(actionName) {
        return this._resolveBus(actionName);
      }

      createNoise(seconds, context = this.ctx) {
        const length = Math.ceil(context.sampleRate * seconds);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        let previous = 0;
        for (let index = 0; index < length; index++) {
          const white = Math.random() * 2 - 1;
          previous = previous * 0.72 + white * 0.28;
          data[index] = previous;
        }
        return buffer;
      }

      createImpulse(seconds, decay, context = this.ctx) {
        const length = Math.ceil(context.sampleRate * seconds);
        const impulse = context.createBuffer(2, length, context.sampleRate);
        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
          const data = impulse.getChannelData(channel);
          for (let index = 0; index < length; index++) {
            const envelope = Math.pow(1 - index / length, decay);
            data[index] = (Math.random() * 2 - 1) * envelope;
          }
        }
        return impulse;
      }

      distortionCurve(amount = 18) {
        const samples = 1024;
        const curve = new Float32Array(samples);
        const drive = 1 + Math.max(0, Number(amount) || 0) * 0.12;
        const normalizer = Math.tanh(drive) || 1;
        for (let index = 0; index < samples; index++) {
          const value = index * 2 / (samples - 1) - 1;
          curve[index] = Math.tanh(value * drive) / normalizer;
        }
        return curve;
      }

      /** Final safety ceiling after compression (roughly -1 dBFS). */
      softClipCurve(ceiling = 0.89, drive = 0.6) {
        const samples = 1024;
        const curve = new Float32Array(samples);
        const normalizer = Math.tanh(drive) || 1;
        for (let index = 0; index < samples; index++) {
          const value = index * 2 / (samples - 1) - 1;
          curve[index] = ceiling * Math.tanh(value * drive) / normalizer;
        }
        return curve;
      }

      _claimVoice(priority = false) {
        const limit = priority ? SFX_MAX_VOICES : SFX_MAX_VOICES - SFX_RESERVED_VOICES;
        if (this._activeVoices >= limit) return false;
        this._activeVoices += 1;
        return true;
      }

      _trackVoice(source, nodes) {
        let active = true;
        const generation = this._voiceGeneration;
        const release = () => {
          if (!active) return;
          active = false;
          if (generation === this._voiceGeneration) {
            this._activeVoices = Math.max(0, this._activeVoices - 1);
          }
          for (const node of nodes) {
            try { node?.disconnect?.(); } catch { /* already disconnected */ }
          }
        };
        source.onended = release;
        return release;
      }

      /**
       * Route a voice into the active action bus (or explicit bus).
       * @param {AudioNode} node
       * @param {{ reverb?: number, pan?: number, dry?: number, bus?: string }} opts
       */
      connectSfx(node, { reverb = 0.16, pan = 0, dry = 1, bus } = {}) {
        if (!this.ctx || !this.dryBus) return [];
        const busName = this._resolveBus(bus || this._routeBus || "ui");
        const dryBus = this.busDry[busName] || this.busDry.ui;
        const wetBus = this.busWet[busName] || this.busWet.ui;
        const panner = typeof this.ctx.createStereoPanner === "function"
          ? this.ctx.createStereoPanner()
          : this.ctx.createGain();
        const dryGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        if (panner.pan) panner.pan.value = clamp(pan, -1, 1);
        dryGain.gain.value = dry;
        wetGain.gain.value = reverb;
        node.connect(panner);
        panner.connect(dryGain);
        panner.connect(wetGain);
        dryGain.connect(dryBus);
        wetGain.connect(wetBus);
        return [panner, dryGain, wetGain];
      }

      pulse(amount) {
        this.actionPulse = clamp(this.actionPulse + amount, 0, 1);
      }

      update(game, dt) {
        const activeBombs = game?.bombs?.length || 0;
        const particles = Math.min(1, (game?.particles?.length || 0) / 180);
        const hurt = Math.max(...(game?.players || []).map((player) => player.hurt || 0), 0);
        const target = clamp(activeBombs * 0.08 + particles * 0.48 + hurt * 0.7 + this.actionPulse, 0, 1);
        this.intensity = lerp(this.intensity, target, 1 - Math.pow(0.001, dt));
        this.actionPulse = Math.max(0, this.actionPulse - dt * 2.6);

        // Fuse ticks accelerate without replaying a backlog after hitches,
        // chain detonations or authoritative snapshot corrections.
        const bombs = Array.isArray(game?.bombs) ? game.bombs : [];
        const liveIds = new Set();
        let latestCrossedTick = null;
        let latestTickBomb = null;
        let latestTickProgress = -1;
        let latestTickId = null;
        for (const bomb of bombs) {
          if (bomb?.exploded || bomb?.id == null || !Number.isFinite(bomb.age) ||
              !Number.isFinite(bomb.fuse) || bomb.fuse <= 0) continue;
          liveIds.add(bomb.id);
          const progress = clamp(bomb.age / bomb.fuse, 0, 1);
          const previous = this._fuseProgress.get(bomb.id);
          if (previous == null) {
            this._fuseProgress.set(bomb.id, progress);
            continue;
          }
          const monotonicProgress = Math.max(previous, progress);
          if (monotonicProgress < 1) {
            for (const threshold of SFX_FUSE_TICKS) {
              const bombId = String(bomb.id);
              const winsTie = threshold === latestCrossedTick &&
                (monotonicProgress > latestTickProgress ||
                  (monotonicProgress === latestTickProgress &&
                    (latestTickId == null || bombId < latestTickId)));
              if (previous < threshold && monotonicProgress >= threshold &&
                  (latestCrossedTick == null || threshold > latestCrossedTick || winsTie)) {
                latestCrossedTick = threshold;
                latestTickBomb = bomb;
                latestTickProgress = monotonicProgress;
                latestTickId = bombId;
              }
            }
          }
          this._fuseProgress.set(bomb.id, monotonicProgress);
        }
        for (const id of this._fuseProgress.keys()) {
          if (!liveIds.has(id)) this._fuseProgress.delete(id);
        }
        // At most one click per rendered update, even with several synchronised bombs.
        if (latestCrossedTick != null) {
          const pan = typeof game?.audioPanAt === "function"
            ? game.audioPanAt(latestTickBomb?.x, latestTickBomb?.z)
            : 0;
          this.effect("bombTick", 0.55 + latestCrossedTick * 0.85, { pan });
        }
      }

      visualPulse() {
        return clamp(this.actionPulse * 0.86 + this.intensity * 0.28, 0, 1);
      }

      noiseBurst(time, {
        duration = 0.16,
        gain = 0.16,
        attack = 0.003,
        filter = "bandpass",
        frequency = 1200,
        endFrequency = 160,
        q = 0.7,
        playbackRate = 1,
        drive = 0,
        pan = 0,
        reverb = 0.18,
        dry = 1,
        bus,
        priority = false
      } = {}) {
        if (!this._claimVoice(priority)) return false;
        let release = null;
        try {
          const source = this.ctx.createBufferSource();
          const tone = this.ctx.createBiquadFilter();
          const envelope = this.ctx.createGain();
          const nodes = [source, tone, envelope];
          source.buffer = this.noiseBuffer;
          source.playbackRate.value = playbackRate;
          tone.type = filter;
          tone.Q.value = q;
          tone.frequency.setValueAtTime(Math.max(24, frequency), time);
          tone.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), time + duration);
          envelope.gain.setValueAtTime(0.0001, time);
          envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + attack);
          envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
          source.connect(tone);
          if (drive > 0) {
            const shaper = this.ctx.createWaveShaper();
            shaper.curve = this.distortionCurve(drive);
            shaper.oversample = "2x";
            tone.connect(shaper);
            shaper.connect(envelope);
            nodes.push(shaper);
          } else {
            tone.connect(envelope);
          }
          nodes.push(...this.connectSfx(envelope, { reverb, pan, dry, bus }));
          release = this._trackVoice(source, nodes);
          source.start(time, Math.random() * 0.8);
          source.stop(time + duration + 0.04);
          return true;
        } catch (error) {
          if (release) release();
          else this._activeVoices = Math.max(0, this._activeVoices - 1);
          console.warn("[sfx] Noise voice skipped:", error);
          return false;
        }
      }

      toneSweep(time, {
        from = 160,
        to = 42,
        duration = 0.3,
        gain = 0.14,
        type = "sine",
        pan = 0,
        reverb = 0.12,
        dry = 1,
        bus,
        priority = false
      } = {}) {
        if (!this._claimVoice(priority)) return false;
        let release = null;
        try {
          const oscillator = this.ctx.createOscillator();
          const envelope = this.ctx.createGain();
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(Math.max(20, from), time);
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + duration);
          envelope.gain.setValueAtTime(0.0001, time);
          envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.008);
          envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
          oscillator.connect(envelope);
          const nodes = [oscillator, envelope, ...this.connectSfx(envelope, { reverb, pan, dry, bus })];
          release = this._trackVoice(oscillator, nodes);
          oscillator.start(time);
          oscillator.stop(time + duration + 0.02);
          return true;
        } catch (error) {
          if (release) release();
          else this._activeVoices = Math.max(0, this._activeVoices - 1);
          console.warn("[sfx] Tone voice skipped:", error);
          return false;
        }
      }

      metalStrike(time, pitch = 520, gain = 0.08, pan = 0, reverb = 0.2, bus, priority = false) {
        [1, 1.47, 2.13].forEach((ratio, index) => {
          this.toneSweep(time, {
            from: pitch * ratio,
            to: pitch * ratio * 0.98,
            duration: 0.12 + index * 0.06,
            gain: gain / (index + 1),
            type: index === 0 ? "triangle" : "sine",
            pan,
            reverb,
            dry: 0.85,
            bus,
            priority
          });
        });
      }

      whoosh(time, duration = 0.24, from = 280, to = 1400, gain = 0.16, pan = 0, reverb = 0.14, bus, priority = false) {
        this.noiseBurst(time, {
          duration,
          gain,
          attack: 0.025,
          filter: "bandpass",
          frequency: from,
          endFrequency: to,
          q: 0.65,
          playbackRate: 0.82,
          drive: 6,
          pan,
          reverb,
          bus,
          priority
        });
      }

      effect(type, strength = 1, options = {}) {
        if (strength && typeof strength === "object") {
          options = strength;
          strength = options.strength ?? 1;
        }
        if (!this.ctx) return;
        if (this.ctx.state !== "running") {
          this._queuePendingEffect("effect", [type, strength, options]);
          void this.start().catch(() => {});
          return;
        }
        const time = this.ctx.currentTime;
        const name = type === "ult" ? "deathLotus" : type;
        const bus = this.busForAction(name);
        const requestedStrength = Number(strength);
        const empowered = name.endsWith("Empowered");
        const power = clamp((Number.isFinite(requestedStrength) ? requestedStrength : 1) *
          (empowered ? 1.12 : 1), 0.5, 1.45);
        const requestedPan = Number(options?.pan);
        const pan = Number.isFinite(requestedPan) ? clamp(requestedPan, -0.75, 0.75) : 0;
        const blastProfile = {
          explosion: "arena",
          barrelBoom: "powder",
          markPop: "shadow",
          hemoplaguePop: "blood",
          kill: "finisher",
          cannonImpact: "cannon"
        }[name];
        if (blastProfile) {
          this.explosion(Math.min(1.15, power), {
            ...options,
            profile: blastProfile,
            bus,
            pan
          });
          return;
        }

        const previousBus = this._routeBus;
        this._routeBus = bus;
        this.pulse(SFX_PULSE[name] ?? 0.16);
        try {
          if (name === "bombTick") {
            const pitch = 620 + (power - 0.5) * 1600;
            this.noiseBurst(time, {
              duration: 0.045, gain: 0.048 * power, filter: "bandpass",
              frequency: pitch, endFrequency: pitch * 0.62, q: 2.6,
              pan, reverb: 0.08, bus
            });
            return;
          }

          if (name === "pickup") {
            this.toneSweep(time, { from: 430, to: 980, duration: 0.16, gain: 0.052 * power, type: "sine", pan, reverb: 0.28, bus });
            this.toneSweep(time + 0.045, { from: 660, to: 1320, duration: 0.18, gain: 0.036 * power, type: "triangle", pan, reverb: 0.3, bus });
            return;
          }
          if (name === "shield") {
            this.noiseBurst(time, {
              duration: 0.12, gain: 0.075 * power, filter: "highpass",
              frequency: 3600, endFrequency: 920, q: 1.8, drive: 3,
              pan, reverb: 0.3, bus
            });
            this.metalStrike(time + 0.012, 880, 0.048 * power, pan, 0.34, bus);
            return;
          }
          if (name === "removeScurvy") {
            this.noiseBurst(time, {
              duration: 0.2, gain: 0.05 * power, filter: "lowpass",
              frequency: 720, endFrequency: 180, drive: 2, pan, reverb: 0.16, bus
            });
            this.toneSweep(time + 0.02, { from: 180, to: 460, duration: 0.28, gain: 0.05 * power, type: "triangle", pan, reverb: 0.24, bus });
            this.toneSweep(time + 0.08, { from: 270, to: 690, duration: 0.24, gain: 0.03 * power, pan, reverb: 0.26, bus });
            return;
          }

          if (name === "sanguinePool") {
            this.noiseBurst(time, {
              duration: 0.5, gain: 0.085 * power, attack: 0.04, filter: "lowpass",
              frequency: 620, endFrequency: 82, playbackRate: 0.65, drive: 2,
              pan, reverb: 0.28, bus
            });
            this.toneSweep(time, { from: 122, to: 38, duration: 0.48, gain: 0.065 * power, type: "triangle", pan, reverb: 0.18, bus });
            return;
          }
          if (name === "dash" || name === "shunpo" || name === "zedW" || name === "zedSwap"
            || name === "renektonE" || name === "renektonDice") {
            const shadow = name === "zedW" || name === "zedSwap";
            const reverse = name === "zedSwap";
            this.whoosh(time, 0.26, reverse ? 1200 : (shadow ? 360 : 220),
              reverse ? 150 : (shadow ? 1380 : 1050), 0.145 * power, pan, shadow ? 0.28 : 0.16, bus);
            this.toneSweep(time, {
              from: shadow ? 132 : 105, to: shadow ? 31 : 38,
              duration: 0.24, gain: 0.07 * power, type: shadow ? "triangle" : "sine",
              pan, reverb: shadow ? 0.26 : 0.12, bus
            });
            return;
          }

          if (name === "gangplankQ") {
            this.noiseBurst(time, {
              duration: 0.04, gain: 0.078 * power, attack: 0.001,
              filter: "highpass", frequency: 5600, endFrequency: 1350,
              drive: 7, pan, reverb: 0.14, bus
            });
            this.toneSweep(time, { from: 148, to: 62, duration: 0.13, gain: 0.052 * power, type: "triangle", pan, reverb: 0.12, bus });
            return;
          }
          if (name === "vladimirQ" || name === "vladimirQEmpowered") {
            this.noiseBurst(time, {
              duration: empowered ? 0.3 : 0.22, gain: 0.07 * power, attack: 0.025,
              filter: "bandpass", frequency: 260, endFrequency: empowered ? 1280 : 920,
              q: 0.8, playbackRate: 0.7, drive: 2, pan, reverb: 0.24, bus
            });
            this.toneSweep(time, { from: empowered ? 250 : 190, to: 74, duration: 0.3, gain: 0.055 * power, type: "triangle", pan, reverb: 0.2, bus });
            return;
          }
          if (name === "katQ" || name === "zedQ" || name === "daggerLand") {
            this.whoosh(time, 0.2, name === "zedQ" ? 390 : 250, name === "zedQ" ? 1420 : 1180, 0.13 * power, pan, name === "zedQ" ? 0.24 : 0.12, bus);
            this.metalStrike(time + 0.025, name === "zedQ" ? 460 : 580, 0.075 * power, pan, 0.16, bus);
            return;
          }

          if (name === "powderKeg" || name === "gangplankE") {
            this.toneSweep(time, { from: 178, to: 48, duration: 0.23, gain: 0.12 * power, type: "triangle", pan, reverb: 0.16, bus });
            this.noiseBurst(time + 0.015, {
              duration: 0.15, gain: 0.065 * power, filter: "lowpass",
              frequency: 1050, endFrequency: 180, drive: 2, pan, reverb: 0.14, bus
            });
            this.metalStrike(time + 0.025, 285, 0.035 * power, pan, 0.14, bus);
            return;
          }
          if (name === "katW") {
            this.whoosh(time, 0.28, 180, 760, 0.095 * power, pan, 0.2, bus);
            this.metalStrike(time + 0.08, 340, 0.055 * power, pan, 0.22, bus);
            return;
          }

          if (name === "hit" || name === "bladeHit" || name === "zedE"
            || name.startsWith("renektonW") || name === "voracity") {
            const shadow = name === "zedE";
            this.noiseBurst(time, {
              duration: 0.17, gain: 0.15 * power,
              filter: shadow ? "bandpass" : "lowpass",
              frequency: name === "bladeHit" ? 1450 : (shadow ? 980 : 760),
              endFrequency: shadow ? 180 : 125,
              drive: shadow ? 6 : 8, pan, reverb: shadow ? 0.24 : 0.12, bus
            });
            this.metalStrike(time + 0.015, name === "bladeHit" ? 610 : (shadow ? 430 : 365),
              0.065 * power, pan, shadow ? 0.24 : 0.15, bus);
            return;
          }

          if (name === "deathLotus") {
            for (let index = 0; index < 8; index++) {
              const offset = index * 0.12;
              const sweepPan = clamp(pan + (index % 2 ? 0.52 : -0.52), -0.7, 0.7);
              this.whoosh(time + offset, 0.19, 240, 1080, 0.09 * power, sweepPan, 0.18, bus);
              if (index % 2 === 0) this.metalStrike(time + offset + 0.02, 410 + index * 16, 0.038 * power, sweepPan, 0.2, bus);
            }
            this.toneSweep(time, { from: 104, to: 34, duration: 1.08, gain: 0.12 * power, reverb: 0.24, bus });
            return;
          }
          if (name.startsWith("renektonQ")) {
            for (let index = 0; index < (empowered ? 5 : 3); index++) {
              const offset = index * 0.055;
              this.whoosh(time + offset, 0.19, 170, empowered ? 980 : 760,
                0.08 * power, clamp(pan + (index % 2 ? 0.36 : -0.36), -0.7, 0.7), 0.14, bus);
            }
            this.toneSweep(time, { from: empowered ? 138 : 112, to: 42, duration: 0.48, gain: 0.105 * power, type: "triangle", pan, reverb: 0.16, bus });
            return;
          }
          if (name === "tidesOfBlood") {
            this.noiseBurst(time, {
              duration: 0.52, gain: 0.09 * power, attack: 0.06, filter: "lowpass",
              frequency: 840, endFrequency: 110, playbackRate: 0.68, drive: 3,
              pan, reverb: 0.3, bus
            });
            this.toneSweep(time, { from: 190, to: 46, duration: 0.58, gain: 0.09 * power, type: "triangle", pan, reverb: 0.22, bus });
            return;
          }

          if (name === "deathMark") {
            this.whoosh(time, 0.5, 1500, 150, 0.15 * power, pan, 0.38, bus);
            this.toneSweep(time, { from: 148, to: 34, duration: 0.82, gain: 0.13 * power, type: "triangle", pan, reverb: 0.4, bus });
            this.metalStrike(time + 0.08, 520, 0.035 * power, pan, 0.38, bus);
            return;
          }
          if (name === "dominus") {
            this.noiseBurst(time, {
              duration: 0.72, gain: 0.105 * power, attack: 0.035, filter: "lowpass",
              frequency: 680, endFrequency: 72, playbackRate: 0.58, drive: 5,
              pan, reverb: 0.3, bus
            });
            this.toneSweep(time, { from: 104, to: 42, duration: 0.88, gain: 0.14 * power, type: "triangle", pan, reverb: 0.28, bus });
            return;
          }
          if (name === "hemoplague") {
            this.noiseBurst(time, {
              duration: 0.66, gain: 0.085 * power, attack: 0.08, filter: "lowpass",
              frequency: 760, endFrequency: 92, playbackRate: 0.64, drive: 3,
              pan, reverb: 0.38, bus
            });
            this.toneSweep(time, { from: 210, to: 52, duration: 0.72, gain: 0.095 * power, type: "triangle", pan, reverb: 0.36, bus });
            return;
          }
          if (name === "cannonBarrage") {
            this.whoosh(time, 0.46, 220, 980, 0.12 * power, pan, 0.34, bus);
            this.toneSweep(time, { from: 116, to: 42, duration: 0.62, gain: 0.11 * power, type: "triangle", pan, reverb: 0.34, bus });
            this.metalStrike(time + 0.08, 360, 0.04 * power, pan, 0.3, bus);
            return;
          }

          if (name === "bomb") {
            // Heavy body, mechanism click, contact thud and a restrained metal tick.
            this.toneSweep(time, { from: 150, to: 38, duration: 0.2, gain: 0.13 * power, type: "triangle", pan, bus });
            this.noiseBurst(time, {
              duration: 0.065, gain: 0.085 * power, frequency: 2400,
              endFrequency: 480, q: 1.1, pan, reverb: 0.12, bus
            });
            this.noiseBurst(time + 0.05, {
              duration: 0.14, gain: 0.065 * power, filter: "lowpass",
              frequency: 700, endFrequency: 145, pan, reverb: 0.12, bus
            });
            this.metalStrike(time + 0.015, 490 + Math.random() * 45, 0.035 * power, pan, 0.16, bus);
            return;
          }

          // Unknown actions get a quiet UI acknowledgement, never a fake bomb plant.
          this.toneSweep(time, { from: 430, to: 280, duration: 0.11, gain: 0.028 * power, pan, reverb: 0.12, bus });
          this.noiseBurst(time, { duration: 0.04, gain: 0.018 * power, frequency: 1500, endFrequency: 520, pan, reverb: 0.08, bus });
        } catch (error) {
          console.warn(`[sfx] Effect ${name} skipped:`, error);
        } finally {
          this._routeBus = previousBus;
        }
      }

      explosion(strength = 1, options = {}) {
        if (typeof options === "string") options = { profile: options };
        if (!this.ctx) return;
        if (this.ctx.state !== "running") {
          this._queuePendingEffect("explosion", [strength, options]);
          void this.start().catch(() => {});
          return;
        }
        const time = this.ctx.currentTime;
        const profileName = Object.prototype.hasOwnProperty.call(SFX_BLAST_PROFILES, options.profile)
          ? options.profile
          : "arena";
        const profile = SFX_BLAST_PROFILES[profileName];
        const bus = this._resolveBus(options.bus || (profileName === "arena" ? "explosion" : "kill"));
        const requestedPan = Number(options.pan);
        const pan = Number.isFinite(requestedPan) ? clamp(requestedPan, -0.75, 0.75) : 0;
        const requestedStrength = Number(strength);
        const power = clamp(Number.isFinite(requestedStrength) ? requestedStrength : 1, 0.55, 1.25);
        const chainDepth = clamp(Number(options.chainDepth) || 0, 0, 4);
        const sourceKey = options.sourceId == null ? null : `${profileName}:${options.sourceId}`;
        this._recentBlasts = this._recentBlasts.filter((blast) => {
          const delta = time - blast.time;
          return delta >= 0 && delta < 0.12;
        });
        if (sourceKey && this._recentBlasts.some((blast) => blast.sourceKey === sourceKey)) return;
        const overlap = this._recentBlasts.length;
        const nearbyOverlap = this._recentBlasts.some((blast) => Math.abs(blast.pan - pan) <= 0.28);
        const secondary = chainDepth > 0 || options.supporting === true ||
          (profileName === "finisher" && nearbyOverlap) ||
          (profileName === "arena" && overlap > 0);
        const mix = power * profile.level /
          Math.sqrt(1 + overlap * 0.65 + chainDepth * 0.65);
        const previousBus = this._routeBus;
        this._routeBus = bus;

        try {
          const crackStarted = this.noiseBurst(time, {
            duration: profile.crackDuration, gain: profile.crackGain * mix,
            attack: 0.001, filter: profile.crackFilter,
            frequency: profile.crackFrom, endFrequency: profile.crackTo,
            q: 1.05, drive: profile.crackDrive, pan, reverb: profile.reverb * 0.42,
            bus, priority: true
          });
          const bodyStarted = this.noiseBurst(time + 0.004, {
            duration: profile.bodyDuration, gain: profile.bodyGain * mix,
            attack: 0.006, filter: profile.bodyFilter,
            frequency: profile.bodyFrom, endFrequency: profile.bodyTo,
            q: 0.72, playbackRate: profileName === "blood" ? 0.62 : 0.78,
            drive: profile.bodyDrive, pan, reverb: profile.reverb * 0.68,
            bus, priority: true
          });
          const subStarted = this.toneSweep(time + 0.002, {
            from: profile.subFrom, to: profile.subTo,
            duration: profile.subDuration, gain: profile.subGain * mix,
            type: ["blood", "powder", "cannon"].includes(profileName) ? "triangle" : "sine",
            pan, reverb: 0.08, bus, priority: true
          });
          if (!crackStarted && !bodyStarted && !subStarted) return;
          this._recentBlasts.push({ time, sourceKey, profile: profileName, pan });
          this.pulse(profile.pulse * Math.min(1, power) * (secondary ? 0.62 : 1));

          if (!secondary) {
            this.noiseBurst(time + 0.016, {
              duration: profile.tailDuration, gain: profile.tailGain * mix,
              attack: 0.018, filter: "lowpass",
              frequency: profile.tailFrom, endFrequency: profile.tailTo,
              playbackRate: profileName === "blood" ? 0.58 : 0.76,
              drive: 2, pan, reverb: profile.reverb, bus, priority: true
            });
          }

          if (profile.resonance) {
            this.toneSweep(time + 0.018, {
              from: profile.resonance,
              to: profile.resonance * (profile.resonanceRatio ?? (profileName === "shadow" ? 0.42 : 0.62)),
              duration: Math.min(0.36, profile.bodyDuration),
              gain: 0.026 * mix,
              type: ["blood", "powder", "cannon"].includes(profileName) ? "triangle" : "sine",
              pan, reverb: profile.reverb, bus, priority: true
            });
          }

          const debrisCount = secondary ? 0 : profile.debris;
          for (let index = 0; index < debrisCount; index++) {
            const spread = (index - (debrisCount - 1) / 2) * 0.12;
            this.noiseBurst(time + 0.1 + index * 0.065 + Math.random() * 0.025, {
              duration: 0.08 + Math.random() * 0.06,
              gain: profile.debrisGain * mix,
              frequency: profile.debrisPitch * (0.86 + Math.random() * 0.28),
              endFrequency: 180 + Math.random() * 220,
              q: 1.15, playbackRate: 0.88 + Math.random() * 0.22,
              drive: 4, pan: clamp(pan + spread, -0.78, 0.78),
              reverb: profile.reverb, bus
            });
          }
        } catch (error) {
          console.warn(`[sfx] ${profileName} blast skipped:`, error);
        } finally {
          this._routeBus = previousBus;
        }
      }
    }

    // Exposed for settings UI / debugging (also on the instance).
    SfxEngine.VOLUME_DEFAULTS = SFX_VOLUME_DEFAULTS;
    SfxEngine.ACTION_BUS = SFX_ACTION_BUS;
    SfxEngine.BLAST_PROFILES = SFX_BLAST_PROFILES;
    SfxEngine.MAX_VOICES = SFX_MAX_VOICES;
