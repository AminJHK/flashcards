import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { DEFAULT_SETTINGS } from '../../core/model/types';
import { storyClipFor } from './speech';

const fakeWav = () => {
  const bytes = new Uint8Array(44);
  bytes.set([82, 73, 70, 70], 0);
  bytes.set([87, 65, 86, 69], 8);
  return btoa(String.fromCharCode(...bytes));
};
const settings = () => ({
  ...DEFAULT_SETTINGS,
  gemini: {
    apiKey: 'FAKE-KEY',
    ttsModel: 'gemini-3.8-flash-tts',
    voice: 'Aoede',
    useTts: true,
    useStt: false,
  },
});
const speech = { text: 'Aku suka membaca.', lang: 'id-ID', style: 'story' as const };

beforeEach(async () => {
  vi.unstubAllGlobals();
  await db.audio.clear();
});

describe('free-tier TTS model failover integration', () => {
  it('replays from phone cache without calling any Gemini API, and never synthesizes a missing line', async () => {
    const current = settings();
    const saved = new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' });
    const cacheKey = `v4|gemini-3.8-flash-lite-tts|Aoede|id-ID|Aku suka membaca.|style:story`;
    await db.audio.put({ key: cacheKey, blob: saved, createdAt: Date.now() });
    const request = vi.fn(() => { throw new Error('must not request TTS on replay'); });
    vi.stubGlobal('fetch', request);
    const found = await storyClipFor(speech, current, true, true);
    expect(found.model).toBe('gemini-3.8-flash-lite-tts');
    expect(found.cached).toBe(true);
    expect(request).not.toHaveBeenCalled();
    await expect(storyClipFor({ ...speech, text: 'Aku lapar.' }, current, true, true)).rejects.toMatchObject({ kind: 'empty' });
    expect(request).not.toHaveBeenCalled();
  });

  it('rotates on a daily quota error, saves the actual model and reuses the result offline', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string) as { model: string };
      calls.push(payload.model);
      if (payload.model === 'gemini-3.8-flash-tts') {
        return new Response(JSON.stringify({ error: {
          message: 'GenerateRequestsPerDay quota exceeded',
          details: [{ quotaId: 'RequestsPerDay' }],
        } }), { status: 429 });
      }
      return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [
        { type: 'audio', data: fakeWav(), mime_type: 'audio/wav' },
      ] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const first = await storyClipFor(speech, settings(), true);
    expect(first.model).toBe('gemini-3.8-flash-lite-tts');
    expect(first.cached).toBe(false);
    expect(first.blob.size).toBe(44);
    expect(calls).toEqual(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline API should not be called'); }));
    const second = await storyClipFor(speech, settings(), true);
    expect(second.model).toBe('gemini-3.8-flash-lite-tts');
    expect(second.cached).toBe(true);
  });
});
