import { base64ToBytes, pcm16ToWav, sampleRateOf } from '../audio/wav';
import { GeminiError, generate } from './api';

/** 무료로 쓸 수 있는 TTS 모델 (선호 순서). 실제로 쓸 모델은 키를 연결할 때 목록에서 고른다. */
export const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'];

/** Gemini 기본 음성 중 일부. 언어와 상관없이 쓸 수 있다. */
export const GEMINI_VOICES: [string, string][] = [
  ['Kore', '여성 · 또렷함'],
  ['Aoede', '여성 · 산뜻함'],
  ['Leda', '여성 · 젊음'],
  ['Puck', '남성 · 밝음'],
  ['Charon', '남성 · 차분함'],
  ['Orus', '남성 · 단단함'],
];

const LANG_EN: Record<string, string> = {
  zh: 'Mandarin Chinese (Putonghua)',
  id: 'Indonesian',
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  vi: 'Vietnamese',
  th: 'Thai',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

/** 짧은 단어는 언어를 잘못 짐작할 수 있어서, 읽을 언어를 앞에 알려준다. */
export function ttsPrompt(text: string, lang: string): string {
  const name = LANG_EN[lang.slice(0, 2).toLowerCase()] ?? lang;
  return `Say in ${name}, clearly and naturally, at a calm pace for a language learner: ${text}`;
}

export async function synthesize(text: string, lang: string, voice: string, model: string, key: string): Promise<Blob> {
  const r = await generate(model, key, {
    contents: [{ parts: [{ text: ttsPrompt(text, lang) }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new GeminiError('음성을 만들지 못했어요', 'empty');
  const wav = pcm16ToWav(base64ToBytes(part.inlineData.data), sampleRateOf(part.inlineData.mimeType));
  return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
}
