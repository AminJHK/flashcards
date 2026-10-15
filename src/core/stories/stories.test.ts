import { describe, expect, it } from 'vitest';
import type { Card, Note } from '../model/types';
import type { Scheduler } from '../scheduler/types';
import { nameSet, parseDraft, planStory, revisionPrompt, storyTexts, userPrompt } from './plan';
import { analyzeText, buildLexicon, KNOWN_RECALL, measureCoverage, meetsTarget } from './vocab';

const NOW = 1_000_000_000;
const DAY = 86_400_000;
// 가짜 스케줄러: 카드의 memory.r을 지금 떠올릴 확률로 돌려준다
const sched = { retrievability: (s: { memory?: { r?: number } }) => s.memory?.r ?? 0 } as unknown as Scheduler;

let n = 0;
function word(w: string, f: Partial<Record<string, string>> = {}, state: 'new' | 'learning' | 'review' = 'review', r = 0.95): { note: Note; card: Card } {
  const id = `n${++n}`;
  const note: Note = { id, deckId: 'd', typeId: 'id-spoken', typeVersion: 1, fields: { word: w, meaning: `뜻:${w}`, ...f }, tags: [], createdAt: n, updatedAt: n };
  const card: Card = {
    id: `c${n}`, noteId: id, deckId: 'd', templateId: 'forward', ord: 0, hidden: false, suspended: false, createdAt: n,
    isNew: state === 'new', phase: state, due: NOW + 30 * DAY, lastReviewAt: state === 'new' ? undefined : NOW - DAY, reps: state === 'new' ? 0 : 3, lapses: 0, memory: { r },
  };
  return { note, card };
}
function lexOf(items: { note: Note; card: Card }[]) {
  return buildLexicon(items.map((i) => i.note), items.map((i) => i.card), sched, NOW);
}

describe('어휘 분류 (FSRS 상태)', () => {
  it('복습 단계 + 떠올릴 확률 90% 이상만 아는 단어, 본 적 있으면 배우는 중, 안 본 카드는 덱의 새 단어', () => {
    const lex = lexOf([word('aku'), word('kamu', {}, 'review', KNOWN_RECALL - 0.01), word('saya', {}, 'learning', 0.99), word('dia', {}, 'new')]);
    expect(Object.fromEntries(lex.entries.map((e) => [e.word, e.status]))).toEqual({ aku: 'known', kamu: 'learning', saya: 'learning', dia: 'deckNew' });
  });

  it('표준형·어근·구어 변형·붙는 말(-nya)·반복형을 같은 단어로 본다. 뜻이 바뀌는 접사는 다른 단어', () => {
    const lex = lexOf([word('nggak', { standard: 'tidak' }), word('nyari', { standard: 'mencari', root: 'cari' }), word('anak'), word('udah', { standard: 'sudah' })]);
    const cls = (t: string) => analyzeText(t, lex, new Set()).map((s) => s.cls);
    expect(cls('gak tidak enggak')).toEqual(['known', 'known', 'known']);
    expect(cls('nyari mencari cari')).toEqual(['known', 'known', 'known']);
    expect(cls('anaknya anak-anak')).toEqual(['known', 'known']);
    expect(cls('sudah dah')).toEqual(['known', 'known']);
    expect(cls('mencarikan pencarian')).toEqual(['outside', 'outside']); // -kan, pe-an은 새 단어
  });

  it('여러 단어 표현은 한 덩어리로 보고, 이름은 비율에서 뺀다', () => {
    const lex = lexOf([word('nggak apa-apa', { standard: 'tidak apa-apa' }), word('aku')]);
    const spans = analyzeText('Budi, nggak apa-apa kok.', lex, new Set(['budi']));
    expect(spans.map((s) => [s.text, s.cls])).toEqual([
      ['Budi', 'name'],
      ['nggak apa-apa', 'known'],
      ['kok', 'outside'],
    ]);
    const c = measureCoverage(['Budi, nggak apa-apa kok.'], lex, new Set(['budi']));
    expect(c).toMatchObject({ tokens: 3, known: 2, outside: 1, names: 1, outsideWords: ['kok'] });
  });
});

