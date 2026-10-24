import type { Block, CardType } from './types';
import { ttsText } from './types';
import { SPOKEN_OF } from '../stories/formalForms';
import { isConnector } from '../decks/connectors';
import { synonymGroupOf } from '../decks/synonymGroups';

/**
 * 인도네시아어 구어 단어. 현지인이 말하는 형태(구어형)를 보고 뜻을 떠올린다 (듣기·알아듣기 중심).
 * 뒷면에 표준형·어근·짧은 구어 예문·사용역(일반/구어/자카르타식…)·주의사항을 같이 보여준다.
 */
const LANG = 'id-ID';

/** "자주 쓰는 표현" 칸: 한 줄에 하나씩 "표현 = 뜻" (→ 도 받는다) */
export function parsePhrases(text: string): { text: string; ko: string }[] {
  return text
    .split('\n')
    .map((l) => /^(.+?)\s*(?:=|→)\s*(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ text: m[1]!.trim(), ko: m[2]!.trim() }));
}

export const idSpoken: CardType = {
  id: 'id-spoken',
  version: 2,
  name: '인도네시아어 구어',
  shortName: '구어',
  description: '현지인이 말하는 형태를 보고 뜻을 떠올려요. 표준형·어근·예문을 함께 봐요.',
  ttsField: 'word',
  fields: [
    { key: 'word', label: '말하는 형태', required: true, lang: LANG, input: 'latin', placeholder: '예: nyari' },
    { key: 'meaning', label: '뜻', required: true, lang: 'ko-KR', input: 'text', placeholder: '예: 찾다' },
    { key: 'en', label: '영어 뜻', lang: 'en-US', input: 'text', placeholder: '예: to look for' },
    { key: 'standard', label: '표준형', lang: LANG, input: 'latin', placeholder: '예: mencari' },
    { key: 'root', label: '어근', lang: LANG, input: 'latin', placeholder: '예: cari' },
    { key: 'example', label: '예문', lang: LANG, input: 'sentence', placeholder: '예: Lagi nyari apa?' },
    { key: 'exampleKo', label: '예문 뜻', lang: 'ko-KR', input: 'sentence', placeholder: '예: 뭐 찾고 있어?' },
    { key: 'phrases', label: '자주 쓰는 표현', input: 'sentence', placeholder: '한 줄에 하나씩. 예: nyari kerja = 일자리를 찾다' },
    { key: 'register', label: '사용역', input: 'text', placeholder: '일반 / 구어 / 자카르타식 / 격식 / 속어' },
    { key: 'note', label: '주의', input: 'memo', placeholder: '쓰임새, 비슷한 말' },
  ],
  // version 2: 영어 뜻(en)·자주 쓰는 표현(phrases) 칸 추가. 예전 단어는 빈 칸으로 둔다
  migrate: (from, f) => (from < 2 ? { ...f, en: f.en ?? '', phrases: f.phrases ?? '' } : f),
  templates: [
    { id: 'forward', label: '구어 보고 뜻 떠올리기', answer: 'reveal' },
    { id: 'reverse', label: '뜻 보고 구어 떠올리기', optional: true, answer: 'reveal' },
  ],
  view(templateId, ctx) {
    const f = ctx.fields;
    const t = (k: string) => (f[k] ?? '').trim();
    const sayWord = { text: ttsText('word', ctx), lang: LANG };
    const sayExample = t('example') ? [{ text: t('example'), lang: LANG }] : [];
    // 같은 뜻의 짝 (formalForms.ts): 표준어 단어면 구어형, 구어 단어면 표준어 (정답 쪽에만, 앞면에 보이면 답이 새어 나간다)
    const w = t('word').toLowerCase();
    const spoken = SPOKEN_OF[w];
    const written = Object.keys(SPOKEN_OF).filter((k) => SPOKEN_OF[k] === w);
    // 구어 단어: 카드의 표준형 칸이 있으면 그것, 없으면 SPOKEN_OF에서 거꾸로 찾는다.
    // 구어 하나에 표준어가 여럿이면(kamu ← kau·anda, kalo ← jika·bila) 뜻이 조금씩 달라서 붙이지 않는다
    // 짝을 붙이는 구어 단어는 사용역이 구어·자카르타식·속어인 것만 (sekarang·tahu·beli처럼 그 자체로 표준어인 기본 단어는 짝이 아니다)
    const casual = ['구어', '자카르타식', '속어'].includes(t('register'));
    const std = casual && t('standard').toLowerCase() !== w ? t('standard').split('/').map((x) => x.trim()).filter(Boolean).join(' · ') : '';
    const pair = spoken ? { text: spoken, label: '구어' } : std ? { text: std, label: '표준어' } : casual && written.length === 1 ? { text: written[0]!, label: '표준어' } : undefined;
    // 사용역 꼬리표: 구어형 짝이 있는 단어는 표준어라고 보여 준다 (일반 → 표준어, 격식 → 표준어 · 격식)
    const register = spoken ? (t('register') && t('register') !== '일반' ? `표준어 · ${t('register')}` : '표준어') : t('register');
    const forms = [

      t('root') && t('root') !== t('word') ? `어근 ${t('root')}` : '',
      register,
    ].filter(Boolean);
    const tags: Block[] = forms.length ? [{ kind: 'tags', items: forms }] : [];
    const memo: Block[] = t('note') ? [{ kind: 'memo', text: t('note') }] : [];
    const group = synonymGroupOf(t('word'));
    const similar: Block[] = group ? [{ kind: 'similar', title: group.title, current: w, items: group.members, lang: LANG }] : [];
    const en: Block[] = t('en') ? [{ kind: 'gloss', text: t('en'), lang: 'en-US' }] : [];
    // 예문은 따로 큰 상자로 두지 않고 "예문·표현" 목록 맨 위에 같은 모양으로 (사용자 요청 2026-10-24: 화면이 지저분하다)
    const items = [...(t('example') ? [{ text: t('example'), ko: t('exampleKo') }] : []), ...parsePhrases(t('phrases'))];
    const phrases: Block[] = items.length ? [{ kind: 'phrases', items, lang: LANG, highlight: t('word'), label: t('example') ? '예문·표현' : '자주 쓰는 표현' }] : [];
    // 뒷면: 단어 · 뜻 · 영어 뜻 · 꼬리표(위, 가운데) → 예문 · 자주 쓰는 표현 · 메모(아래, 왼쪽)
    const back: Block[] = [{ kind: 'word', text: t('word'), size: 'back', lang: LANG, ...(pair ? { pair } : {}) }, { kind: 'meaning', text: t('meaning'), size: 'back' }, ...en, ...tags, ...phrases, ...similar, ...memo];
    if (templateId === 'reverse') {
      return {
        front: [{ kind: 'meaning', text: t('meaning'), size: 'front' }],
        back,
        tts: { front: [], back: [sayWord, ...sayExample] },
        autoplay: ctx.deck.settings.autoplay === 'off' ? 'off' : 'back',
      };
    }
    // 예문 먼저: 뜻이 문맥에 따라 달라지는 연결어·표현은 단어만 보면 떠올리기 어려워서, 예문 속에서 본다 (덱 설정 "예문 먼저 보기")
    // 연결어(pokoknya, supaya …)는 덱 설정과 상관없이 예문 먼저 (연결어 덱을 구어 덱에 다시 합쳐도 그대로, 2026-10-24)
    if ((ctx.deck.settings.sentenceFirst || isConnector({ typeId: 'id-spoken', fields: f })) && t('example')) {
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
