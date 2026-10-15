import type { Story, StoryLine } from './types';

/** Reusable voice cast for saved stories. A voice is requested separately for each line. */
export const NARRATOR = '__narrator__';
export const NARRATOR_VOICE = 'Charon';
export const CHARACTER_VOICES = ['Aoede', 'Puck', 'Leda', 'Orus', 'Kore'] as const;
const ALL_VOICES = new Set<string>([NARRATOR_VOICE, ...CHARACTER_VOICES]);

/** Unknown speaker IDs are narration, just like StoryReader's visual display. */
export function roleOf(story: Pick<Story, 'characters'>, line: Pick<StoryLine, 'speaker'>): string {
  return story.characters.some((c) => c.id === line.speaker) ? line.speaker : NARRATOR;
}

/** Stable assignments: narrator gets its own voice; characters alternate distinct voices. */
export function storyVoice(story: Pick<Story, 'characters'>, role: string, overrides: Record<string, string> = {}): string {
  const requested = overrides[role];
  if (requested && ALL_VOICES.has(requested)) return requested;
  if (role === NARRATOR) return NARRATOR_VOICE;
  const position = story.characters.findIndex((c) => c.id === role);
  return position < 0 ? NARRATOR_VOICE : CHARACTER_VOICES[position % CHARACTER_VOICES.length]!;
}
