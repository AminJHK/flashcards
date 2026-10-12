import type { Block, CardType } from './types';
import { resolveLang } from './types';

/**
 * 스페인어 동사 변화 (유럽 스페인어, 6인칭). 동사 하나의 한 시제를 카드 한 장에 모아 보여준다.
 * 앞면: 동사 원형 + 시제 → 뒷면: 사람별 변화형. 불규칙 동사를 따로 익히는 용도.
 * 필드에는 변화형만 저장하고(예: tengo), 인칭 대명사는 view()에서 붙인다.
 */
const PERSONS = [
  ['yo', 'yo'],
  ['tu', 'tú'],
  ['el', 'él'],
  ['nos', 'nosotros'],
  ['vos', 'vosotros'],
  ['ellos', 'ellos'],
] as const;

export const esConj: CardType = {
  id: 'es-conj',
  version: 1,
  name: '스페인어 동사 변화',
  shortName: '동사 변화',
  description: '동사 원형과 시제를 보고 사람별 변화형(yo, tú, él, nosotros, vosotros, ellos)을 떠올려요.',
  ttsField: 'verb',
  fields: [
    { key: 'verb', label: '동사 원형', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tener' },
    { key: 'meaning', label: '뜻', required: true, lang: 'deck.back', input: 'text', placeholder: 'to have' },
    { key: 'tense', label: '시제', required: true, input: 'latin', placeholder: 'presente' },
    { key: 'yo', label: 'yo (나)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tengo' },
    { key: 'tu', label: 'tú (너)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tienes' },
    { key: 'el', label: 'él / ella / usted (그)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tiene' },
    { key: 'nos', label: 'nosotros (우리)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tenemos' },
    { key: 'vos', label: 'vosotros (너희)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tenéis' },
    { key: 'ellos', label: 'ellos / ellas / ustedes (그들)', required: true, lang: 'deck.front', input: 'latin', placeholder: 'tienen' },
    { key: 'memo', label: '메모', input: 'memo', placeholder: '예문이나 외우는 요령' },
  ],
  templates: [{ id: 'forward', label: '동사 → 변화형', answer: 'reveal' }],
  view(_templateId, ctx) {
    const f = ctx.fields;
    const lang = resolveLang('deck.front', ctx.deck);
    const lines = PERSONS.map(([key, pron]) => `${pron} ${(f[key] ?? '').trim()}`);
    const head: Block[] = [{ kind: 'prompt', text: (f.tense ?? '').trim() }];
    return {
      front: [
        ...head,
        { kind: 'word', text: (f.verb ?? '').trim(), size: 'front', lang },
        { kind: 'meaning', text: (f.meaning ?? '').trim(), size: 'back' },
      ],
      back: [
        ...head,
        { kind: 'word', text: (f.verb ?? '').trim(), size: 'back', lang },
        { kind: 'divider' },
        ...lines.map((text): Block => ({ kind: 'sentence', text, lang, emphasis: 'sub' })),
        { kind: 'memo', text: ['usted는 él 형태, ustedes는 ellos 형태를 써요', f.memo?.trim()].filter(Boolean).join('\n') },
      ],
      tts: {
        front: [{ text: (f.verb ?? '').trim(), lang }],
        back: [{ text: lines.join(', '), lang }],
      },
    };
  },
  duplicateKey: (f) => `${(f.verb ?? '').trim()}|${(f.tense ?? '').trim()}`.toLowerCase(),
  summary: (f) => ({ title: f.verb ?? '', sub: `${f.tense ?? ''} · ${f.meaning ?? ''}` }),
};
