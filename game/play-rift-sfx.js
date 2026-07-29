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
      explosion: 0.15,
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
     * explosion() always uses the `explosion` bus.
     */
    const SFX_ACTION_BUS = Object.freeze({
      bomb: "bomb",
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

      kill: "kill",
      markPop: "kill",
      hemoplaguePop: "kill",
      barrelBoom: "kill"
    });

    const SFX_PULSE = Object.freeze({
      bomb: 0.12,
      pickup: 0.08,
      hit: 0.18,
      bladeHit: 0.2,
      kill: 0.42,
      deathLotus: 0.4,
      deathMark: 0.34,
      markPop: 0.4,
      dominus: 0.38,
      hemoplaguePop: 0.38,
      cannonBarrage: 0.38,
      barrelBoom: 0.34
    });

    class SfxEngine {
      constructor() {
        this.ctx = null;
        this.master = null;
        this.dryBus = null;
        this.reverbBus = null;
        this.reverb = null;
        this.noiseBuffer = null;
        this.intensity = 0;
        this.actionPulse = 0;
        /** @type {Record<string, number>} */
        this.volumes = { ...SFX_VOLUME_DEFAULTS };
        /** @type {Record<string, GainNode>} dry-side action buses */
        this.busDry = Object.create(null);
        /** @type {Record<string, GainNode>} wet-side action buses */
        this.busWet = Object.create(null);
        /** Active bus for nested synth helpers during one effect/explosion */
        this._routeBus = "ui";
      }

      async start() {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          this.ctx = new AudioContext();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.volumes.master;

          const compressor = this.ctx.createDynamicsCompressor();
          compressor.threshold.value = -18;
          compressor.knee.value = 16;
          compressor.ratio.value = 6;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.22;

          this.dryBus = this.ctx.createGain();
          this.dryBus.gain.value = 1;
          this.reverbBus = this.ctx.createGain();
          this.reverbBus.gain.value = 1;
          this.reverb = this.ctx.createConvolver();
          this.reverb.buffer = this.createImpulse(1.8, 2.7);
          this.reverbBus.connect(this.reverb);
          this.reverb.connect(this.master);
          this.dryBus.connect(this.master);
          this.master.connect(compressor);
          compressor.connect(this.ctx.destination);
          this.noiseBuffer = this.createNoise(2.2);
          this._createActionBuses();
        }
        if (this.ctx.state === "suspended") await this.ctx.resume();
      }

      _createActionBuses() {
        for (const name of Object.keys(SFX_VOLUME_DEFAULTS)) {
          if (name === "master") continue;
          const dry = this.ctx.createGain();
          const wet = this.ctx.createGain();
          const value = this.volumes[name] ?? 1;
          dry.gain.value = value;
          wet.gain.value = value;
          dry.connect(this.dryBus);
          wet.connect(this.reverbBus);
          this.busDry[name] = dry;
          this.busWet[name] = wet;
        }
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
        const next = clamp(Number(value), 0, 1);
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

      createNoise(seconds) {
        const length = Math.ceil(this.ctx.sampleRate * seconds);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let previous = 0;
        for (let index = 0; index < length; index++) {
          const white = Math.random() * 2 - 1;
          previous = previous * 0.72 + white * 0.28;
          data[index] = previous;
        }
        return buffer;
      }

      createImpulse(seconds, decay) {
        const length = Math.ceil(this.ctx.sampleRate * seconds);
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
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
        const samples = 256;
        const curve = new Float32Array(samples);
        const k = Math.max(1, amount);
        for (let index = 0; index < samples; index++) {
          const value = index * 2 / (samples - 1) - 1;
          curve[index] = (3 + k) * value * 20 * Math.PI / (Math.PI + k * Math.abs(value));
        }
        return curve;
      }

      /**
       * Route a voice into the active action bus (or explicit bus).
       * @param {AudioNode} node
       * @param {{ reverb?: number, pan?: number, dry?: number, bus?: string }} opts
       */
      connectSfx(node, { reverb = 0.16, pan = 0, dry = 1, bus } = {}) {
        if (!this.ctx || !this.dryBus) return;
        const busName = this._resolveBus(bus || this._routeBus || "ui");
        const dryBus = this.busDry[busName] || this.busDry.ui;
        const wetBus = this.busWet[busName] || this.busWet.ui;
        const panner = this.ctx.createStereoPanner();
        const dryGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        panner.pan.value = clamp(pan, -1, 1);
        dryGain.gain.value = dry;
        wetGain.gain.value = reverb;
        node.connect(panner);
        panner.connect(dryGain);
        panner.connect(wetGain);
        dryGain.connect(dryBus);
        wetGain.connect(wetBus);
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
        bus
      } = {}) {
        const source = this.ctx.createBufferSource();
        const tone = this.ctx.createBiquadFilter();
        const envelope = this.ctx.createGain();
        let output = envelope;
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
        tone.connect(envelope);
        if (drive > 0) {
          const shaper = this.ctx.createWaveShaper();
          shaper.curve = this.distortionCurve(drive);
          shaper.oversample = "2x";
          envelope.connect(shaper);
          output = shaper;
        }
        this.connectSfx(output, { reverb, pan, dry, bus });
        source.start(time, Math.random() * 0.8);
        source.stop(time + duration + 0.04);
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
        bus
      } = {}) {
        const oscillator = this.ctx.createOscillator();
        const envelope = this.ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, from), time);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + duration);
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(envelope);
        this.connectSfx(envelope, { reverb, pan, dry, bus });
        oscillator.start(time);
        oscillator.stop(time + duration + 0.02);
      }

      metalStrike(time, pitch = 520, gain = 0.08, pan = 0, reverb = 0.2, bus) {
        [1, 1.47, 2.13].forEach((ratio, index) => {
          const oscillator = this.ctx.createOscillator();
          const envelope = this.ctx.createGain();
          oscillator.type = index === 0 ? "triangle" : "sine";
          oscillator.frequency.value = pitch * ratio;
          envelope.gain.setValueAtTime(gain / (index + 1), time);
          envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.12 + index * 0.06);
          oscillator.connect(envelope);
          this.connectSfx(envelope, { reverb, pan, dry: 0.85, bus });
          oscillator.start(time);
          oscillator.stop(time + 0.22);
        });
      }

      whoosh(time, duration = 0.24, from = 280, to = 1400, gain = 0.16, pan = 0, reverb = 0.14, bus) {
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
          bus
        });
      }

      hexPulse(time, {
        from = 92,
        to = 42,
        duration = 0.4,
        gain = 0.1,
        pan = 0,
        reverb = 0.3,
        bus
      } = {}) {
        this.toneSweep(time, { from, to, duration, gain, type: "sine", pan, reverb, bus });
        this.toneSweep(time + 0.012, {
          from: from * 1.5,
          to: to * 1.22,
          duration: duration * 0.78,
          gain: gain * 0.38,
          type: "triangle",
          pan: -pan,
          reverb,
          bus
        });
      }

      effect(type, strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        const name = type === "ult" ? "deathLotus" : type;
        const bus = this.busForAction(name);
        this._routeBus = bus;
        const power = clamp(strength, 0.5, 1.45);
        const pan = (Math.random() * 2 - 1) * 0.46;
        this.pulse(SFX_PULSE[name] ?? 0.16);

        try {
          if (name === "pickup" || name === "shield" || name === "removeScurvy") {
            this.hexPulse(time, { gain: 0.08 * power, pan, reverb: 0.32, bus });
            this.metalStrike(time + 0.04, 330, 0.04 * power, -pan, 0.3, bus);
            return;
          }
          if (name === "dash" || name === "shunpo" || name === "zedW" || name === "zedSwap"
            || name === "renektonE" || name === "renektonDice" || name === "sanguinePool") {
            this.whoosh(time, 0.26, name === "zedSwap" ? 1100 : 220, name === "zedSwap" ? 150 : 1050, 0.16 * power, pan, 0.18, bus);
            this.toneSweep(time, { from: 105, to: 35, duration: 0.24, gain: 0.08 * power, pan: -pan, bus });
            return;
          }
          if (name === "katQ" || name === "zedQ" || name === "gangplankQ" || name === "daggerLand"
            || name === "vladimirQ" || name === "vladimirQEmpowered") {
            this.whoosh(time, 0.2, 250, 1180, 0.14 * power, pan, 0.12, bus);
            this.metalStrike(time + 0.025, 540, 0.09 * power, -pan, 0.16, bus);
            return;
          }
          if (name === "katW" || name === "powderKeg") {
            this.whoosh(time, 0.28, 180, 720, 0.1 * power, pan, 0.2, bus);
            this.metalStrike(time + 0.08, 310, 0.06 * power, -pan, 0.22, bus);
            return;
          }
          if (name === "hit" || name === "bladeHit" || name === "zedE"
            || name.startsWith("renektonW") || name === "voracity") {
            this.noiseBurst(time, {
              duration: 0.18,
              gain: 0.2 * power,
              frequency: name === "bladeHit" ? 1300 : 720,
              endFrequency: 120,
              drive: 14,
              pan,
              reverb: 0.13,
              bus
            });
            this.metalStrike(time + 0.015, name === "bladeHit" ? 570 : 380, 0.08 * power, -pan, 0.16, bus);
            return;
          }
          if (name === "deathLotus" || name.startsWith("renektonQ") || name === "tidesOfBlood") {
            const count = name === "deathLotus" ? 9 : 4;
            for (let index = 0; index < count; index++) {
              const offset = index * (name === "deathLotus" ? 0.11 : 0.045);
              const sweepPan = index % 2 ? 0.58 : -0.58;
              this.whoosh(time + offset, 0.2, 230, 950, 0.11 * power, sweepPan, 0.16, bus);
              if (index % 2 === 0) this.metalStrike(time + offset + 0.02, 390 + index * 18, 0.05 * power, -sweepPan, 0.2, bus);
            }
            this.toneSweep(time, { from: 96, to: 29, duration: Math.max(0.45, count * 0.11), gain: 0.16 * power, reverb: 0.25, bus });
            return;
          }
          if (name === "deathMark" || name === "dominus" || name === "hemoplague"
            || name === "cannonBarrage") {
            this.whoosh(time, 0.48, 180, 820, 0.18 * power, pan, 0.34, bus);
            this.toneSweep(time, { from: 84, to: 23, duration: 0.95, gain: 0.2 * power, reverb: 0.4, bus });
            for (let index = 0; index < 4; index++) {
              this.metalStrike(time + 0.08 + index * 0.08, 410 - index * 55, 0.05 * power, index % 2 ? 0.35 : -0.35, 0.36, bus);
            }
            return;
          }
          if (name === "kill" || name === "markPop" || name === "hemoplaguePop"
            || name === "barrelBoom") {
            this.explosion(Math.min(1.15, power));
            return;
          }

          // plant bomb + generic fallback → bomb bus if type is bomb, else ui
          this.toneSweep(time, { from: 120, to: 38, duration: 0.22, gain: 0.11 * power, pan, bus });
          this.noiseBurst(time, { duration: 0.12, gain: 0.1 * power, frequency: 900, endFrequency: 180, pan, bus });
        } finally {
          this._routeBus = "ui";
        }
      }

      explosion(strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        const power = clamp(strength, 0.55, 1.25);
        const bus = "explosion";
        this._routeBus = bus;
        this.pulse(0.09 * power);
        try {
          // Softer drive + bus-level control to avoid clipping while keeping shape.
          this.noiseBurst(time, {
            duration: 0.11,
            gain: 0.07 * power,
            attack: 0.0015,
            filter: "highpass",
            frequency: 7600,
            endFrequency: 820,
            drive: 12,
            reverb: 0.28,
            bus
          });
          this.toneSweep(time + 0.004, {
            from: 82,
            to: 23,
            duration: 0.92,
            gain: 0.08 * power,
            reverb: 0.22,
            bus
          });
          this.noiseBurst(time + 0.008, {
            duration: 1.05,
            gain: 0.065 * power,
            attack: 0.012,
            filter: "lowpass",
            frequency: 2500,
            endFrequency: 68,
            playbackRate: 0.72,
            drive: 14,
            reverb: 0.42,
            bus
          });
          for (let index = 0; index < 6; index++) {
            const delay = 0.1 + index * 0.065 + Math.random() * 0.05;
            this.noiseBurst(time + delay, {
              duration: 0.08 + Math.random() * 0.13,
              gain: (0.01 + Math.random() * 0.008) * power,
              frequency: 900 + Math.random() * 2600,
              endFrequency: 170 + Math.random() * 360,
              q: 1.2,
              playbackRate: 0.85 + Math.random() * 0.45,
              drive: 6,
              pan: index / 3 - 0.85,
              reverb: 0.32,
              bus
            });
          }
        } finally {
          this._routeBus = "ui";
        }
      }

      async togglePause(paused) {
        if (!this.ctx) return;
        if (paused && this.ctx.state === "running") await this.ctx.suspend();
        if (!paused && this.ctx.state === "suspended") await this.ctx.resume();
      }
    }

    // Exposed for settings UI / debugging (also on the instance).
    SfxEngine.VOLUME_DEFAULTS = SFX_VOLUME_DEFAULTS;
    SfxEngine.ACTION_BUS = SFX_ACTION_BUS;
