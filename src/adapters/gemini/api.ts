/**
 * Gemini API (Google AI Studio 무료 키). 키는 이 기기의 설정에만 저장한다.
 * 무료 사용 시 Google이 보낸 내용을 서비스 개선에 쓸 수 있다 (설정 화면에 안내).
 */

import { fetchWithTimeout, TimeoutError } from '../net';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'quota' | 'model' | 'network' | 'empty' | 'busy' | 'other',
    /** More specific classification of Google's 429 error; don't mistake minute limits for daily exhaustion. */
    readonly limit?: 'daily' | 'minute' | 'unknown',
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
  /** 조금씩 받기에서 Gemini가 정해진 시간 안에 한 글자도 보내지 않았다 (오래 생각하거나 서버가 붐빔) → 다른 모델로 */
  noStart?: boolean;
}

async function call(path: string, key: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE}/${path}`,
      { ...init, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...(init.headers ?? {}) } },
      timeoutMs,
    );
  } catch (e) {
    throw new GeminiError(e instanceof TimeoutError ? e.message : '인터넷에 연결되어 있지 않아요', 'network');
  }
  if (res.ok) return res.json();
  throw await errorFrom(res);
}

/** HTTP 오류 응답을 알아보기 쉬운 오류로 바꾼다 */
/** Quota metadata differs between REST endpoints and models, so treat unidentified 429s honestly. */
export function classifyRateLimit(message: string, details: unknown): 'daily' | 'minute' | 'unknown' {
  const diagnostic = `${message} ${JSON.stringify(details ?? [])}`;
  if (/quota_exceeded|(?:requests?|tokens?)[_-]?per[_-]?day|per.?day|daily|\\bRPD\\b/i.test(diagnostic)) return 'daily';
  if (/rate_limit_exceeded|too_many_requests|per.?minute|per.?second|\\bRPM\\b|\\bTPM\\b/i.test(diagnostic)) return 'minute';
  return 'unknown';
}

/** HTTP 오류 응답을 알아보기 쉬운 오류로 바꾼다 */
async function errorFrom(res: Response): Promise<GeminiError> {
  let msg = '';
  let details: unknown;
  try {
    const data = (await res.json()) as { error?: { message?: string; details?: unknown } };
    msg = data.error?.message ?? '';
    details = data.error?.details;
  } catch {
    /* 본문 없음 */
  }
  if (res.status === 400 && /api key/i.test(msg)) return new GeminiError('API 키가 올바르지 않아요. 다시 복사해 붙여넣어 주세요', 'key');
  if (res.status === 401 || res.status === 403) return new GeminiError('API 키를 쓸 수 없어요. 키를 다시 확인해 주세요', 'key');
  if (res.status === 429) {
    const limit = classifyRateLimit(msg, details);
    const retryHeader = res.headers.get('Retry-After');
    const numericSeconds = retryHeader ? Number(retryHeader) : NaN;
    const retryAfterMs = Number.isFinite(numericSeconds) && numericSeconds >= 0
      ? numericSeconds * 1000
      : retryHeader ? Math.max(0, Date.parse(retryHeader) - Date.now()) : undefined;
    const reason = limit === 'daily'
      ? '이 Gemini 모델의 오늘 사용량 한도에 도달했어요. Google AI Studio에서 확인해 주세요.'
      : limit === 'minute'
        ? 'Gemini 요청이 너무 빠르게 이어졌어요. 잠시 기다렸다 다시 시도해 주세요.'
        : 'Gemini 요청 제한(429)이 발생했어요. 분당 한도인지 일일 한도인지 AI Studio에서 확인해 주세요.';
    return new GeminiError(reason, 'quota', limit, Number.isFinite(retryAfterMs) ? retryAfterMs : undefined);
  }
  if ([500, 502, 503, 504].includes(res.status)) return new GeminiError('Gemini 서버가 지금 붐벼요. 잠시 뒤에 다시 시도해요', 'busy');
  if (res.status === 404) return new GeminiError('이 모델을 쓸 수 없어요', 'model');
  return new GeminiError(`Gemini 오류 (${res.status}${msg ? `: ${msg.slice(0, 80)}` : ''})`, 'other');
}

export interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType?: string; data?: string } }[] }; finishReason?: string }[];
  /** 쓴 토큰 수 (thoughtsTokenCount: 생각하는 데 쓴 토큰. 답 길이 상한에 같이 들어간다) */
  usageMetadata?: { candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/**
 * 글을 만드는 대로 조금씩 받는다 (streamGenerateContent, SSE). 받은 글자 수를 알려 줘서 진행률을 보여 줄 수 있고,
 * 오래 걸려도 데이터가 계속 오는 동안은 끊지 않는다 (아무것도 안 오는 idleMs가 넘으면 포기).
 */
export async function generateStream(
  model: string,
  key: string,
  body: unknown,
  onProgress: (chars: number) => void,
  opts: {
    totalMs?: number;
    idleMs?: number;
    /** 첫 데이터가 올 때까지 기다리는 시간. Gemini는 쓰기 전에 생각하는 동안 아무것도 보내지 않아서 idleMs보다 길게 둔다 */
    firstMs?: number;
    /** 받은 글이 이미 완성됐는지 (예: 끝까지 온 JSON). 그러면 연결이 안 닫혀도 바로 끝낸다 */
    isComplete?: (text: string) => boolean;
    /** 이보다 길어지면 (같은 말을 끝없이 반복하는 등) 끊고 받은 데까지 돌려준다 */
    maxChars?: number;
    /** 같은 글을 반복하기 시작했는지. 그러면 maxChars를 기다리지 않고 바로 끊는다 */
    isRunaway?: (text: string) => boolean;
  } = {},
): Promise<StreamResult> {
  const totalMs = opts.totalMs ?? 240_000;
  const idleMs = opts.idleMs ?? 60_000;
  const firstMs = opts.firstMs ?? idleMs;
  const ctrl = new AbortController();
  let reason = '';
  let started = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const bump = () => {
    clearTimeout(idle);
    const wait = started ? idleMs : firstMs;
    idle = setTimeout(() => {
      reason = started
        ? `응답이 ${Math.round(idleMs / 1000)}초 동안 오지 않아요. 인터넷 연결을 확인하고 다시 시도해 주세요`
        : `Gemini가 ${Math.round(firstMs / 1000)}초 동안 답을 시작하지 않았어요. 서버가 붐비는 것 같아요. 잠시 뒤에 다시 시도해 주세요`;
      ctrl.abort();
    }, wait);
  };
  /** 한 글자도 받기 전에 시간이 다 됐으면 "시작 안 함" 오류 (다른 모델로 넘어가게) */
  const timedOut = (text: string) => {
    if (started || text) return new GeminiError(text ? `${reason} (받은 글 ${text.length}자에서 멈춤)` : reason, 'network');
    const e = new GeminiError(reason, 'busy');
    e.noStart = true;
    return e;
  };
  const total = setTimeout(() => {
    reason = `너무 오래 걸려요 (${Math.round(totalMs / 1000)}초). 잠시 뒤에 다시 시도해 주세요`;
    ctrl.abort();
  }, totalMs);
  const aborted = new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  aborted.catch(() => {});
  bump();
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (reason) throw timedOut('');
      throw new GeminiError(e instanceof Error && /abort/i.test(e.name) ? '요청이 취소됐어요' : '인터넷에 연결되어 있지 않아요', 'network');
    }
    if (!res.ok) throw await errorFrom(res);
    let text = '';
    let finishReason: string | undefined;
    let usage: GenerateResponse['usageMetadata'];
    let ended: StreamResult['ended'];
    const take = (event: string) => {
      const data = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!data || data === '[DONE]') return;
      try {
        const j = JSON.parse(data) as GenerateResponse;
        finishReason = j.candidates?.[0]?.finishReason ?? finishReason;
        if (j.usageMetadata) usage = j.usageMetadata;
        const piece = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
        if (piece) {
          text += piece;
          onProgress(text.length);
        }
      } catch {
        /* 중간에 잘린 조각은 건너뛴다 */
      }
    };
    try {
      if (!res.body) take(`data: ${await res.text()}`);
      else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          if (opts.isComplete?.(text)) {
            ended = 'complete';
            break;
          }
          if ((opts.maxChars && text.length > opts.maxChars) || opts.isRunaway?.(text)) {
            ended = 'tooLong';
            break;
          }
          // 끊기 신호를 무시하는 연결도 있어서, 시간이 다 되면 읽기를 기다리지 않고 바로 끝낸다
          const { done, value } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          // 생각 요약이나 빈 줄이라도 무언가 오면 살아 있는 것
          started = true;
          bump();
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let at: number;
          while ((at = buf.indexOf('\n\n')) >= 0) {
            take(buf.slice(0, at));
            buf = buf.slice(at + 2);
          }
        }
        if (buf.trim()) take(buf);
        if (ended) void reader.cancel().catch(() => {});
      }
    } catch (e) {
      // 시간이 다 됐어도 받은 글이 완성돼 있으면 그대로 쓴다 (연결만 안 닫힌 경우)
      if (opts.isComplete?.(text)) return { text, ended: 'complete', finishReason, usage };
      if (reason) throw timedOut(text);
      throw e;
    }
    return { text, ended, finishReason, usage };
  } finally {
    clearTimeout(idle);
    clearTimeout(total);
  }
}

export interface StreamResult {
  text: string;
  /** complete: 완성된 글을 받고 먼저 끝냄, tooLong: 너무 길어서 끊음 */
  ended?: 'complete' | 'tooLong';
  /** Google이 알려 준 끝난 이유 (STOP, MAX_TOKENS …) */
  finishReason?: string;
  usage?: GenerateResponse['usageMetadata'];
}

/** Gemini 3.8 TTS: REST Interactions API (speech_metadata is not supported by generateContent). */
export function interact(key: string, body: unknown, timeoutMs = 45_000): Promise<unknown> {
  return call('interactions', key, { method: 'POST', body: JSON.stringify(body) }, timeoutMs);
}

export function generate(model: string, key: string, body: unknown, timeoutMs = 45_000): Promise<GenerateResponse> {
  return call(`models/${model}:generateContent`, key, { method: 'POST', body: JSON.stringify(body) }, timeoutMs) as Promise<GenerateResponse>;
}

/** 키가 맞는지 확인하고, 쓸 수 있는 모델 이름 목록을 돌려준다. */
export async function listModels(key: string): Promise<string[]> {
  const names: string[] = [];
  let pageToken = '';
  for (let i = 0; i < 5; i++) {
    const r = (await call(`models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`, key, {}, 15_000)) as {
      models?: { name: string }[];
      nextPageToken?: string;
    };
    names.push(...(r.models ?? []).map((m) => m.name.replace(/^models\//, '')));
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return names;
}

/** 선호 순서대로, 쓸 수 있는 첫 모델을 고른다. 목록에 없으면 이름에 hint가 든 최신 모델. */
export function pickModel(available: readonly string[], preferred: readonly string[], hint: RegExp): string | undefined {
  const found = preferred.find((p) => available.includes(p));
  if (found) return found;
  return available.filter((n) => hint.test(n)).sort().reverse()[0];
}
