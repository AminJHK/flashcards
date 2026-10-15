import { describe, expect, it } from 'vitest';
import { CHARACTER_VOICES, NARRATOR, NARRATOR_VOICE, roleOf, storyVoice } from './voices';

const story = { characters: [{ id: 'budi', name: 'Budi', color: 0 }, { id: 'sari', name: 'Sari', color: 1 }] };

describe('story voice casting', () => {
  it('gives the narrator and each character a distinct stable default voice', () => {
    const voices = [storyVoice(story, NARRATOR), storyVoice(story, 'budi'), storyVoice(story, 'sari')];
    expect(voices).toEqual([NARRATOR_VOICE, CHARACTER_VOICES[0], CHARACTER_VOICES[1]]);
    expect(new Set(voices).size).toBe(3);
  });

  it('detects narration and unknown speakers without adding characters', () => {
    expect(roleOf(story, { speaker: 'narrator' })).toBe(NARRATOR);
    expect(roleOf(story, { speaker: 'budi' })).toBe('budi');
    expect(roleOf(story, { speaker: 'unknown' })).toBe(NARRATOR);
  });

  it('supports overrides while rejecting invalid voice identifiers', () => {
    expect(storyVoice(story, 'budi', { budi: 'Orus' })).toBe('Orus');
    expect(storyVoice(story, 'budi', { budi: 'NotVoice' })).toBe('Aoede');
  });

  it('cycles deterministically for stories containing more than five characters', () => {
    const many = { characters: Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, name: 'Person ' + i, color: i })) };
    expect(storyVoice(many, 'c5')).toBe(CHARACTER_VOICES[0]);
  });
});
