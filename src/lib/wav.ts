/** Encode an AudioBuffer into a 16-bit PCM WAV blob. */
export function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const len = buf.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true);
  v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, dataSize, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Compute min/max peaks per bucket for waveform rendering. */
export function computePeaks(buf: AudioBuffer, bucketsPerSecond = 120): Float32Array {
  const total = Math.max(1, Math.ceil(buf.duration * bucketsPerSecond));
  const out = new Float32Array(total * 2);
  const step = buf.length / total;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  for (let b = 0; b < total; b++) {
    const s = Math.floor(b * step);
    const e = Math.min(buf.length, Math.floor((b + 1) * step));
    let mn = 0;
    let mx = 0;
    for (let i = s; i < e; i++) {
      let val = 0;
      for (const ch of chans) val += ch[i];
      val /= chans.length;
      if (val < mn) mn = val;
      if (val > mx) mx = val;
    }
    out[b * 2] = mn;
    out[b * 2 + 1] = mx;
  }
  return out;
}
