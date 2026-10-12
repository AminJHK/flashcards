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
    { key: 'front', label: '단어 (배우는 말)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'contoh: perpustakaan' },
    { key: 'back', label: '뜻', required: true, lang: 'deck.back', input: 'text', placeholder: '예: 도서관' },
    { key: 'memo', label: '메모', input: 'memo', placeholder: '예문이나 외우는 요령' },
  ],
  templates: [
    { id: 'forward', label: '단어 보고 뜻 떠올리기', answer: 'reveal' },
    { id: 'reverse', label: '뜻 보고 단어 떠올리기', optional: true, answer: 'reveal' },
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
        // 먼저 보이는 뜻은 읽을 게 없으니, 정답(배우는 언어)에서 들려준다
        autoplay: ctx.deck.settings.autoplay === 'off' ? 'off' : 'back',
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
