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
  startedAt: number;
  maxMs: number;
}

export const MAX_LISTEN_MS = 60_000;

/**
 * 듣기 시작. 안드로이드 브라우저는 잠깐 조용하면 혼자 끝내 버리는데, 사용자가 멈추기 전이면
 * 곧바로 다시 시작해서 이어 듣는다 (최대 maxMs). onPartial로 지금까지 알아들은 글자를 알려준다.
 */
export function listen(lang: string, onPartial?: (text: string) => void, maxMs = MAX_LISTEN_MS): Listening {
  const C = ctor();
  const startedAt = Date.now();
  if (!C) return { result: Promise.reject(new SpeechError('이 기기에서는 음성 인식을 쓸 수 없어요', 'unsupported')), stop() {}, cancel() {}, startedAt, maxMs };
  let r: RecognitionLike | undefined;
  let stopping = false;
  let cancelled = false;
  const finals: string[] = []; // 이전 세션들에서 확정된 글자
  let current: string[] = []; // 지금 세션
  const heard = () => [...finals, ...current].join(' ').replace(/\s+/g, ' ').trim();
  const timer = setTimeout(() => {
    stopping = true;
    r?.stop();
  }, maxMs);

  const result = new Promise<string>((resolve, reject) => {
    let lastError: string | undefined;
    let restarts = 0;
    const begin = () => {
      const rec = new C();
      r = rec;
      rec.lang = lang;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = true;
      current = [];
      rec.onresult = (e) => {
        current = [];
        for (let i = 0; i < e.results.length; i++) current.push(e.results[i]?.[0]?.transcript ?? '');
        onPartial?.(heard());
      };
      rec.onerror = (e) => {
        if (e.error !== 'aborted' && e.error !== 'no-speech') lastError = e.error;
        if (e.error === 'no-speech' && !heard()) lastError = 'no-speech';
      };
      rec.onend = () => {
        finals.push(...current);
        current = [];
        const fatal = lastError && ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(lastError);
        // 사용자가 멈추기 전에 끝났으면 다시 듣는다
        if (!stopping && !cancelled && !fatal && restarts < 30 && Date.now() - startedAt < maxMs) {
          restarts++;
          lastError = undefined;
          try {
            begin();
            return;
          } catch {
            /* 아래로 */
          }
        }
        clearTimeout(timer);
        const text = heard();
        if (cancelled) resolve('');
        else if (text) resolve(text);
        else reject(new SpeechError(MESSAGES[lastError ?? 'empty'] ?? `음성 인식 오류 (${lastError})`, lastError ?? 'empty'));
      };
      rec.start();
    };
    try {
      begin();
    } catch {
      clearTimeout(timer);
      reject(new SpeechError('음성 인식을 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요', 'start'));
    }
  });
  return {
    result,
    startedAt,
    maxMs,
    stop: () => {
      stopping = true;
      r?.stop();
    },
    cancel: () => {
      cancelled = true;
      stopping = true;
      clearTimeout(timer);
      r?.abort();
    },
  };
}
