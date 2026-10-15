import { describe, expect, it } from 'vitest';
import { isWav, ttsBody } from './tts';

describe('story speech generation', () => {
  it('uses a natural conversational style for story lines without changing normal card audio', () => {
    const story = ttsBody('Aku mau pulang.', 'id-ID', 'Kore', 'gemini-3.1-flash-tts-preview', 'story');
    expect(story.contents[0]!.parts[0]!.text).toContain('conversational Indonesian');
    expect(story.contents[0]!.parts[0]!.text).toContain('Aku mau pulang.');
    const normal = ttsBody('Aku mau pulang.', 'id-ID', 'Kore', 'gemini-3.1-flash-tts-preview');
    expect(normal.contents[0]!.parts[0]!.text).toBe('Aku mau pulang.');
  });

  it('recognises audio WAV headers without double-wrapping them', () => {
    const wav = new Uint8Array(44);
    wav.set([82, 73, 70, 70], 0);
    wav.set([87, 65, 86, 69], 8);
    expect(isWav(wav)).toBe(true);
    expect(isWav(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });
});
