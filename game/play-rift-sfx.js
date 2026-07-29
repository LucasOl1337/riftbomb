"use strict";

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
      }

      async start() {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          this.ctx = new AudioContext();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.82;

          const compressor = this.ctx.createDynamicsCompressor();
          compressor.threshold.value = -15;
          compressor.knee.value = 14;
          compressor.ratio.value = 5;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.24;

          this.dryBus = this.ctx.createGain();
          this.reverbBus = this.ctx.createGain();
          this.reverb = this.ctx.createConvolver();
          this.reverb.buffer = this.createImpulse(1.8, 2.7);
          this.reverbBus.connect(this.reverb);
          this.reverb.connect(this.master);
          this.dryBus.connect(this.master);
          this.master.connect(compressor);
          compressor.connect(this.ctx.destination);
          this.noiseBuffer = this.createNoise(2.2);
        }
        if (this.ctx.state === "suspended") await this.ctx.resume();
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

      connectSfx(node, { reverb = 0.16, pan = 0, dry = 1 } = {}) {
        if (!this.ctx || !this.dryBus) return;
        const panner = this.ctx.createStereoPanner();
        const dryGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        panner.pan.value = clamp(pan, -1, 1);
        dryGain.gain.value = dry;
        wetGain.gain.value = reverb;
        node.connect(panner);
        panner.connect(dryGain);
        panner.connect(wetGain);
        dryGain.connect(this.dryBus);
        wetGain.connect(this.reverbBus);
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
        dry = 1
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
        this.connectSfx(output, { reverb, pan, dry });
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
        dry = 1
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
        this.connectSfx(envelope, { reverb, pan, dry });
        oscillator.start(time);
        oscillator.stop(time + duration + 0.02);
      }

      metalStrike(time, pitch = 520, gain = 0.08, pan = 0, reverb = 0.2) {
        [1, 1.47, 2.13].forEach((ratio, index) => {
          const oscillator = this.ctx.createOscillator();
          const envelope = this.ctx.createGain();
          oscillator.type = index === 0 ? "triangle" : "sine";
          oscillator.frequency.value = pitch * ratio;
          envelope.gain.setValueAtTime(gain / (index + 1), time);
          envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.12 + index * 0.06);
          oscillator.connect(envelope);
          this.connectSfx(envelope, { reverb, pan, dry: 0.85 });
          oscillator.start(time);
          oscillator.stop(time + 0.22);
        });
      }

      whoosh(time, duration = 0.24, from = 280, to = 1400, gain = 0.16, pan = 0, reverb = 0.14) {
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
          reverb
        });
      }

      hexPulse(time, {
        from = 92,
        to = 42,
        duration = 0.4,
        gain = 0.1,
        pan = 0,
        reverb = 0.3
      } = {}) {
        this.toneSweep(time, { from, to, duration, gain, type: "sine", pan, reverb });
        this.toneSweep(time + 0.012, {
          from: from * 1.5,
          to: to * 1.22,
          duration: duration * 0.78,
          gain: gain * 0.38,
          type: "triangle",
          pan: -pan,
          reverb
        });
      }

      effect(type, strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        const name = type === "ult" ? "deathLotus" : type;
        const power = clamp(strength, 0.5, 1.45);
        const pan = (Math.random() * 2 - 1) * 0.46;
        this.pulse(({
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
        })[name] ?? 0.16);

        if (name === "pickup" || name === "shield" || name === "removeScurvy") {
          this.hexPulse(time, { gain: 0.08 * power, pan, reverb: 0.32 });
          this.metalStrike(time + 0.04, 330, 0.04 * power, -pan, 0.3);
          return;
        }
        if (name === "dash" || name === "shunpo" || name === "zedW" || name === "zedSwap"
          || name === "renektonE" || name === "renektonDice" || name === "sanguinePool") {
          this.whoosh(time, 0.26, name === "zedSwap" ? 1100 : 220, name === "zedSwap" ? 150 : 1050, 0.16 * power, pan, 0.18);
          this.toneSweep(time, { from: 105, to: 35, duration: 0.24, gain: 0.08 * power, pan: -pan });
          return;
        }
        if (name === "katQ" || name === "zedQ" || name === "gangplankQ" || name === "daggerLand") {
          this.whoosh(time, 0.2, 250, 1180, 0.14 * power, pan, 0.12);
          this.metalStrike(time + 0.025, 540, 0.09 * power, -pan, 0.16);
          return;
        }
        if (name === "katW" || name === "powderKeg") {
          this.whoosh(time, 0.28, 180, 720, 0.1 * power, pan, 0.2);
          this.metalStrike(time + 0.08, 310, 0.06 * power, -pan, 0.22);
          return;
        }
        if (name === "hit" || name === "bladeHit" || name === "zedE"
          || name.startsWith("renektonW") || name === "voracity") {
          this.noiseBurst(time, {
            duration: 0.18,
            gain: 0.2 * power,
            frequency: name === "bladeHit" ? 1300 : 720,
            endFrequency: 120,
            drive: 17,
            pan,
            reverb: 0.13
          });
          this.metalStrike(time + 0.015, name === "bladeHit" ? 570 : 380, 0.08 * power, -pan, 0.16);
          return;
        }
        if (name === "deathLotus" || name.startsWith("renektonQ") || name === "tidesOfBlood") {
          const count = name === "deathLotus" ? 9 : 4;
          for (let index = 0; index < count; index++) {
            const offset = index * (name === "deathLotus" ? 0.11 : 0.045);
            const sweepPan = index % 2 ? 0.58 : -0.58;
            this.whoosh(time + offset, 0.2, 230, 950, 0.11 * power, sweepPan, 0.16);
            if (index % 2 === 0) this.metalStrike(time + offset + 0.02, 390 + index * 18, 0.05 * power, -sweepPan, 0.2);
          }
          this.toneSweep(time, { from: 96, to: 29, duration: Math.max(0.45, count * 0.11), gain: 0.16 * power, reverb: 0.25 });
          return;
        }
        if (name === "deathMark" || name === "dominus" || name === "hemoplague"
          || name === "cannonBarrage") {
          this.whoosh(time, 0.48, 180, 820, 0.18 * power, pan, 0.34);
          this.toneSweep(time, { from: 84, to: 23, duration: 0.95, gain: 0.2 * power, reverb: 0.4 });
          for (let index = 0; index < 4; index++) {
            this.metalStrike(time + 0.08 + index * 0.08, 410 - index * 55, 0.05 * power, index % 2 ? 0.35 : -0.35, 0.36);
          }
          return;
        }
        if (name === "kill" || name === "markPop" || name === "hemoplaguePop"
          || name === "barrelBoom") {
          this.explosion(Math.min(1.15, power));
          return;
        }

        this.toneSweep(time, { from: 120, to: 38, duration: 0.22, gain: 0.11 * power, pan });
        this.noiseBurst(time, { duration: 0.12, gain: 0.1 * power, frequency: 900, endFrequency: 180, pan });
      }

      explosion(strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        const power = clamp(strength, 0.55, 1.25);
        // Keep the blast shape; another ~50% cut so bombs sit under combat SFX.
        this.pulse(0.09 * power);
        this.noiseBurst(time, {
          duration: 0.11,
          gain: 0.075 * power,
          attack: 0.0015,
          filter: "highpass",
          frequency: 7600,
          endFrequency: 820,
          drive: 22,
          reverb: 0.32
        });
        this.toneSweep(time + 0.004, { from: 82, to: 23, duration: 0.92, gain: 0.085 * power, reverb: 0.24 });
        this.noiseBurst(time + 0.008, {
          duration: 1.05,
          gain: 0.075 * power,
          attack: 0.012,
          filter: "lowpass",
          frequency: 2500,
          endFrequency: 68,
          playbackRate: 0.72,
          drive: 24,
          reverb: 0.5
        });
        for (let index = 0; index < 6; index++) {
          const delay = 0.1 + index * 0.065 + Math.random() * 0.05;
          this.noiseBurst(time + delay, {
            duration: 0.08 + Math.random() * 0.13,
            gain: (0.012 + Math.random() * 0.01) * power,
            frequency: 900 + Math.random() * 2600,
            endFrequency: 170 + Math.random() * 360,
            q: 1.2,
            playbackRate: 0.85 + Math.random() * 0.45,
            drive: 8,
            pan: index / 3 - 0.85,
            reverb: 0.36
          });
        }
      }

      async togglePause(paused) {
        if (!this.ctx) return;
        if (paused && this.ctx.state === "running") await this.ctx.suspend();
        if (!paused && this.ctx.state === "suspended") await this.ctx.resume();
      }
    }
