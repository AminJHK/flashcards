import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWav, interactionAudio, storySpeechBody, synthesize, ttsBody } from './tts';

afterEach(() => vi.unstubAllGlobals());

describe('story speech generation', () => {
  it('uses 3.8 structured speech metadata, without mixing spoken directions into the transcript', () => {
    const body = storySpeechBody('Aku mau pulang.', 'gemini-3.8-flash-tts', 'Aoede', 'story');
    const part = body.input[0]!.content[0]!;
    expect(part.text).toBe('Aku mau pulang.');
    expect(part.annotations?.[0]?.type).toBe('speech_metadata');
    expect(part.annotations?.[0]?.style).toContain('everyday Indonesian');
    expect(body.generation_config.speech_config[0]!.voice).toBe('Aoede');
    expect(body.response_format.type).toBe('audio');
  });

  it('retains legacy TTS prompting for older models', () => {
    const story = ttsBody('Aku mau pulang.', 'id-ID', 'Kore', 'gemini-3.1-flash-tts-preview', 'story');
    expect(story.contents[0]!.parts[0]!.text).toContain('everyday Indonesian');
    const normal = ttsBody('Aku mau pulang.', 'id-ID', 'Kore', 'gemini-3.1-flash-tts-preview');
    expect(normal.contents[0]!.parts[0]!.text).toBe('Aku mau pulang.');
  });

  it('uses last model audio in REST Interactions response', () => {
    expect(interactionAudio({
      steps: [{ type: 'model_output', content: [{ type: 'text', data: 'ignore' }] },
        { type: 'model_output', content: [{ type: 'audio', data: 'aGVsbG8=', mime_type: 'audio/wav' }] }],
    })).toEqual({ data: 'aGVsbG8=', mimeType: 'audio/wav' });
  });

  it('actually sends Gemini 3.8 TTS requests to /interactions, not :generateContent', async () => {
    const wav = new Uint8Array(44);
    wav.set([82, 73, 70, 70], 0);
    wav.set([87, 65, 86, 69], 8);
    const data = btoa(String.fromCharCode(...wav));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      steps: [{ type: 'model_output', content: [{ type: 'audio', data, mime_type: 'audio/wav' }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const blob = await synthesize('Aku mau pulang.', 'id-ID', 'Aoede', 'gemini-3.8-flash-tts', 'FAKE-KEY', 'story');
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44);
    expect(fetchMock.mock.calls[0]![0]).toContain('/v1beta/interactions');
    const request = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(request.input[0].content[0].text).toBe('Aku mau pulang.');
    expect(request.input[0].content[0].annotations[0].type).toBe('speech_metadata');
  });

  it('recognises audio WAV headers without double-wrapping them', () => {
    const wav = new Uint8Array(44);
    wav.set([82, 73, 70, 70], 0);
    wav.set([87, 65, 86, 69], 8);
    expect(isWav(wav)).toBe(true);
    expect(isWav(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });
});
