import type { CardType } from './types';
import { ttsText } from './types';

/** 중국어 단어 (한자 / 병음 / 뜻). */
export const zhWord: CardType = {
  id: 'zh-word',
  version: 1,
  name: '중국어 단어',
  shortName: '중국어 단어',
  description: '한자를 보고 병음과 뜻을 떠올려요. 병음은 자동으로 채워져요.',
  ttsField: 'hanzi',
  fields: [
    { key: 'hanzi', label: '한자', required: true, lang: 'zh-CN', input: 'hanzi', placeholder: '例如 图书馆' },
    { key: 'pinyin', label: '병음', input: 'latin', autoFrom: 'hanzi', placeholder: '한자를 쓰면 자동으로 채워져요' },
    { key: 'meaning', label: '뜻', required: true, lang: 'ko-KR', input: 'text', placeholder: '예: 도서관' },
    { key: 'memo', label: '메모', input: 'memo', placeholder: '예문이나 외우는 요령' },
  ],
  templates: [
    { id: 'forward', label: '한자 → 뜻', answer: 'reveal' },
    { id: 'reverse', label: '뜻 → 한자', optional: true, answer: 'reveal' },
  ],
  view(templateId, ctx) {
    const f = ctx.fields;
    const memo = f.memo?.trim() ? [{ kind: 'memo' as const, text: f.memo.trim() }] : [];
    const say = { text: ttsText('hanzi', ctx), lang: 'zh-CN' };
    const back = [
      { kind: 'hanzi' as const, text: f.hanzi ?? '', size: 'back' as const },
      ...(f.pinyin?.trim() ? [{ kind: 'pinyin' as const, text: f.pinyin.trim() }] : []),
      { kind: 'divider' as const },
      { kind: 'meaning' as const, text: f.meaning ?? '', size: 'back' as const },
      ...memo,
    ];
    if (templateId === 'reverse') {
      return {
        front: [
          { kind: 'prompt', text: '중국어로?' },
          { kind: 'meaning', text: f.meaning ?? '', size: 'front' },
        ],
        back,
        tts: { front: [], back: [say] },
      };
    }
    return {
      front: [{ kind: 'hanzi', text: f.hanzi ?? '', size: 'front' }],
      back,
      tts: { front: [say], back: [say] },
    };
  },
  duplicateKey: (f) => (f.hanzi ?? '').trim(),
  summary: (f) => ({ title: f.hanzi ?? '', sub: [f.pinyin, f.meaning].filter(Boolean).join(' · ') }),
  derive(changedKey, fields, deps): Record<string, string> {
    if (changedKey !== 'hanzi' || !deps.pinyin) return {};
    const hanzi = (fields.hanzi ?? '').trim();
    return { pinyin: hanzi ? deps.pinyin(hanzi, 'word') : '' };
  },
};
