import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { DEFAULT_SETTINGS } from '../../core/model/types';
import type { Story } from '../../core/stories/types';
import { allModelsMessage, nextQuotaReset, shortTtsName } from './modelFallback';
import { prepareStoryAudio, resetStoryQuota, setStoryWait, storyWait } from './speech';

const fakeWav = () => {
  const bytes = new Uint8Array(44);
  bytes.set([82, 73, 70, 70], 0);
  bytes.set([87, 65, 86, 69], 8);
  return btoa(String.fromCharCode(...bytes));
};
const settings = () => ({
  ...DEFAULT_SETTINGS,
  gemini: { apiKey: 'FAKE-KEY', ttsModel: 'gemini-3.8-flash-tts', voice: 'Aoede', useTts: true, useStt: false },
});
const story = (n: number) =>
  ({
    id: 'st',
    lang: 'id-ID',
    characters: [],
    blocks: Array.from({ length: n }, (_, i) => ({ kind: 'line', speaker: 'narrator', text: `Kalimat nomor ${i}.`, ko: '' })),
  }) as unknown as Story;
const audioOk = () => new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: fakeWav(), mime_type: 'audio/wav' }] }] }), { status: 200 });
const minuteLimit = () => new Response(JSON.stringify({ error: { message: 'Quota exceeded: requests per minute', details: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }] } }), { status: 429 });

const originalWait = storyWait;
beforeEach(async () => {
  vi.unstubAllGlobals();
  vi.stubGlobal('navigator', { onLine: true });
  resetStoryQuota();
  await db.audio.clear();
});
afterEach(() => setStoryWait(originalWait));

describe('이야기 음성 준비: 모델을 돌려 써서 분당 한도 기다림을 줄인다', () => {
  it('한 모델이 분당 한도에 걸리면 기다리지 않고 다음 모델로 이어서 12문장을 모두 준비한다', async () => {
    const used: Record<string, number> = {};
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      const model = (JSON.parse(init!.body as string) as { model: string }).model;
      used[model] = (used[model] ?? 0) + 1;
      // 기본 모델은 3번째부터 분당 한도
      if (model === 'gemini-3.8-flash-tts' && used[model]! > 2) return minuteLimit();
      return audioOk();
    }));
    const wait = vi.fn(async () => {});
    setStoryWait(wait);
    let last = { done: 0, total: 0, stopped: undefined as string | undefined };
    await prepareStoryAudio(story(12), settings(), (done, total, stopped) => (last = { done, total, stopped }));
    expect(last).toMatchObject({ done: 12, total: 12 });
    expect(wait).not.toHaveBeenCalled();
    expect(used['gemini-3.8-flash-lite-tts']).toBeGreaterThan(0);
  });

  it('예전처럼 모델마다 1분에 2문장으로 스스로 막지 않는다 (Google이 막기 전까지는 그냥 만든다)', async () => {
    const f = vi.fn(async () => audioOk());
    vi.stubGlobal('fetch', f);
    const wait = vi.fn(async () => {});
    setStoryWait(wait);
    await prepareStoryAudio(story(9), settings(), () => {});
    expect(f).toHaveBeenCalledTimes(9);
    expect(wait).not.toHaveBeenCalled();
  });

  it('모든 모델이 분당 한도에 걸렸을 때만, 가장 먼저 풀리는 모델까지 (최대 90초) 기다린다', async () => {
    let blocked = true;
    vi.stubGlobal('fetch', vi.fn(async () => (blocked ? minuteLimit() : audioOk())));
    const waits: number[] = [];
    setStoryWait(async (ms) => {
      waits.push(ms);
      blocked = false;
      resetStoryQuota(); // 기다리는 동안 한도가 풀린 것으로
    });
    const progress: (string | undefined)[] = [];
    await prepareStoryAudio(story(2), settings(), (_d, _t, stopped) => progress.push(stopped));
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(0);
    expect(waits[0]).toBeLessThanOrEqual(90_000);
    expect(progress.some((p) => /분당 무료 한도를 기다리는 중… \(\d+초\)/.test(p ?? ''))).toBe(true);
  });
});

describe('모든 음성 모델이 안 될 때: 모델마다 상태를 알려 준다', () => {
  const dailyLimit = () => new Response(JSON.stringify({ error: { message: 'Quota exceeded for metric: generate_requests_per_model_per_day', details: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] } }), { status: 429 });
  const notFound = () => new Response(JSON.stringify({ error: { message: 'models/x is not found' } }), { status: 404 });

  it('오늘 한도가 끝난 모델과 이 키로 못 쓰는 모델을 나눠 보여 주고, 기다리지 않는다', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { model?: string };
      const model = body.model ?? /models\/([^:]+):/.exec(String(url))?.[1] ?? '?';
      calls.push(model);
      return model.startsWith('gemini-2.5') ? notFound() : dailyLimit();
    }));
    const wait = vi.fn(async () => {});
    setStoryWait(wait);
    let stopped: string | undefined;
    await prepareStoryAudio(story(3), settings(), (_d, _t, why) => (stopped = why ?? stopped));
    expect(wait).not.toHaveBeenCalled();
    expect(stopped).toMatch(/Gemini 음성 모델 4개를 모두 시도했어요/);
    expect(stopped).toMatch(/오늘 한도 끝: 3\.8 Flash, 3\.8 Flash-Lite, 3\.1 Flash/);
    expect(stopped).toMatch(/이 키로 못 씀: 2\.5 Flash/);
    expect(stopped).toMatch(/다시 채워져요/);
    // 첫 문장에서 4개 모델을 한 번씩만 써 보고 멈춘다 (한도 끝난 모델을 계속 부르지 않는다)
    expect(calls).toHaveLength(4);
  });

  it('모델 이름 줄이기, 하루 한도가 채워지는 때(미국 태평양 자정)', () => {
    expect(shortTtsName('gemini-3.8-flash-lite-tts')).toBe('3.8 Flash-Lite');
    expect(shortTtsName('gemini-2.5-flash-preview-tts')).toBe('2.5 Flash');
    // 시드니 10월 16일 16:35 = 태평양 10월 15일 22:35 → 다음 자정은 UTC 07:00 (시드니 18:00)
    expect(new Date(nextQuotaReset(Date.UTC(2026, 9, 16, 5, 35))).toISOString()).toBe('2026-10-16T07:00:00.000Z');
    const m = allModelsMessage(new Map([['gemini-3.8-flash-tts', 'minute']]), Date.UTC(2026, 9, 16, 5, 35));
    expect(m).toMatch(/잠깐 쉬는 중\(분당 한도\): 3\.8 Flash/);
    expect(m).toMatch(/잠시 뒤에 다시 시도해요/);
  });
});
