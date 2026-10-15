import { GeminiError } from '../gemini/api';
import { TTS_MODELS } from '../gemini/tts';

/** Prefer the chosen voice engine; try only other known free-tier TTS models on quota/model errors. */
export function storyTtsModels(primary: string, enabled = true): string[] {
  return enabled ? [...new Set([primary, ...TTS_MODELS])] : [primary];
}

export function canSwitchTtsModel(error: unknown): error is GeminiError {
  return error instanceof GeminiError && (error.kind === 'quota' || error.kind === 'model');
}
