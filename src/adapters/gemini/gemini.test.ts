import { afterEach, describe, expect, it, vi } from 'vitest';
import { pcm16ToWav, sampleRateOf } from '../audio/wav';
import { GeminiError, listModels, pickModel } from './api';
import { transcribe } from './stt';
import { synthesize, ttsPrompt } from './tts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('WAV', () => {
  it('PCM에 44바이트 WAV 헤더를 붙인다', () => {
    const wav = pcm16ToWav(new Uint8Array([1, 2, 3, 4]), 24000);
    const v = new DataView(wav.buffer);
    expect(wav.length).toBe(48);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint32(40, true)).toBe(4);
  });

  it('mimeType에서 샘플레이트를 읽는다', () => {
    expect(sampleRateOf('audio/L16;codec=pcm;rate=24000')).toBe(24000);
    expect(sampleRateOf(undefined, 16000)).toBe(16000);
  });
});

describe('Gemini API', () => {
  it('키 오류·한도 초과를 알아듣기 쉬운 메시지로 바꾼다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })));
    await expect(listModels('bad')).rejects.toMatchObject({ kind: 'key' });
    vi.stubGlobal('fetch', vi.fn(async () => json(429, { error: { message: 'Resource exhausted' } })));
    await expect(listModels('k')).rejects.toMatchObject({ kind: 'quota' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(listModels('k')).rejects.toMatchObject({ kind: 'network' });
  });

  it('선호하는 TTS 모델을 고르고, 없으면 이름에 tts가 든 모델을 쓴다', () => {
    expect(pickModel(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'], ['gemini-3.8-flash-tts'], /-tts/)).toBe('gemini-3.8-flash-tts');
    expect(pickModel(['gemini-9-flash-tts', 'gemini-flash-latest'], ['gemini-3.8-flash-tts'], /-tts/)).toBe('gemini-9-flash-tts');
    expect(pickModel(['gemini-flash-latest'], ['gemini-3.8-flash-tts'], /-tts/)).toBeUndefined();
  });

  it('TTS: 음성 설정을 보내고 PCM을 WAV로 돌려받는다', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: btoa('\x00\x01\x02\x03') } }] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const blob = await synthesize('银行', 'zh-CN', 'Kore', 'gemini-3.8-flash-tts', 'KEY');
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(48);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('models/gemini-3.8-flash-tts:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
    expect(body.contents[0].parts[0].text).toBe(ttsPrompt('银行', 'zh-CN'));
    expect(ttsPrompt('besok', 'id-ID')).toMatch(/Indonesian.*: besok$/);
  });

  it('받아쓰기: 첫 모델이 없으면 다음 모델로 넘어간다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(404, { error: { message: 'not found' } }))
      .mockResolvedValueOnce(json(200, { candidates: [{ content: { parts: [{ text: ' 你想什么时候去 \n' }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const text = await transcribe({ data: new Uint8Array([1, 2]), mimeType: 'audio/wav' }, 'zh-CN', ['a', 'b'], 'KEY');
    expect(text).toBe('你想什么时候去');
    expect(fetchMock.mock.calls[1]![0]).toContain('models/b:generateContent');
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
    expect(body.systemInstruction.parts[0].text).toMatch(/Simplified Chinese/);
  });

  it('받아쓰기: 키 오류는 다음 모델로 넘기지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, {})));
    await expect(transcribe({ data: new Uint8Array([1]), mimeType: 'audio/webm' }, 'zh-CN', ['a', 'b'], 'KEY')).rejects.toBeInstanceOf(GeminiError);
  });
});
