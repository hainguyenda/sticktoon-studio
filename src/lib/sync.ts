import { MIN_SCENE_DURATION } from "./constants";
import type { Scene } from "./types";
import { countWords, normaliseDurations } from "./validate";

export interface Silence {
  /** centre of the gap, seconds */
  t: number;
  /** gap length, seconds */
  len: number;
}

/** Find silent gaps in an audio buffer. */
export function findSilences(buf: AudioBuffer, minGap = 0.12, thresholdRatio = 0.06): Silence[] {
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.01)); // 10ms windows
  const n = Math.floor(buf.length / win);
  const env = new Float32Array(n);
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * win; j < (i + 1) * win; j++) {
      let v = 0;
      for (const ch of chans) v += ch[j];
      v /= chans.length;
      sum += v * v;
    }
    env[i] = Math.sqrt(sum / win);
    if (env[i] > peak) peak = env[i];
  }
  const thr = peak * thresholdRatio;
  const out: Silence[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const silent = i < n && env[i] < thr;
    if (silent && start < 0) start = i;
    if (!silent && start >= 0) {
      const len = (i - start) * 0.01;
      if (len >= minGap) out.push({ t: ((start + i) / 2) * 0.01, len });
      start = -1;
    }
  }
  return out;
}

/**
 * Split `audioDuration` across scenes proportional to narration word count.
 * Optionally snap each boundary to the nearest silent gap in the voice track.
 */
export function autoSyncDurations(scenes: Scene[], audioDuration: number, silences: Silence[] = [], snapWindow = 0.8): number[] {
  if (!scenes.length) return [];
  const total = Math.max(scenes.length * MIN_SCENE_DURATION, Math.round(audioDuration * 10) / 10);
  const weights = scenes.map((s) => Math.max(1.5, countWords(s.narration)));
  let durs = normaliseDurations(weights, total, MIN_SCENE_DURATION);
  if (!silences.length) return durs;

  // boundaries are cumulative ends of scenes 0..n-2
  const bounds: number[] = [];
  let acc = 0;
  for (let i = 0; i < durs.length - 1; i++) {
    acc += durs[i];
    bounds.push(acc);
  }
  let prev = 0;
  const snapped = bounds.map((b, i) => {
    const remaining = durs.length - 1 - i; // scenes after this boundary
    const maxB = total - remaining * MIN_SCENE_DURATION;
    // Score = distance minus a bonus for longer pauses (sentence/scene breaks beat breaths between words).
    let best = b;
    let bestScore = Infinity;
    for (const s of silences) {
      const d = Math.abs(s.t - b);
      if (d > snapWindow || s.t < prev + MIN_SCENE_DURATION || s.t > maxB) continue;
      const score = d - 0.8 * Math.min(s.len, 0.6);
      if (score < bestScore) {
        best = s.t;
        bestScore = score;
      }
    }
    best = Math.round(Math.min(maxB, Math.max(prev + MIN_SCENE_DURATION, best)) * 10) / 10;
    prev = best;
    return best;
  });
  durs = [];
  let last = 0;
  for (const b of snapped) {
    durs.push(Math.round((b - last) * 10) / 10);
    last = b;
  }
  durs.push(Math.round((total - last) * 10) / 10);
  return durs;
}
