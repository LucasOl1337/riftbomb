"use strict";

    class MusicEngine {
      constructor() {
        this.ctx = null;
        this.master = null;
        this.musicBus = null;
        this.sfxBus = null;
        this.reverb = null;
        this.reverbTone = null;
        this.reverbGain = null;
        this.musicLevel = 0.68;
        this.compressor = null;
        this.analyser = null;
        this.freq = new Uint8Array(64);
        this.noiseBuffer = null;
        this.timer = null;
        this.nextStepTime = 0;
        this.stepIndex = 0;
        this.startedAt = 0;
        this.muted = false;
        this.energy = 0;
        this.bpm = 128;
        this.stepDuration = 60 / this.bpm / 4;
        this.totalBars = 128;
        this.totalSteps = this.totalBars * 16;
        this.duration = this.totalBars * 4 * 60 / this.bpm;
        this.sections = [
          { bar: 0, name: "Oracle prelude", intensity: 0.25 },
          { bar: 8, name: "Lane pressure", intensity: 0.42 },
          { bar: 24, name: "First blood", intensity: 0.68 },
          { bar: 40, name: "Hexcore descent", intensity: 0.5 },
          { bar: 56, name: "Rift surge", intensity: 0.82 },
          { bar: 72, name: "Baron call", intensity: 0.74 },
          { bar: 88, name: "Final push", intensity: 1 },
          { bar: 112, name: "Victory lap", intensity: 0.86 }
        ];
        this.chords = [
          [45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]
        ];
        this.bassRoots = [33, 29, 36, 31];
        this.lead = [69, 72, 76, 74, 72, 69, 67, 69, 72, 76, 79, 76, 74, 72, 69, 67];
        this.fallbackStart = performance.now() / 1000;
      }

      async start() {
        if (this.ctx) {
          if (this.ctx.state === "suspended") await this.ctx.resume();
          return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx({ latencyHint: "interactive" });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.84;
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicLevel;
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.96;
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.createImpulse(2.4, 3.6);
        this.reverbTone = this.ctx.createBiquadFilter();
        this.reverbTone.type = "lowpass";
        this.reverbTone.frequency.value = 7200;
        this.reverbTone.Q.value = 0.35;
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.42;
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -15;
        this.compressor.knee.value = 14;
        this.compressor.ratio.value = 6;
        this.compressor.attack.value = 0.0025;
        this.compressor.release.value = 0.24;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.72;
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.reverb.connect(this.reverbTone);
        this.reverbTone.connect(this.reverbGain);
        this.reverbGain.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
        this.noiseBuffer = this.createNoise(2.6);
        this.nextStepTime = this.ctx.currentTime + 0.06;
        this.startedAt = this.nextStepTime;
        this.stepIndex = 0;
        this.timer = setInterval(() => this.scheduler(), 25);
        this.scheduler();
      }

      createNoise(seconds) {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          last = last * 0.82 + white * 0.18;
          data[i] = white * 0.72 + last * 0.28;
        }
        return buffer;
      }

      createImpulse(seconds, decay) {
        const length = Math.floor(this.ctx.sampleRate * seconds);
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          let dark = 0;
          for (let i = 0; i < length; i++) {
            const envelope = Math.pow(1 - i / length, decay);
            const white = Math.random() * 2 - 1;
            dark = dark * 0.72 + white * 0.28;
            data[i] = (white * 0.42 + dark * 0.58) * envelope;
          }
          [0.031, 0.067, 0.113, 0.181].forEach((delay, index) => {
            const sample = Math.floor(delay * this.ctx.sampleRate);
            if (sample < length) data[sample] += (index % 2 ? -1 : 1) * (0.42 - index * 0.065);
          });
        }
        return impulse;
      }

      distortionCurve(amount = 18) {
        const samples = 2048;
        const curve = new Float32Array(samples);
        const radians = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
          const x = i * 2 / samples - 1;
          curve[i] = (3 + amount) * x * 20 * radians / (Math.PI + amount * Math.abs(x));
        }
        return curve;
      }

      midi(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
      }

      sectionForBar(bar) {
        let section = this.sections[0];
        for (const candidate of this.sections) if (bar >= candidate.bar) section = candidate;
        return section;
      }

      scheduler() {
        if (!this.ctx || this.ctx.state !== "running") return;
        while (this.nextStepTime < this.ctx.currentTime + 0.18) {
          this.scheduleStep(this.stepIndex, this.nextStepTime);
          this.nextStepTime += this.stepDuration;
          this.stepIndex = (this.stepIndex + 1) % this.totalSteps;
          if (this.stepIndex === 0) this.startedAt = this.nextStepTime;
        }
      }

      scheduleStep(index, time) {
        const step = index % 16;
        const bar = Math.floor(index / 16);
        const section = this.sectionForBar(bar);
        const localBar = bar % 4;
        const chordIndex = Math.floor(bar / 2) % this.chords.length;
        const intense = section.intensity;

        if (step === 0 || step === 8 || (intense > 0.8 && (step === 6 || step === 14))) {
          this.kick(time, step === 0 ? 1 : 0.78);
        }
        if (bar >= 8 && (step === 4 || step === 12)) this.snare(time, step === 12 ? 0.72 : 0.62);
        if (bar >= 4 && step % (intense > 0.65 ? 2 : 4) === 2) this.hat(time, 0.16 + intense * 0.12, false);
        if (intense > 0.72 && step % 2 === 1) this.hat(time, 0.08, true);

        if (step % 4 === 0 && bar >= 4) {
          const bassPattern = [0, 0, 7, 12];
          const note = this.bassRoots[chordIndex] + bassPattern[(step / 4 + localBar) % 4];
          this.bass(time, note, this.stepDuration * (intense > 0.7 ? 3.4 : 2.8), 0.14 + intense * 0.08);
        }

        if (step % 2 === 0 && bar >= 8) {
          const chord = this.chords[chordIndex];
          const arp = [0, 1, 2, 1, 2, 1, 0, 2][step / 2];
          const octave = intense > 0.75 && step >= 8 ? 24 : 12;
          this.pluck(time, chord[arp] + octave, 0.08 + intense * 0.035, 0.19);
        }

        if (step === 0 && bar % 2 === 0) {
          this.pad(time, this.chords[chordIndex], this.stepDuration * 31.4, 0.018 + intense * 0.018);
        }

        if ((bar >= 24 && bar < 40) || bar >= 56) {
          if (step % 2 === 0 && (intense > 0.7 || step % 4 === 0)) {
            const note = this.lead[(step / 2 + localBar * 2) % this.lead.length] + (bar >= 88 ? 12 : 0);
            this.leadVoice(time, note, this.stepDuration * 1.7, 0.035 + intense * 0.025);
          }
        }

        if (bar >= 88 && step === 15) this.riserTick(time, 0.1);
      }

      connect(node) {
        node.connect(this.musicBus || this.master);
      }

      connectSfx(node, { reverb = 0.16, pan = 0, dry = 1 } = {}) {
        let output = node;
        if (this.ctx.createStereoPanner) {
          const panner = this.ctx.createStereoPanner();
          panner.pan.value = clamp(pan, -1, 1);
          node.connect(panner);
          output = panner;
        }
        const dryGain = this.ctx.createGain();
        dryGain.gain.value = dry;
        output.connect(dryGain);
        dryGain.connect(this.sfxBus || this.master);
        if (this.reverb && reverb > 0) {
          const send = this.ctx.createGain();
          send.gain.value = reverb;
          output.connect(send);
          send.connect(this.reverb);
        }
      }

      duckMusic(amount = 0.22, duration = 0.5) {
        if (!this.musicBus || !this.ctx) return;
        const now = this.ctx.currentTime;
        const gain = this.musicBus.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(Math.min(this.musicLevel, Math.max(0.16, gain.value)), now);
        gain.linearRampToValueAtTime(this.musicLevel * (1 - amount), now + 0.018);
        gain.exponentialRampToValueAtTime(this.musicLevel, now + duration);
      }

      noiseBurst(time, {
        duration = 0.3,
        gain = 0.2,
        attack = 0.004,
        filter = "bandpass",
        frequency = 1600,
        endFrequency = 240,
        q = 0.8,
        playbackRate = 1,
        drive = 0,
        pan = 0,
        reverb = 0.16,
        dry = 1
      } = {}) {
        const source = this.ctx.createBufferSource();
        const tone = this.ctx.createBiquadFilter();
        const envelope = this.ctx.createGain();
        source.buffer = this.noiseBuffer;
        source.playbackRate.value = playbackRate;
        tone.type = filter;
        tone.Q.value = q;
        tone.frequency.setValueAtTime(Math.max(30, frequency), time);
        tone.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), time + duration);
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + Math.max(0.002, attack));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        source.connect(tone);
        if (drive > 0) {
          const shaper = this.ctx.createWaveShaper();
          shaper.curve = this.distortionCurve(drive);
          shaper.oversample = "2x";
          tone.connect(shaper);
          shaper.connect(envelope);
        } else {
          tone.connect(envelope);
        }
        this.connectSfx(envelope, { reverb, pan, dry });
        const available = Math.max(0, this.noiseBuffer.duration - duration - 0.02);
        source.start(time, Math.random() * Math.min(1.1, available), duration + 0.01);
        source.stop(time + duration + 0.025);
      }

      toneSweep(time, {
        from = 180,
        to = 48,
        duration = 0.3,
        gain = 0.14,
        type = "sine",
        attack = 0.004,
        pan = 0,
        reverb = 0.08,
        dry = 1
      } = {}) {
        const oscillator = this.ctx.createOscillator();
        const envelope = this.ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, from), time);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + duration);
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + Math.max(0.002, attack));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(envelope);
        this.connectSfx(envelope, { reverb, pan, dry });
        oscillator.start(time);
        oscillator.stop(time + duration + 0.025);
      }

      metalStrike(time, pitch = 1800, gain = 0.12, pan = 0, reverb = 0.28) {
        [1, 1.43, 2.09, 2.91].forEach((ratio, index) => {
          const oscillator = this.ctx.createOscillator();
          const envelope = this.ctx.createGain();
          const duration = 0.12 + index * 0.055;
          oscillator.type = index < 2 ? "sine" : "triangle";
          oscillator.frequency.setValueAtTime(pitch * ratio, time);
          oscillator.frequency.exponentialRampToValueAtTime(pitch * ratio * 0.91, time + duration);
          envelope.gain.setValueAtTime(gain / Math.pow(index + 1, 1.18), time);
          envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
          oscillator.connect(envelope);
          this.connectSfx(envelope, { reverb, pan, dry: 0.86 });
          oscillator.start(time);
          oscillator.stop(time + duration + 0.02);
        });
      }

      whoosh(time, duration = 0.24, from = 420, to = 4300, gain = 0.18, pan = 0, reverb = 0.18) {
        this.noiseBurst(time, {
          duration,
          gain,
          attack: duration * 0.34,
          filter: "bandpass",
          frequency: from,
          endFrequency: to,
          q: 0.72,
          playbackRate: 0.82 + Math.random() * 0.34,
          pan,
          reverb
        });
      }

      kick(time, velocity) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(145, time);
        osc.frequency.exponentialRampToValueAtTime(43, time + 0.14);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.62 * velocity, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
        osc.connect(gain);
        this.connect(gain);
        osc.start(time);
        osc.stop(time + 0.3);
      }

      snare(time, velocity) {
        const src = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        src.buffer = this.noiseBuffer;
        filter.type = "bandpass";
        filter.frequency.value = 1800;
        filter.Q.value = 0.7;
        gain.gain.setValueAtTime(velocity, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
        src.connect(filter);
        filter.connect(gain);
        this.connect(gain);
        src.start(time);
        src.stop(time + 0.18);

        const body = this.ctx.createOscillator();
        const bodyGain = this.ctx.createGain();
        body.type = "triangle";
        body.frequency.setValueAtTime(190, time);
        body.frequency.exponentialRampToValueAtTime(105, time + 0.09);
        bodyGain.gain.setValueAtTime(0.16 * velocity, time);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
        body.connect(bodyGain);
        this.connect(bodyGain);
        body.start(time);
        body.stop(time + 0.13);
      }

      hat(time, velocity, open) {
        const src = this.ctx.createBufferSource();
        const high = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        src.buffer = this.noiseBuffer;
        high.type = "highpass";
        high.frequency.value = open ? 6100 : 7800;
        gain.gain.setValueAtTime(velocity, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + (open ? 0.12 : 0.035));
        src.connect(high);
        high.connect(gain);
        this.connect(gain);
        src.start(time, Math.random() * 0.4);
        src.stop(time + (open ? 0.13 : 0.04));
      }

      bass(time, note, duration, velocity) {
        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        sub.type = "sine";
        osc.frequency.value = this.midi(note);
        sub.frequency.value = this.midi(note - 12);
        filter.type = "lowpass";
        filter.Q.value = 4.5;
        filter.frequency.setValueAtTime(780, time);
        filter.frequency.exponentialRampToValueAtTime(130, time + duration);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(velocity, time + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        this.connect(gain);
        osc.start(time);
        sub.start(time);
        osc.stop(time + duration + 0.02);
        sub.stop(time + duration + 0.02);
      }

      pluck(time, note, velocity, duration) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = this.midi(note);
        filter.type = "lowpass";
        filter.Q.value = 9;
        filter.frequency.setValueAtTime(4200, time);
        filter.frequency.exponentialRampToValueAtTime(620, time + duration);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(velocity, time + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(filter);
        filter.connect(gain);
        this.connect(gain);
        osc.start(time);
        osc.stop(time + duration + 0.02);
      }

      pad(time, notes, duration, velocity) {
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        filter.type = "lowpass";
        filter.frequency.value = 1100;
        filter.Q.value = 0.8;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(velocity, time + 0.8);
        gain.gain.setValueAtTime(velocity, time + Math.max(0.9, duration - 0.9));
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        filter.connect(gain);
        this.connect(gain);
        notes.forEach((note, i) => {
          const osc = this.ctx.createOscillator();
          osc.type = i === 1 ? "triangle" : "sine";
          osc.frequency.value = this.midi(note + 12);
          osc.detune.value = (i - 1) * 5;
          osc.connect(filter);
          osc.start(time);
          osc.stop(time + duration + 0.04);
        });
      }

      leadVoice(time, note, duration, velocity) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(this.midi(note), time);
        osc.detune.setValueAtTime(-5, time);
        osc.detune.linearRampToValueAtTime(5, time + duration);
        filter.type = "lowpass";
        filter.Q.value = 6;
        filter.frequency.setValueAtTime(2600, time);
        filter.frequency.exponentialRampToValueAtTime(850, time + duration);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(velocity, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(filter);
        filter.connect(gain);
        this.connect(gain);
        osc.start(time);
        osc.stop(time + duration + 0.03);
      }

      riserTick(time, velocity) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, time);
        osc.frequency.exponentialRampToValueAtTime(1760, time + 0.08);
        gain.gain.setValueAtTime(velocity, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
        osc.connect(gain);
        this.connect(gain);
        osc.start(time);
        osc.stop(time + 0.1);
      }

      effect(type, strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        const name = type === "ult" ? "deathLotus" : type;
        const randomPan = () => (Math.random() * 2 - 1) * 0.52;

        if (name === "bomb") {
          this.duckMusic(0.07, 0.2);
          this.toneSweep(time, { from: 118, to: 57, duration: 0.18, gain: 0.16 * strength, type: "triangle", reverb: 0.08 });
          this.noiseBurst(time, { duration: 0.075, gain: 0.12 * strength, filter: "highpass", frequency: 5200, endFrequency: 1500, q: 0.45, drive: 8, reverb: 0.11 });
          this.metalStrike(time + 0.012, 1280, 0.045 * strength, randomPan(), 0.12);
        } else if (name === "pickup") {
          this.metalStrike(time, 720, 0.07 * strength, -0.24, 0.42);
          this.metalStrike(time + 0.075, 1080, 0.055 * strength, 0.22, 0.48);
          this.toneSweep(time, { from: 260, to: 520, duration: 0.28, gain: 0.045, type: "sine", reverb: 0.4 });
        } else if (name === "hit" || name === "bladeHit") {
          this.duckMusic(0.17, 0.38);
          this.toneSweep(time, { from: 104, to: 39, duration: 0.34, gain: 0.23 * strength, type: "sine", reverb: 0.07 });
          this.noiseBurst(time, { duration: 0.19, gain: 0.21 * strength, filter: "bandpass", frequency: name === "bladeHit" ? 2100 : 920, endFrequency: 230, q: 0.72, drive: 16, pan: randomPan(), reverb: 0.13 });
          if (name === "bladeHit") this.metalStrike(time, 1950, 0.075 * strength, randomPan(), 0.17);
        } else if (name === "kill") {
          this.duckMusic(0.34, 0.9);
          this.toneSweep(time, { from: 82, to: 25, duration: 0.86, gain: 0.32, type: "sine", reverb: 0.24 });
          this.noiseBurst(time, { duration: 0.48, gain: 0.22, filter: "lowpass", frequency: 1300, endFrequency: 90, q: 0.62, drive: 20, reverb: 0.34 });
          [880, 660, 495].forEach((pitch, index) => this.metalStrike(time + index * 0.09, pitch, 0.055, index % 2 ? 0.28 : -0.28, 0.5));
        } else if (name === "dash") {
          this.whoosh(time, 0.24, 330, 4800, 0.17 * strength, randomPan(), 0.14);
          this.toneSweep(time, { from: 155, to: 420, duration: 0.13, gain: 0.045, type: "triangle", pan: randomPan(), reverb: 0.09 });
        } else if (name === "katQ") {
          this.whoosh(time, 0.26, 520, 6200, 0.18, -0.38, 0.2);
          this.metalStrike(time + 0.055, 2450, 0.09, 0.34, 0.26);
          this.toneSweep(time, { from: 410, to: 1050, duration: 0.19, gain: 0.038, type: "triangle", pan: 0.18, reverb: 0.23 });
        } else if (name === "katW") {
          this.whoosh(time, 0.34, 740, 2100, 0.13, 0, 0.28);
          this.whoosh(time + 0.075, 0.28, 2500, 680, 0.1, 0.26, 0.24);
          this.metalStrike(time + 0.16, 1120, 0.075, -0.18, 0.34);
        } else if (name === "shunpo") {
          this.duckMusic(0.14, 0.34);
          this.whoosh(time, 0.2, 5900, 380, 0.22, -0.56, 0.18);
          this.whoosh(time + 0.025, 0.18, 420, 5200, 0.17, 0.52, 0.2);
          this.toneSweep(time, { from: 240, to: 52, duration: 0.23, gain: 0.14, type: "triangle", reverb: 0.12 });
          this.metalStrike(time + 0.075, 2200, 0.085, 0.2, 0.22);
        } else if (name === "zedQ") {
          this.whoosh(time, 0.24, 390, 7100, 0.19, -0.32, 0.14);
          this.whoosh(time + 0.028, 0.21, 6200, 520, 0.13, 0.34, 0.17);
          this.metalStrike(time + 0.04, 1780, 0.085, -0.12, 0.18);
          this.toneSweep(time, { from: 172, to: 62, duration: 0.27, gain: 0.09, type: "sawtooth", reverb: 0.2, dry: 0.74 });
        } else if (name === "zedW" || name === "zedSwap") {
          this.duckMusic(name === "zedSwap" ? 0.18 : 0.11, 0.32);
          this.whoosh(time, 0.31, name === "zedSwap" ? 6800 : 420, name === "zedSwap" ? 190 : 5200, 0.2, -0.5, 0.31);
          this.whoosh(time + 0.035, 0.28, 260, 3900, 0.15, 0.5, 0.26);
          this.toneSweep(time, { from: 92, to: 36, duration: 0.34, gain: 0.13, type: "sine", reverb: 0.42 });
        } else if (name === "zedE") {
          this.duckMusic(0.15, 0.4);
          for (let i = 0; i < 3; i++) {
            this.whoosh(time + i * 0.035, 0.26, 510 + i * 360, 6200 - i * 480, 0.15, i % 2 ? 0.62 : -0.62, 0.2);
          }
          this.metalStrike(time + 0.065, 1340, 0.1, 0, 0.22);
          this.toneSweep(time, { from: 124, to: 41, duration: 0.38, gain: 0.14, type: "triangle", reverb: 0.16 });
        } else if (name === "deathMark") {
          this.duckMusic(0.28, 1.05);
          this.whoosh(time, 0.42, 7600, 120, 0.28, -0.55, 0.38);
          this.whoosh(time + 0.035, 0.36, 180, 5400, 0.2, 0.55, 0.35);
          this.toneSweep(time, { from: 94, to: 29, duration: 1.28, gain: 0.2, type: "sine", reverb: 0.48 });
          [1260, 920, 620].forEach((pitch, index) => this.metalStrike(time + 0.07 + index * 0.055, pitch, 0.052, index % 2 ? 0.38 : -0.38, 0.5));
        } else if (name === "markPop") {
          this.duckMusic(0.38, 0.86);
          this.noiseBurst(time, { duration: 0.34, gain: 0.25, filter: "bandpass", frequency: 2400, endFrequency: 160, q: 0.68, drive: 22, reverb: 0.34 });
          this.toneSweep(time, { from: 132, to: 24, duration: 0.74, gain: 0.3, type: "sine", reverb: 0.38 });
          [2120, 1460, 980].forEach((pitch, index) => this.metalStrike(time + index * 0.028, pitch, 0.085, index % 2 ? 0.46 : -0.46, 0.44));
        } else if (name === "daggerLand") {
          this.metalStrike(time, 2080, 0.085, randomPan(), 0.31);
          this.noiseBurst(time, { duration: 0.09, gain: 0.065, filter: "highpass", frequency: 4600, endFrequency: 1700, q: 0.5, drive: 6, pan: randomPan(), reverb: 0.18 });
        } else if (name === "voracity") {
          this.duckMusic(0.18, 0.5);
          for (let i = 0; i < 3; i++) {
            const pan = i % 2 ? 0.62 : -0.62;
            this.whoosh(time + i * 0.065, 0.28, 430 + i * 220, 5400 - i * 420, 0.17, pan, 0.23);
            this.metalStrike(time + 0.045 + i * 0.07, 1700 + i * 310, 0.06, -pan * 0.7, 0.3);
          }
          this.toneSweep(time, { from: 126, to: 48, duration: 0.42, gain: 0.13, type: "sine", reverb: 0.18 });
        } else if (name === "renektonQ" || name === "renektonQEmpowered") {
          const empowered = name.endsWith("Empowered");
          this.duckMusic(empowered ? 0.24 : 0.16, 0.54);
          for (let i = 0; i < (empowered ? 4 : 3); i++) {
            this.whoosh(time + i * 0.045, 0.32, 330 + i * 250, 4800 - i * 360,
              (empowered ? 0.2 : 0.15), i % 2 ? 0.62 : -0.62, 0.22);
          }
          this.metalStrike(time + 0.08, empowered ? 980 : 1260, empowered ? 0.14 : 0.1, 0, 0.24);
          this.toneSweep(time, { from: empowered ? 142 : 118, to: 34, duration: empowered ? 0.52 : 0.38,
            gain: empowered ? 0.2 : 0.13, type: "triangle", reverb: 0.18 });
        } else if (name === "renektonW" || name === "renektonWEmpowered") {
          const empowered = name.endsWith("Empowered");
          this.duckMusic(empowered ? 0.3 : 0.2, 0.6);
          this.whoosh(time, 0.22, 4100, 260, empowered ? 0.25 : 0.18, -0.32, 0.15);
          this.noiseBurst(time + 0.055, { duration: empowered ? 0.34 : 0.24, gain: empowered ? 0.25 : 0.18,
            filter: "bandpass", frequency: 1750, endFrequency: 130, q: 0.75, drive: 20, reverb: 0.18 });
          [740, 1120, 1560].forEach((pitch, index) =>
            this.metalStrike(time + 0.045 + index * 0.038, pitch, (empowered ? 0.09 : 0.065), index % 2 ? 0.4 : -0.4, 0.22));
        } else if (name === "renektonE" || name === "renektonDice") {
          const second = name === "renektonDice";
          this.whoosh(time, second ? 0.34 : 0.28, second ? 6200 : 420, second ? 240 : 5600,
            second ? 0.24 : 0.18, -0.52, 0.2);
          this.whoosh(time + 0.035, 0.25, 260, 4300, second ? 0.18 : 0.13, 0.52, 0.18);
          this.noiseBurst(time, { duration: 0.28, gain: second ? 0.13 : 0.09, filter: "highpass",
            frequency: 3900, endFrequency: 620, q: 0.5, drive: 8, reverb: 0.18 });
        } else if (name === "dominus") {
          this.duckMusic(0.34, 1.28);
          this.toneSweep(time, { from: 112, to: 25, duration: 1.25, gain: 0.3, type: "sine", reverb: 0.44 });
          this.toneSweep(time + 0.025, { from: 310, to: 58, duration: 0.88, gain: 0.11, type: "sawtooth", reverb: 0.34 });
          this.noiseBurst(time, { duration: 1.05, gain: 0.2, filter: "lowpass", frequency: 2100,
            endFrequency: 85, q: 0.58, drive: 18, reverb: 0.5 });
          [620, 480, 360].forEach((pitch, index) => this.metalStrike(time + 0.08 + index * 0.11, pitch, 0.075, 0, 0.52));
        } else if (name === "vladimirQ" || name === "vladimirQEmpowered") {
          const empowered = name.endsWith("Empowered");
          this.whoosh(time, empowered ? 0.44 : 0.32, empowered ? 6200 : 3800, 190,
            empowered ? 0.22 : 0.15, -0.34, 0.3);
          this.toneSweep(time, { from: empowered ? 96 : 128, to: empowered ? 42 : 64,
            duration: empowered ? 0.52 : 0.34, gain: empowered ? 0.2 : 0.12, type: "sine", reverb: 0.42 });
          this.noiseBurst(time + 0.045, { duration: 0.24, gain: empowered ? 0.17 : 0.1,
            filter: "bandpass", frequency: 1450, endFrequency: 230, q: 1.05, drive: 11, reverb: 0.34 });
        } else if (name === "sanguinePool") {
          this.duckMusic(0.18, 0.74);
          this.whoosh(time, 0.56, 3200, 90, 0.2, 0, 0.48);
          this.noiseBurst(time, { duration: 0.92, gain: 0.18, filter: "lowpass", frequency: 980,
            endFrequency: 72, q: 0.7, playbackRate: 0.62, drive: 12, reverb: 0.52 });
          this.toneSweep(time, { from: 82, to: 31, duration: 0.82, gain: 0.17, type: "sine", reverb: 0.5 });
        } else if (name === "tidesOfBlood") {
          this.duckMusic(0.24, 0.58);
          for (let i = 0; i < 5; i++) {
            this.whoosh(time + i * 0.022, 0.3, 360 + i * 380, 5400 - i * 420,
              0.15, i % 2 ? 0.66 : -0.66, 0.26);
          }
          this.toneSweep(time, { from: 136, to: 38, duration: 0.48, gain: 0.2, type: "triangle", reverb: 0.28 });
        } else if (name === "hemoplague") {
          this.duckMusic(0.22, 0.82);
          this.whoosh(time, 0.62, 220, 4200, 0.18, 0, 0.48);
          this.toneSweep(time, { from: 74, to: 42, duration: 1.1, gain: 0.17, type: "sine", reverb: 0.58 });
          [540, 720, 960].forEach((pitch, index) => this.metalStrike(time + index * 0.075, pitch, 0.045, index % 2 ? 0.42 : -0.42, 0.64));
        } else if (name === "hemoplaguePop") {
          this.duckMusic(0.38, 0.95);
          this.noiseBurst(time, { duration: 0.48, gain: 0.28, filter: "bandpass", frequency: 1900,
            endFrequency: 95, q: 0.68, drive: 22, reverb: 0.46 });
          this.toneSweep(time, { from: 118, to: 22, duration: 0.82, gain: 0.32, type: "sine", reverb: 0.48 });
          this.whoosh(time, 0.46, 5800, 120, 0.22, 0, 0.42);
        } else if (name === "shield") {
          this.duckMusic(0.13, 0.48);
          this.noiseBurst(time, { duration: 0.34, gain: 0.2, filter: "highpass", frequency: 7400, endFrequency: 980, q: 0.62, drive: 10, reverb: 0.52 });
          [2100, 1540, 2860, 1180].forEach((pitch, index) =>
            this.metalStrike(time + index * 0.045, pitch, 0.055, index % 2 ? 0.52 : -0.52, 0.62)
          );
        } else if (name === "deathLotus") {
          this.duckMusic(0.3, 1.9);
          this.toneSweep(time, { from: 118, to: 34, duration: 1.7, gain: 0.22, type: "sine", reverb: 0.34 });
          this.toneSweep(time, { from: 360, to: 92, duration: 1.58, gain: 0.075, type: "sawtooth", reverb: 0.42, dry: 0.7 });
          for (let i = 0; i < 13; i++) {
            const offset = i * 0.125;
            const pan = i % 2 ? 0.72 : -0.72;
            this.whoosh(time + offset, 0.25, 520 + (i % 3) * 240, 6100 - (i % 4) * 430, 0.13, pan, 0.3);
            if (i % 3 === 0) this.metalStrike(time + offset + 0.035, 1500 + (i % 5) * 260, 0.05, -pan * 0.76, 0.42);
          }
        }
      }

      explosion(strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        this.duckMusic(clamp(0.31 + strength * 0.08, 0.34, 0.43), 1.28);

        // Initial supersonic crack and pressure front.
        this.noiseBurst(time, {
          duration: 0.105,
          gain: 0.29 * strength,
          attack: 0.0015,
          filter: "highpass",
          frequency: 7800,
          endFrequency: 920,
          q: 0.46,
          drive: 22,
          reverb: 0.34
        });
        this.toneSweep(time, { from: 152, to: 38, duration: 0.46, gain: 0.2 * strength, type: "triangle", reverb: 0.11 });

        // Low-frequency body, distorted fireball and long environmental tail.
        this.toneSweep(time + 0.006, { from: 76, to: 23, duration: 1.05, gain: 0.34 * strength, type: "sine", reverb: 0.22 });
        this.noiseBurst(time + 0.008, {
          duration: 1.16,
          gain: 0.34 * strength,
          attack: 0.012,
          filter: "lowpass",
          frequency: 2600,
          endFrequency: 72,
          q: 0.68,
          playbackRate: 0.74,
          drive: 24,
          reverb: 0.46,
          dry: 0.9
        });
        this.noiseBurst(time + 0.07, {
          duration: 0.82,
          gain: 0.14 * strength,
          attack: 0.035,
          filter: "bandpass",
          frequency: 1180,
          endFrequency: 155,
          q: 0.52,
          playbackRate: 0.58,
          reverb: 0.58,
          dry: 0.58
        });

        // Stone, timber and metal fragments disperse across the stereo field.
        for (let i = 0; i < 7; i++) {
          const delay = 0.11 + i * 0.065 + Math.random() * 0.055;
          const pan = (i / 6) * 1.5 - 0.75 + (Math.random() - 0.5) * 0.18;
          this.noiseBurst(time + delay, {
            duration: 0.075 + Math.random() * 0.14,
            gain: (0.055 + Math.random() * 0.045) * strength,
            attack: 0.002,
            filter: "bandpass",
            frequency: 900 + Math.random() * 2800,
            endFrequency: 180 + Math.random() * 380,
            q: 1.1 + Math.random() * 1.4,
            playbackRate: 0.82 + Math.random() * 0.52,
            drive: 8,
            pan,
            reverb: 0.3 + Math.random() * 0.22
          });
        }
      }

      toggleMute() {
        this.muted = !this.muted;
        if (this.master && this.ctx) {
          this.master.gain.cancelScheduledValues(this.ctx.currentTime);
          this.master.gain.setTargetAtTime(this.muted ? 0 : 0.84, this.ctx.currentTime, 0.035);
        }
        return this.muted;
      }

      async togglePause(paused) {
        if (!this.ctx) return;
        if (paused && this.ctx.state === "running") await this.ctx.suspend();
        if (!paused && this.ctx.state === "suspended") {
          await this.ctx.resume();
          this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.04);
        }
      }

      position() {
        if (!this.ctx || !this.startedAt) return (performance.now() / 1000 - this.fallbackStart) % this.duration;
        return ((this.ctx.currentTime - this.startedAt) % this.duration + this.duration) % this.duration;
      }

      visualBeat() {
        const beatPosition = this.position() / (60 / this.bpm);
        const phase = beatPosition - Math.floor(beatPosition);
        return Math.exp(-phase * 8.5);
      }

      updateEnergy() {
        if (!this.analyser || this.muted) {
          this.energy = lerp(this.energy, this.visualBeat() * 0.35, 0.1);
          return;
        }
        this.analyser.getByteFrequencyData(this.freq);
        let sum = 0;
        for (let i = 1; i < 26; i++) sum += this.freq[i];
        const value = sum / 25 / 255;
        this.energy = lerp(this.energy, value, 0.18);
      }
    }

