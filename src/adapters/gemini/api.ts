/**
 * Gemini API (Google AI Studio 무료 키). 키는 이 기기의 설정에만 저장한다.
 * 무료 사용 시 Google이 보낸 내용을 서비스 개선에 쓸 수 있다 (설정 화면에 안내).
 */

import { fetchWithTimeout, TimeoutError } from '../net';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'quota' | 'model' | 'network' | 'empty' | 'other',
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
  let msg = '';
  try {
    msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    /* 본문 없음 */
  }
  if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError('API 키가 올바르지 않아요. 다시 복사해 붙여넣어 주세요', 'key');
  if (res.status === 401 || res.status === 403) throw new GeminiError('API 키를 쓸 수 없어요. 키를 다시 확인해 주세요', 'key');
  if (res.status === 429) throw new GeminiError('오늘 무료 사용량을 다 썼거나 너무 빨리 요청했어요. 잠시 뒤에 다시 시도해요', 'quota');
  if (res.status === 404) throw new GeminiError('이 모델을 쓸 수 없어요', 'model');
  // 원인을 알 수 있게 Google이 준 이유를 짧게 붙인다
  throw new GeminiError(`Gemini 오류 (${res.status}${msg ? `: ${msg.slice(0, 80)}` : ''})`, 'other');
}

export interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] } }[];
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
