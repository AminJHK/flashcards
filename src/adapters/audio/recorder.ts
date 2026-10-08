import { floatToPcm16, pcm16ToWav } from './wav';

/**
 * 마이크로 녹음해서 16kHz 모노 WAV로 돌려준다 (Gemini가 확실히 읽는 형식, 5초 ≈ 160KB).
 */
export interface Recording {
  stop(): Promise<Uint8Array>;
  cancel(): void;
}

export function recorderSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export async function startRecording(maxMs = 20_000): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error('마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요');
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  rec.start();
  const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), maxMs);
  const release = () => {
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    async stop() {
      if (rec.state === 'recording') rec.stop();
      await stopped;
      release();
      return toWav16k(new Blob(chunks, { type: rec.mimeType }));
    },
    cancel() {
      if (rec.state === 'recording') rec.stop();
      release();
    },
  };
}

async function toWav16k(blob: Blob): Promise<Uint8Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16_000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return pcm16ToWav(floatToPcm16(rendered.getChannelData(0)), rate);
  } finally {
    void ctx.close();
  }
}
