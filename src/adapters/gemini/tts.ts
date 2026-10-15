import { base64ToBytes, pcm16ToWav, sampleRateOf } from '../audio/wav';
import { GeminiError, generate, interact } from './api';

/** 무료로 쓸 수 있는 TTS 모델 (선호 순서). 실제로 쓸 모델은 키를 연결할 때 목록에서 고른다. */
export const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];

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

/** 지역 발음이 중요한 언어 (예: 스페인 스페인어와 중남미 스페인어) */
const REGION_EN: Record<string, string> = {
  'es-ES': 'Spanish (Spain)',
};

/**
 * Gemini에 보낼 글. 설명이 길면 모델이 그 설명까지 소리 내어 읽어 버리므로 가능한 한 짧게 쓴다.
 * - 문장(세 단어 이상)은 글자만 보낸다. 언어는 글을 보고 알아서 알아듣는다.
 * - 한두 단어는 언어를 잘못 짐작하기 쉬워서 "Say in 언어: 단어" 한 줄만 앞에 붙인다.
 */
export function ttsPrompt(text: string, lang: string): string {
  const t = text.trim();
  if (t.split(/\s+/).length >= 3 || t.length >= 12) return t;
  const name = REGION_EN[lang] ?? LANG_EN[lang.slice(0, 2).toLowerCase()] ?? lang;
  return `Say in ${name}: ${t}`;
}

/** Existing generateContent TTS request, retained for older models. */
export function ttsBody(text: string, lang: string, voice: string, _model: string, style?: 'story') {
  const transcript = ttsPrompt(text, lang);
  return {
    contents: [{ parts: [{
      text: style === 'story'
        ? `Say naturally in fluent, relaxed everyday Indonesian, like a local friend in a conversation (not a textbook narrator). Read ONLY this sentence: "${text.trim()}"`
        : transcript,
    }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
}

/** The Gemini 3.8 REST Interactions endpoint accepts structured, non-spoken style metadata. */
export function storySpeechBody(text: string, model: string, voice: string, style?: 'story') {
  return {
    model,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text: text.trim(),
        ...(style === 'story' ? { annotations: [{
          type: 'speech_metadata',
          style: 'Natural everyday Indonesian conversation, warm and relaxed, fluid native Indonesian pronunciation, lively but not exaggerated intonation, comfortable normal pace. Not formal or robotic.',
        }] } : {}),
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  };
}

export function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE';
}

/** Raw REST response: base64 audio in the last model_output step; not the SDK's output_audio shortcut. */
export function interactionAudio(result: unknown): { data: string; mimeType?: string } {
  const r = result as {
    steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[];
  };
  const outputs = (r?.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'audio' && typeof part.data === 'string' && !!part.data);
  const audio = outputs.at(-1);
  if (!audio?.data) throw new GeminiError('Gemini가 음성을 보내지 않았어요', 'empty');
  return { data: audio.data, mimeType: audio.mime_type };
}

export async function synthesize(text: string, lang: string, voice: string, model: string, key: string, style?: 'story'): Promise<Blob> {
  let bytes: Uint8Array;
  let mimeType: string | undefined;
  if (model.startsWith('gemini-3.8-') && model.includes('-tts')) {
    const audio = interactionAudio(await interact(key, storySpeechBody(text, model, voice, style)));
    bytes = base64ToBytes(audio.data);
    mimeType = audio.mimeType;
  } else {
    const r = await generate(model, key, ttsBody(text, lang, voice, model, style));
    const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new GeminiError('음성을 만들지 못했어요', 'empty');
    bytes = base64ToBytes(part.inlineData.data);
    mimeType = part.inlineData.mimeType;
  }
  const wav = isWav(bytes) ? bytes : pcm16ToWav(bytes, sampleRateOf(mimeType));
  return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
}
