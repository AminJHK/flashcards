import { GeminiError } from '../gemini/api';
import { TTS_MODELS } from '../gemini/tts';

/** Prefer the chosen voice engine; try only other known free-tier TTS models on quota/model errors. */
export function storyTtsModels(primary: string, enabled = true): string[] {
  return enabled ? [...new Set([primary, ...TTS_MODELS])] : [primary];
}

export function canSwitchTtsModel(error: unknown): error is GeminiError {
  return error instanceof GeminiError && (error.kind === 'quota' || error.kind === 'model');
}

/** 모델 이름을 짧게 (gemini-3.8-flash-lite-tts → 3.8 Flash-Lite) */
export function shortTtsName(model: string): string {
  const m = /gemini-([\d.]+)-(flash-lite|flash|pro)/.exec(model);
  if (!m) return model;
  return `${m[1]} ${m[2] === 'flash-lite' ? 'Flash-Lite' : m[2] === 'pro' ? 'Pro' : 'Flash'}`;
}

/** Google의 하루 한도가 다시 채워지는 때 (미국 태평양 시간 자정) */
export function nextQuotaReset(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const sinceMidnight = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000;
  return now + 86_400_000 - sinceMidnight;
}

export type TtsModelState = 'daily' | 'minute' | 'unavailable';

/** 모든 음성 모델이 안 될 때: 모델마다 어떤 상태인지 알려 준다 */
export function allModelsMessage(states: ReadonlyMap<string, TtsModelState>, now: number): string {
  const by = (s: TtsModelState) => [...states].filter(([, v]) => v === s).map(([m]) => shortTtsName(m));
  const parts = [
    by('daily').length ? `오늘 한도 끝: ${by('daily').join(', ')}` : '',
    by('minute').length ? `잠깐 쉬는 중(분당 한도): ${by('minute').join(', ')}` : '',
    by('unavailable').length ? `이 키로 못 씀: ${by('unavailable').join(', ')}` : '',
  ].filter(Boolean);
  const reset = new Date(nextQuotaReset(now)).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const tail = by('minute').length ? '잠시 뒤에 다시 시도해요.' : `하루 한도는 Google 기준으로 보통 오늘 ${reset}쯤 다시 채워져요.`;
  return `Gemini 음성 모델 ${states.size}개를 모두 시도했어요 · ${parts.join(' · ')}. ${tail} 그동안은 기기 음성으로 읽어요.`;
}
