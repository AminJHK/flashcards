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
  ) {
    super(message);
  }
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
async function errorFrom(res: Response): Promise<GeminiError> {
  let msg = '';
  try {
    msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    /* 본문 없음 */
  }
  if (res.status === 400 && /api key/i.test(msg)) return new GeminiError('API 키가 올바르지 않아요. 다시 복사해 붙여넣어 주세요', 'key');
  if (res.status === 401 || res.status === 403) return new GeminiError('API 키를 쓸 수 없어요. 키를 다시 확인해 주세요', 'key');
  if (res.status === 429) return new GeminiError('오늘 무료 사용량을 다 썼거나 너무 빨리 요청했어요. 잠시 뒤에 다시 시도해요', 'quota');
  // 서버가 붐비거나 잠깐 고장 (503 "high demand" 등): 기다렸다 다시 하면 된다
  if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) return new GeminiError('Gemini 서버가 지금 붐벼요. 잠시 뒤에 다시 시도해요', 'busy');
  if (res.status === 404) return new GeminiError('이 모델을 쓸 수 없어요', 'model');
  // 원인을 알 수 있게 Google이 준 이유를 짧게 붙인다
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
  const ctrl = new AbortController();
  let reason = '';
  let idle: ReturnType<typeof setTimeout> | undefined;
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      reason = `응답이 ${Math.round(idleMs / 1000)}초 동안 오지 않아요. 인터넷 연결을 확인하고 다시 시도해 주세요`;
      ctrl.abort();
    }, idleMs);
  };
  const total = setTimeout(() => {
    reason = `너무 오래 걸려요 (${Math.round(totalMs / 1000)}초). 잠시 뒤에 다시 시도해 주세요`;
    ctrl.abort();
  }, totalMs);
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
      throw new GeminiError(reason || (e instanceof Error && /abort/i.test(e.name) ? '요청이 취소됐어요' : '인터넷에 연결되어 있지 않아요'), 'network');
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
          const { done, value } = await reader.read();
          if (done) break;
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
      if (reason) throw new GeminiError(text ? `${reason} (받은 글 ${text.length}자에서 멈춤)` : reason, 'network');
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
