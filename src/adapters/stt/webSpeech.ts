/**
 * 브라우저 음성 인식 (Gemini를 연결하지 않았을 때). 안드로이드 Chrome은 Google 음성 인식을 쓰므로 인터넷이 필요하다.
 * 홈 화면에 설치한 앱에서는 막혀 있는 경우가 있어서, 그때는 Gemini 연결을 권한다.
 */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
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

export class SpeechError extends Error {
  constructor(
    message: string,
    /** 브라우저 오류 코드 (no-speech, not-allowed, …). 결과가 비었으면 'empty' */
    readonly code: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  'no-speech': '말소리가 들리지 않았어요. 마이크를 누르고 바로 말해 보세요',
  'audio-capture': '마이크를 찾을 수 없어요',
  'not-allowed': '마이크 권한이 필요해요. 주소창 옆 자물쇠 › 권한에서 마이크를 허용해 주세요',
  'service-not-allowed': '이 앱에서는 기기 음성 인식이 막혀 있어요',
  network: '음성 인식은 인터넷 연결이 필요해요',
  'language-not-supported': '이 기기의 음성 인식이 이 언어를 지원하지 않아요',
  empty: '알아듣지 못했어요',
};

export interface Listening {
  result: Promise<string>;
  /** 듣기를 끝내고 지금까지 들은 걸 받는다 */
  stop(): void;
  cancel(): void;
}

export function listen(lang: string): Listening {
  const C = ctor();
  if (!C) return { result: Promise.reject(new SpeechError('이 기기에서는 음성 인식을 쓸 수 없어요', 'unsupported')), stop() {}, cancel() {} };
  const r = new C();
  r.lang = lang;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = true; // 사용자가 다시 누를 때까지 듣는다
  let cancelled = false;
  const parts: string[] = [];
  const result = new Promise<string>((resolve, reject) => {
    let error: string | undefined;
    r.onresult = (e) => {
      parts.length = 0;
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]?.[0]?.transcript ?? '');
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') error = e.error;
    };
    r.onend = () => {
      const text = parts.join(' ').trim();
      if (cancelled) resolve('');
      else if (text) resolve(text);
      else reject(new SpeechError(MESSAGES[error ?? 'empty'] ?? `음성 인식 오류 (${error})`, error ?? 'empty'));
    };
    try {
      r.start();
    } catch {
      reject(new SpeechError('음성 인식을 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요', 'start'));
    }
  });
  return {
    result,
    stop: () => r.stop(),
    cancel: () => {
      cancelled = true;
      r.abort();
    },
  };
}
