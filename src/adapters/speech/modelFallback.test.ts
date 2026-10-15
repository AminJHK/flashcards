import { describe, expect, it } from 'vitest';
import { GeminiError } from '../gemini/api';
import { canSwitchTtsModel, storyTtsModels } from './modelFallback';

describe('story TTS model failover', () => {
  it('starts with the selected model and never retries it in the same pass', () => {
    const ordered = storyTtsModels('gemini-3.8-flash-tts');
    expect(ordered).toEqual([
      'gemini-3.8-flash-tts',
      'gemini-3.8-flash-lite-tts',
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-flash-preview-tts',
    ]);
    expect(storyTtsModels('gemini-3.8-flash-lite-tts')[0]).toBe('gemini-3.8-flash-lite-tts');
    expect(new Set(storyTtsModels('gemini-3.8-flash-lite-tts')).size).toBe(4);
  });

  it('respects the user toggle to disable switching', () => {
    expect(storyTtsModels('gemini-3.8-flash-tts', false)).toEqual(['gemini-3.8-flash-tts']);
  });

  it('switches on quota and missing model, not on broken key or connectivity', () => {
    expect(canSwitchTtsModel(new GeminiError('429', 'quota', 'daily'))).toBe(true);
    expect(canSwitchTtsModel(new GeminiError('404', 'model'))).toBe(true);
    expect(canSwitchTtsModel(new GeminiError('bad key', 'key'))).toBe(false);
    expect(canSwitchTtsModel(new GeminiError('offline', 'network'))).toBe(false);
  });
});
