import type { CardType } from './types';
import { resolveLang, ttsText } from './types';

/** 기본 (앞/뒤). 언어는 덱 설정을 따른다 (예: 인도네시아어 → 한국어). */
export const basic: CardType = {
  id: 'basic',
  version: 1,
  name: '기본 (앞/뒤)',
  shortName: '기본',
  description: '앞면을 보고 뒷면을 떠올려요.',
  ttsField: 'front',
  fields: [
    { key: 'front', label: '앞면', required: true, lang: 'deck.front', input: 'latin', placeholder: 'contoh: perpustakaan' },
    { key: 'back', label: '뒷면', required: true, lang: 'deck.back', input: 'text', placeholder: '예: 도서관' },
    { key: 'memo', label: '메모', input: 'memo', placeholder: '예문이나 외우는 요령' },
  ],
  templates: [
    { id: 'forward', label: '앞면 → 뒷면', answer: 'reveal' },
    { id: 'reverse', label: '뒷면 → 앞면', optional: true, answer: 'reveal' },
  ],
  view(templateId, ctx) {
    const f = ctx.fields;
    const frontLang = resolveLang('deck.front', ctx.deck);
    const backLang = resolveLang('deck.back', ctx.deck);
    const memo = f.memo?.trim() ? [{ kind: 'memo' as const, text: f.memo.trim() }] : [];
    const sayFront = { text: ttsText('front', ctx), lang: frontLang };
    if (templateId === 'reverse') {
      return {
        front: [{ kind: 'word', text: f.back ?? '', size: 'front', lang: backLang }],
        back: [
          { kind: 'word', text: f.front ?? '', size: 'back', lang: frontLang },
          { kind: 'divider' },
          { kind: 'meaning', text: f.back ?? '', size: 'back' },
          ...memo,
        ],
        tts: { front: [], back: [sayFront] },
      };
    }
    return {
      front: [{ kind: 'word', text: f.front ?? '', size: 'front', lang: frontLang }],
      back: [
        { kind: 'word', text: f.front ?? '', size: 'back', lang: frontLang },
        { kind: 'divider' },
        { kind: 'meaning', text: f.back ?? '', size: 'back' },
        ...memo,
      ],
      tts: { front: [sayFront], back: [sayFront] },
    };
  },
  duplicateKey: (f) => (f.front ?? '').trim().toLowerCase(),
  summary: (f) => ({ title: f.front ?? '', sub: f.back ?? '' }),
};
