import type { Block, CardType } from './types';
import { ttsText } from './types';

/**
 * 인도네시아어 구어 단어. 현지인이 말하는 형태(구어형)를 보고 뜻을 떠올린다 (듣기·알아듣기 중심).
 * 뒷면에 표준형·어근·짧은 구어 예문·사용역(일반/구어/자카르타식…)·주의사항을 같이 보여준다.
 */
const LANG = 'id-ID';

export const idSpoken: CardType = {
  id: 'id-spoken',
  version: 1,
  name: '인도네시아어 구어',
  shortName: '구어',
  description: '현지인이 말하는 형태를 보고 뜻을 떠올려요. 표준형·어근·예문을 함께 봐요.',
  ttsField: 'word',
  fields: [
    { key: 'word', label: '말하는 형태', required: true, lang: LANG, input: 'latin', placeholder: '예: nyari' },
    { key: 'meaning', label: '뜻', required: true, lang: 'ko-KR', input: 'text', placeholder: '예: 찾다' },
    { key: 'standard', label: '표준형', lang: LANG, input: 'latin', placeholder: '예: mencari' },
    { key: 'root', label: '어근', lang: LANG, input: 'latin', placeholder: '예: cari' },
    { key: 'example', label: '예문', lang: LANG, input: 'sentence', placeholder: '예: Lagi nyari apa?' },
    { key: 'exampleKo', label: '예문 뜻', lang: 'ko-KR', input: 'sentence', placeholder: '예: 뭐 찾고 있어?' },
    { key: 'register', label: '사용역', input: 'text', placeholder: '일반 / 구어 / 자카르타식 / 격식 / 속어' },
    { key: 'note', label: '주의', input: 'memo', placeholder: '쓰임새, 비슷한 말' },
  ],
  templates: [
    { id: 'forward', label: '구어 보고 뜻 떠올리기', answer: 'reveal' },
    { id: 'reverse', label: '뜻 보고 구어 떠올리기', optional: true, answer: 'reveal' },
  ],
  view(templateId, ctx) {
    const f = ctx.fields;
    const t = (k: string) => (f[k] ?? '').trim();
    const sayWord = { text: ttsText('word', ctx), lang: LANG };
    const sayExample = t('example') ? [{ text: t('example'), lang: LANG }] : [];
    const forms = [
      t('standard') && t('standard') !== t('word') ? `표준형 ${t('standard')}` : '',
      t('root') && t('root') !== t('word') ? `어근 ${t('root')}` : '',
      t('register'),
    ].filter(Boolean);
    const tags: Block[] = forms.length ? [{ kind: 'tags', items: forms }] : [];
    const memo: Block[] = t('note') ? [{ kind: 'memo', text: t('note') }] : [];
    const example: Block[] = [
      ...(t('example') ? [{ kind: 'sentence' as const, text: t('example'), lang: LANG, emphasis: 'main' as const, highlight: t('word') }] : []),
      ...(t('exampleKo') ? [{ kind: 'sentence' as const, text: t('exampleKo'), lang: 'ko-KR', emphasis: 'sub' as const }] : []),
    ];
    // 뒷면: 단어 · 뜻 · 꼬리표(위, 가운데) → 예문 · 메모(아래, 왼쪽)
    const back: Block[] = [{ kind: 'word', text: t('word'), size: 'back', lang: LANG }, { kind: 'meaning', text: t('meaning'), size: 'back' }, ...tags, ...example, ...memo];
    if (templateId === 'reverse') {
      return {
        front: [{ kind: 'meaning', text: t('meaning'), size: 'front' }],
        back,
        tts: { front: [], back: [sayWord, ...sayExample] },
        autoplay: ctx.deck.settings.autoplay === 'off' ? 'off' : 'back',
      };
    }
    // 예문 먼저: 뜻이 문맥에 따라 달라지는 연결어·표현은 단어만 보면 떠올리기 어려워서, 예문 속에서 본다 (덱 설정 "예문 먼저 보기")
    if (ctx.deck.settings.sentenceFirst && t('example')) {
      return {
        front: [
          { kind: 'prompt', text: `「${t('word')}」는 여기서 무슨 뜻일까?` },
          { kind: 'sentence', text: t('example'), lang: LANG, emphasis: 'main', highlight: t('word') },
        ],
        back,
        tts: { front: sayExample, back: [sayWord, ...sayExample] },
      };
    }
    return {
      front: [{ kind: 'word', text: t('word'), size: 'front', lang: LANG }],
      back,
      tts: { front: [sayWord], back: [sayWord, ...sayExample] },
    };
  },
  duplicateKey: (f) => (f.word ?? '').trim().toLowerCase(),
  summary: (f) => ({ title: f.word ?? '', sub: f.meaning ?? '' }),
};