describe('비율 목표 (단어 등장 횟수 기준)', () => {
  const lex = lexOf([word('aku'), word('mau'), word('makan'), word('nasi', {}, 'new')]);
  it('보통: 덱의 새 단어와 덱 밖 단어를 합쳐 5% 이하여야 한다', () => {
    const text = Array.from({ length: 19 }, () => 'aku').join(' ') + ' nasi';
    const c = measureCoverage([text], lex, new Set());
    expect(c.tokens).toBe(20);
    expect(meetsTarget(c, 0.95, false)).toBe(true); // 1/20 = 5%
    expect(meetsTarget(measureCoverage([text + ' nasi'], lex, new Set()), 0.95, false)).toBe(false);
  });

  it('초반(아는 단어가 적음)에는 덱의 새 단어는 어쩔 수 없을 때 쓸 수 있고, 덱 밖 단어만 허용치로 센다', () => {
    const c = measureCoverage(['aku mau makan nasi nasi nasi'], lex, new Set());
    expect(meetsTarget(c, 0.95, false)).toBe(false);
    expect(meetsTarget(c, 0.95, true)).toBe(true);
    expect(meetsTarget(measureCoverage(['aku mau makan bakso'], lex, new Set()), 0.95, true)).toBe(false);
  });
});

describe('이야기 계획과 요청문', () => {
  it('아는 단어가 300개 미만이면 덱의 다음 단어를 대체용으로 넣고, 새 단어는 덱 순서(빈도순)대로 고른다', () => {
    const items = [...Array.from({ length: 30 }, (_, i) => word(`kata${i}`)), ...Array.from({ length: 20 }, (_, i) => word(`baru${i}`, {}, 'new'))];
    const plan = planStory(lexOf(items), 'normal');
    expect(plan.fallback).toBe(true);
    expect(plan.newWords.map((e) => e.word)).toEqual(['baru0', 'baru1', 'baru2', 'baru3']);
    expect(plan.deckPool[0]!.word).toBe('baru4');
    const p = userPrompt(plan, 'daily life');
    expect(p).toContain('KNOWN WORDS: kata0');
    expect(p).toContain('NEW WORDS: baru0, baru1, baru2, baru3');
    expect(p).toContain('DECK WORDS (only when necessary): baru4');
    expect(p).toContain('At least 95%');
  });

  it('단어가 너무 적으면 만들지 않고 이유를 알려준다', () => {
    expect(() => planStory(lexOf([word('aku')]), 'normal')).toThrow(/너무 적어요/);
  });

  it('다시 요청할 때 실제 비율과 바꿀 단어를 알려준다', () => {
    const plan = planStory(lexOf(Array.from({ length: 50 }, (_, i) => word(`w${i}`))), 'easy');
    const c = measureCoverage(['satu dua bakso'], lexOf([word('satu'), word('dua')]), new Set());
    expect(revisionPrompt(plan, c, ['줄이 너무 적어요'])).toMatch(/67% of 3 .*target is 98%[\s\S]*bakso[\s\S]*줄이 너무 적어요/);
  });
});

type Raw = { blocks: Record<string, unknown>[]; [k: string]: unknown };
const goodRaw = (): Raw => ({
  title: 'Kopi Pagi',
  titleKo: '아침 커피',
  characters: [
    { id: 'a', name: 'Budi' },
    { id: 'b', name: 'Sari' },
  ],
  properNouns: ['Jakarta'],
  blocks: [
    { type: 'line', speaker: 'narrator', text: 'Budi lagi di warung di Jakarta.', ko: '부디는 자카르타의 와룽에 있다.' },
    { type: 'line', speaker: 'a', text: 'Mbak, kopi satu ya.', ko: '커피 하나요.' },
    { type: 'line', speaker: 'b', text: 'Pake gula nggak?', ko: '설탕 넣어요?' },
    { type: 'choice', prompt: '부디는 무엇을 주문했나요?', options: ['커피', '차', '밥'], answer: 0, explain: 'kopi = 커피' },
    { type: 'line', speaker: 'a', text: 'Nggak usah, makasih.', ko: '괜찮아요, 고마워요.' },
    { type: 'gap', sentence: 'Pake ___ nggak?', options: ['gula', 'garam', 'air'], answer: 0, explain: '설탕' },
    { type: 'line', speaker: 'b', text: 'Ini kopinya, Mas.', ko: '커피 여기요.' },
    { type: 'line', speaker: 'a', text: 'Lho, ini teh!', ko: '어, 이거 차잖아!' },
    { type: 'truefalse', statement: '사리는 커피를 줬다.', answerTrue: false, explain: '차를 줬어요' },
    { type: 'match', pairs: [{ id: 'kopi', ko: '커피' }, { id: 'gula', ko: '설탕' }, { id: 'teh', ko: '차' }] },
  ],
  glossary: [{ text: 'teh', ko: '차', en: 'tea' }],
});

