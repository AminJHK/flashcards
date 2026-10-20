import type { Block, CardType } from './types';

/**
 * 인도네시아어 어조 말 (sih, dong, deh, kok, kan, lho, nih, tuh …). 한국어로 딱 한 단어로 옮겨지지 않는 말이라
 * 뜻을 외우지 않고, 여러 예문을 계속 보면서 "어떤 상황에서 나오는 말인지" 감을 익힌다.
 * 노트 하나 = 예문 하나 (같은 말이 여러 노트에 들어간다). 읽기(이야기)에서는 같은 말을 하나로 묶어서 본다 (core/stories/vocab.ts).
 */
const LANG = 'id-ID';

/** 어조 말이 예문 안에서 어디에 있는지: 문두(맨 앞) · 문중(가운데) · 문미(맨 끝). 쉼표·문장부호는 단어에 안 센다 */
export function particlePlace(example: string, word: string): '문두' | '문중' | '문미' | undefined {
  const norm = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const tokens = example.split(/\s+/).map(norm).filter(Boolean);
  const at = tokens.indexOf(norm(word));
  if (at < 0) return undefined;
  return at === 0 ? '문두' : at === tokens.length - 1 ? '문미' : '문중';
}

export const idParticle: CardType = {
  id: 'id-particle',
  version: 2,
  name: '인도네시아어 어조 말 · 예문',
  shortName: '어조 말',
  description: '문장 속에서 어조 말의 느낌을 익혀요. 예문 하나가 카드 하나예요.',
  ttsField: 'example',
  fields: [
    { key: 'word', label: '어조 말', required: true, lang: LANG, input: 'latin', placeholder: '예: sih' },
    { key: 'meaning', label: '느낌', required: true, lang: 'ko-KR', input: 'text', placeholder: '예: 투덜대는 궁금함 · ~긴 한데' },
    { key: 'position', label: '붙는 자리', lang: 'ko-KR', input: 'text', placeholder: '예: 문미 · 문중 (강조할 말 바로 뒤)' },
    { key: 'example', label: '예문', required: true, lang: LANG, input: 'sentence', placeholder: '예: Kenapa sih kamu telat terus?' },
    { key: 'exampleKo', label: '예문 뜻', required: true, lang: 'ko-KR', input: 'sentence', placeholder: '예: 도대체 넌 왜 계속 늦어?' },
    { key: 'note', label: '이 문장에서', input: 'memo', placeholder: '이 문장에서 이 말이 하는 일' },
  ],
  // version 2: 붙는 자리(position) 칸 추가. 예전 단어는 빈 칸으로 둔다
  migrate: (from, f) => (from < 2 ? { ...f, position: f.position ?? '' } : f),
  templates: [{ id: 'forward', label: '예문 보고 느낌 떠올리기', answer: 'reveal' }],
  view(_templateId, ctx) {
    const f = ctx.fields;
    const t = (k: string) => (f[k] ?? '').trim();
    const sayExample = [{ text: t('example'), lang: LANG }];
    // 붙는 자리: 이 말이 보통 붙는 자리(칸에 적은 것) + 이 예문에서 실제로 어디에 있는지(자동)
    const place = particlePlace(t('example'), t('word'));
    const tagItems = [t('position') && `붙는 자리 · ${t('position')}`, place && `이 문장에서 · ${place}`].filter((x): x is string => !!x);
    const tags: Block[] = tagItems.length ? [{ kind: 'tags', items: tagItems }] : [];
    // 뒷면: 말 · 느낌 · 붙는 자리(위) → 예문 · 이 문장에서(아래)
    const back: Block[] = [
      { kind: 'word', text: t('word'), size: 'back', lang: LANG },
      { kind: 'meaning', text: t('meaning'), size: 'back' },
      ...tags,
      { kind: 'sentence', text: t('example'), lang: LANG, emphasis: 'main', highlight: t('word') },
      { kind: 'sentence', text: t('exampleKo'), lang: 'ko-KR', emphasis: 'sub' },
      ...(t('note') ? [{ kind: 'memo' as const, text: t('note') }] : []),
    ];
    return {
      front: [
        { kind: 'prompt', text: `「${t('word')}」는 여기서 어떤 느낌일까?` },
        { kind: 'sentence', text: t('example'), lang: LANG, emphasis: 'main', highlight: t('word') },
      ],
      back,
      tts: { front: sayExample, back: sayExample },
    };
  },
  // 같은 말의 다른 예문은 다른 카드다
  duplicateKey: (f) => `${(f.word ?? '').trim().toLowerCase()}|${(f.example ?? '').trim().toLowerCase()}`,
  summary: (f) => ({ title: f.example ?? '', sub: `${f.word ?? ''} · ${f.exampleKo ?? ''}` }),
};
