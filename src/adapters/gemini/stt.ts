import { bytesToBase64 } from '../audio/wav';
import { GeminiError, generate } from './api';

/** 받아쓰기 모델 (선호 순서). 'latest' 별칭이라 새 모델이 나오면 자동으로 따라간다. */
export const STT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

const LANG_EN: Record<string, string> = { zh: 'Mandarin Chinese', id: 'Indonesian', ko: 'Korean', en: 'English', ja: 'Japanese' };

export function sttInstruction(lang: string): string {
  const name = LANG_EN[lang.slice(0, 2).toLowerCase()] ?? lang;
  const script = lang.startsWith('zh') ? ' Write it in Simplified Chinese characters. Do not add pinyin.' : '';
  return [
    `You transcribe a language learner's spoken answer in ${name}.`,
    `Write exactly the words that were spoken, even if they contain mistakes. Do not correct grammar or word choice.${script}`,
    'Output only the transcription, with no translation, quotes or explanation. If nothing is spoken, output nothing.',
  ].join(' ');
}

export async function transcribe(wav: Uint8Array, lang: string, models: readonly string[], key: string): Promise<string> {
  let last: unknown;
  for (const model of models) {
    try {
      const r = await generate(model, key, {
        systemInstruction: { parts: [{ text: sttInstruction(lang) }] },
        contents: [{ parts: [{ inlineData: { mimeType: 'audio/wav', data: bytesToBase64(wav) } }, { text: 'Transcribe.' }] }],
        generationConfig: { temperature: 0 },
      });
      return (r.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();
    } catch (e) {
      last = e;
      // 모델이 없거나 한도에 걸리면 다음 모델로
      if (!(e instanceof GeminiError) || (e.kind !== 'model' && e.kind !== 'quota')) throw e;
    }
  }
  throw last;
}