describe('AI 결과 검사', () => {
  it('정상 결과는 그대로 받아들인다 (길이만 지적)', () => {
    const r = parseDraft(goodRaw());
    expect(r.fatal).toBe(false);
    expect(r.draft!.blocks.filter((b) => b.kind !== 'line')).toHaveLength(4);
    expect(r.problems).toEqual([expect.stringMatching(/길이가 맞지 않아요/)]); // 예시는 짧다
    expect(storyTexts(r.draft!.blocks)).toHaveLength(6);
    expect([...nameSet(r.draft!.characters, r.draft!.properNouns)]).toEqual(['budi', 'sari', 'jakarta']);
  });

  it('정답 번호가 없거나, 빈칸 문장이 이야기에 없거나, 짝 맞추기 단어가 이야기에 없으면 그 질문을 뺀다', () => {
    const raw = goodRaw();
    raw.blocks[3] = { ...raw.blocks[3]!, answer: 5 };
    raw.blocks[5] = { ...raw.blocks[5]!, sentence: 'Mau ___ apa?' };
    raw.blocks[9] = { type: 'match', pairs: [{ id: 'kopi', ko: '커피' }, { id: 'bakso', ko: '미트볼' }, { id: 'teh', ko: '차' }] };
    const r = parseDraft(raw);
    expect(r.draft!.blocks.filter((b) => b.kind !== 'line')).toHaveLength(1);
    expect(r.fatal).toBe(false); // 질문이 모자라면 고쳐 달라고 할 뿐, 이야기는 쓸 수 있다
    expect(r.problems.join(' ')).toMatch(/질문이 너무 적어요 \(1개\)/);
    expect(r.problems.join(' ')).toMatch(/정답 번호[\s\S]*빈칸 문제의 문장[\s\S]*bakso/);
  });

  it('질문이 이야기보다 앞에 나오거나, 같은 선택지가 겹치면 뺀다', () => {
    const raw = goodRaw();
    raw.blocks.unshift({ type: 'truefalse', statement: '?', answerTrue: true, explain: '' });
    raw.blocks[4] = { ...raw.blocks[4]!, options: ['커피', '커피', '밥'] };
    const r = parseDraft(raw);
    expect(r.problems.join(' ')).toMatch(/첫 줄보다 앞에[\s\S]*|선택지/);
    expect(r.draft!.blocks[0]!.kind).toBe('line');
  });
});

describe('줄 형식 읽기', () => {
  it('줄 형식을 이야기 모양으로 읽고, 앞의 꾸밈·정답 글자·끊긴 마지막 줄을 처리한다', async () => {
    const { parseStoryText, formatStoryText } = await import('./textFormat');
    const text = [
      '```',
      'TITLE: Pagi',
      'TITLE_KO: 아침',
      'CHARACTER: a | Budi',
      '- CHARACTER: b | Sari',
      'PROPER: Jakarta, Bali',
      'LINE: a | Aku mau kopi. | 나 커피 원해.',
      'LINE: Sari pergi. | 사리가 간다.',
      '**CHOICE:** 부디는 뭘 원해? | 차 / 커피 / 밥 | 커피 | kopi = 커피',
      'TF: 사리는 간다 | 맞아요 | 설명',
      'GAP: Aku mau ___. | teh / kopi / nasi | 2 | 커피',
      'MATCH: kopi = 커피 / mau = 원하다 / aku = 나',
      'GLOSS: pergi | 가다 | to go | ',
      'LINE: a | Ini sete',
    ].join('\n');
    const { raw, complete } = parseStoryText(text);
    expect(complete).toBe(false);
    expect(raw).toMatchObject({ title: 'Pagi', titleKo: '아침', properNouns: ['Jakarta', 'Bali'], glossary: [{ text: 'pergi', ko: '가다', en: 'to go' }] });
    expect(raw.characters.map((c) => c.name)).toEqual(['Budi', 'Sari']);
    expect(raw.blocks.map((b) => b.type)).toEqual(['line', 'line', 'choice', 'truefalse', 'gap', 'match']); // 끊긴 마지막 줄은 버린다
    expect(raw.blocks[1]).toMatchObject({ speaker: 'narrator', text: 'Sari pergi.', ko: '사리가 간다.' });
    expect(raw.blocks[2]).toMatchObject({ answer: 1, options: ['차', '커피', '밥'] });
    expect(raw.blocks[3]).toMatchObject({ answerTrue: true });
    expect(raw.blocks[4]).toMatchObject({ answer: 1 });
    expect((raw.blocks[5]!.pairs as unknown[]).length).toBe(3);
    // 다시 써서 읽으면 같은 이야기
    const again = parseStoryText(formatStoryText(raw));
    expect(again.complete).toBe(true);
    expect(again.raw.blocks).toEqual(raw.blocks);
  });
});
