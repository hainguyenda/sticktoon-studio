import type { RealSfx } from "./types";

/**
 * Procedural cartoon SFX library, synthesised with the Web Audio API inside an
 * OfflineAudioContext. Rendered buffers are cached per sample rate.
 */

type Builder = (ctx: OfflineAudioContext) => void;

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

const builders: Record<RealSfx, { length: number; build: Builder }> = {
  vine_boom: {
    length: 2.2,
    build(ctx) {
      const out = ctx.createGain();
      out.gain.value = 0.9;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(6);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1800, 0);
      lp.frequency.exponentialRampToValueAtTime(220, 1.2);
      shaper.connect(lp).connect(out).connect(ctx.destination);

      // body: pitched-down sine with long decay
      for (const [f0, f1, g] of [
        [150, 42, 1],
        [300, 84, 0.35],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f0, 0);
        o.frequency.exponentialRampToValueAtTime(f1, 0.35);
        const e = ctx.createGain();
        e.gain.setValueAtTime(0, 0);
        e.gain.linearRampToValueAtTime(g, 0.008);
        e.gain.setTargetAtTime(g * 0.55, 0.05, 0.15);
        e.gain.setTargetAtTime(0.0001, 0.45, 0.45);
        o.connect(e).connect(shaper);
        o.start(0);
        o.stop(2.2);
      }
      // attack click / thump
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.12);
      const nf = ctx.createBiquadFilter();
      nf.type = "lowpass";
      nf.frequency.value = 900;
      const ne = ctx.createGain();
      ne.gain.setValueAtTime(0.9, 0);
      ne.gain.exponentialRampToValueAtTime(0.001, 0.1);
      n.connect(nf).connect(ne).connect(shaper);
      n.start(0);

      // fake room tail via feedback delay
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.09;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      const wet = ctx.createGain();
      wet.gain.value = 0.25;
      lp.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(wet).connect(ctx.destination);
    },
  },
  record_scratch: {
    length: 0.85,
    build(ctx) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.85);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 4;
      // back-and-forth hand motion: rapid frequency sweeps
      const moves: [number, number][] = [
        [0, 400],
        [0.12, 2600],
        [0.22, 700],
        [0.3, 3400],
        [0.48, 500],
        [0.62, 2200],
        [0.8, 300],
      ];
      bp.frequency.setValueAtTime(moves[0][1], 0);
      for (const [t, f] of moves.slice(1)) bp.frequency.exponentialRampToValueAtTime(f, t);

      const tone = ctx.createOscillator();
      tone.type = "sawtooth";
      tone.frequency.setValueAtTime(120, 0);
      for (const [t, f] of moves.slice(1)) tone.frequency.exponentialRampToValueAtTime(f / 6, t);
      const toneG = ctx.createGain();
      toneG.gain.value = 0.18;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(1, 0.02);
      env.gain.setValueAtTime(1, 0.2);
      env.gain.linearRampToValueAtTime(0.4, 0.24);
      env.gain.linearRampToValueAtTime(1, 0.3);
      env.gain.setValueAtTime(1, 0.6);
      env.gain.exponentialRampToValueAtTime(0.001, 0.84);
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(3);
      src.connect(bp).connect(env);
      tone.connect(toneG).connect(env);
      env.connect(shaper).connect(ctx.destination);
      src.start(0);
      tone.start(0);
      tone.stop(0.85);
    },
  },
  whoosh: {
    length: 0.9,
    build(ctx) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.9);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(250, 0);
      bp.frequency.exponentialRampToValueAtTime(2800, 0.4);
      bp.frequency.exponentialRampToValueAtTime(500, 0.85);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, 0);
      env.gain.exponentialRampToValueAtTime(1.2, 0.38);
      env.gain.exponentialRampToValueAtTime(0.0001, 0.88);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-0.8, 0);
      pan.pan.linearRampToValueAtTime(0.8, 0.85);
      src.connect(bp).connect(env).connect(pan).connect(ctx.destination);
      src.start(0);
    },
  },
  pop: {
    length: 0.25,
    build(ctx) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(1100, 0);
      o.frequency.exponentialRampToValueAtTime(180, 0.07);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, 0);
      e.gain.linearRampToValueAtTime(1, 0.004);
      e.gain.exponentialRampToValueAtTime(0.001, 0.12);
      o.connect(e).connect(ctx.destination);
      o.start(0);
      o.stop(0.25);
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2000;
      const ne = ctx.createGain();
      ne.gain.value = 0.35;
      n.connect(hp).connect(ne).connect(ctx.destination);
      n.start(0);
    },
  },
  ding: {
    length: 2.2,
    build(ctx) {
      const f = 1318.5;
      const partials: [number, number, number][] = [
        [1, 0.6, 1.6],
        [2.76, 0.25, 0.7],
        [5.4, 0.12, 0.35],
        [8.93, 0.06, 0.2],
      ];
      for (const [ratio, amp, decay] of partials) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * ratio;
        const e = ctx.createGain();
        e.gain.setValueAtTime(0, 0);
        e.gain.linearRampToValueAtTime(amp, 0.003);
        e.gain.setTargetAtTime(0.0001, 0.003, decay / 3);
        o.connect(e).connect(ctx.destination);
        o.start(0);
        o.stop(2.2);
      }
    },
  },
  cricket: {
    length: 2.6,
    build(ctx) {
      const chirp = (start: number, freq: number, pan: number, level: number) => {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(ctx.destination);
        for (let k = 0; k < 3; k++) {
          const t = start + k * 0.045;
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = freq;
          const am = ctx.createOscillator();
          am.frequency.value = 180;
          const amG = ctx.createGain();
          amG.gain.value = 0.5;
          const e = ctx.createGain();
          e.gain.setValueAtTime(0, t);
          e.gain.linearRampToValueAtTime(level, t + 0.006);
          e.gain.linearRampToValueAtTime(level * 0.7, t + 0.025);
          e.gain.linearRampToValueAtTime(0, t + 0.032);
          am.connect(amG).connect(e.gain);
          o.connect(e).connect(p);
          o.start(t);
          o.stop(t + 0.04);
          am.start(t);
          am.stop(t + 0.04);
        }
      };
      for (let t = 0.05; t < 2.4; t += 0.52) chirp(t, 4400, -0.4, 0.28);
      for (let t = 0.3; t < 2.4; t += 0.61) chirp(t, 4900, 0.5, 0.18);
      // night ambience
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 2.6);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(0.05, 0.3);
      g.gain.linearRampToValueAtTime(0, 2.6);
      n.connect(lp).connect(g).connect(ctx.destination);
      n.start(0);
    },
  },
};

const cache = new Map<string, Promise<AudioBuffer>>();

export function renderSfx(type: RealSfx, sampleRate: number): Promise<AudioBuffer> {
  const k = `${type}@${sampleRate}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const def = builders[type];
  const ctx = new OfflineAudioContext(2, Math.ceil(def.length * sampleRate), sampleRate);
  def.build(ctx);
  const p = ctx.startRendering().then(normalise);
  cache.set(k, p);
  return p;
}

function normalise(buf: AudioBuffer): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) {
    const g = 0.89 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buf;
}
