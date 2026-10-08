/**
 * 말하기로 답하기 (음성 인식). 안드로이드 Chrome은 Google 음성 인식을 쓰므로 인터넷이 필요하다.
 */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type Ctor = new () => RecognitionLike;

function ctor(): Ctor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function sttSupported(): boolean {
  return !!ctor();
}

export interface Listening {
  result: Promise<string>;
  cancel(): void;
}

export function listen(lang: string): Listening {
  const C = ctor();
  if (!C) return { result: Promise.reject(new Error('이 기기에서는 음성 인식을 쓸 수 없어요')), cancel() {} };
  const r = new C();
  r.lang = lang;
  r.interimResults = false;
  r.maxAlternatives = 1;
  const result = new Promise<string>((resolve, reject) => {
    let done = false;
    r.onresult = (e) => {
      done = true;
      resolve(e.results[0]?.[0]?.transcript ?? '');
    };
    r.onerror = (e) => {
      done = true;
      reject(new Error(e.error === 'not-allowed' ? '마이크 권한이 필요해요' : e.error === 'network' ? '음성 인식은 인터넷 연결이 필요해요' : '잘 듣지 못했어요'));
    };
    r.onend = () => {
      if (!done) resolve('');
    };
  });
  r.start();
  return { result, cancel: () => r.abort() };
}
