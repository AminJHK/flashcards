/** 16비트 PCM(리틀 엔디언) 바이트에 WAV 헤더를 붙인다. Gemini TTS는 헤더 없는 PCM을 돌려준다. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** -1~1 실수 샘플을 16비트 PCM으로 바꾼다. */
export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const v = new DataView(out.buffer);
  samples.forEach((s, i) => {
    const c = Math.max(-1, Math.min(1, s));
    v.setInt16(i * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  });
  return out;
}

/** 'audio/L16;codec=pcm;rate=24000' → 24000 */
export function sampleRateOf(mimeType: string | undefined, fallback = 24000): number {
  const m = /rate=(\d+)/.exec(mimeType ?? '');
  return m ? Number(m[1]) : fallback;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}
