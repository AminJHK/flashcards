import { floatToPcm16, pcm16ToWav } from './wav';

/**
 * 마이크로 녹음한다. 가능하면 16kHz 모노 WAV로 바꾸고 (Gemini가 확실히 읽는 형식, 5초 ≈ 160KB),
 * 이 기기에서 변환이 안 되면 녹음된 원래 형식(webm/ogg/mp4) 그대로 돌려준다.
 */
export interface AudioData {
  data: Uint8Array;
  mimeType: string;
}

export interface Recording {
  stop(): Promise<AudioData>;
  cancel(): void;
}

export class RecordingError extends Error {}

export function recorderSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

const PREFERRED = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

function pickMime(): string | undefined {
  return PREFERRED.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

export async function startRecording(maxMs = 20_000): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotFoundError') throw new RecordingError('마이크를 찾을 수 없어요');
    throw new RecordingError('마이크 권한이 필요해요. 주소창 옆 자물쇠 › 권한에서 마이크를 허용해 주세요');
  }
  const mime = pickMime();
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  const startedAt = Date.now();
  rec.start(250); // 조금씩 받아 둔다 (일부 기기는 stop 때 데이터를 안 주기도 함)
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
      if (Date.now() - startedAt < 500 || !chunks.length) throw new RecordingError('녹음이 너무 짧아요. 말한 뒤에 마이크를 다시 누르세요');
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0]!;
      const blob = new Blob(chunks, { type });
      try {
        return { data: await toWav16k(blob), mimeType: 'audio/wav' };
      } catch {
        return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: type };
      }
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
