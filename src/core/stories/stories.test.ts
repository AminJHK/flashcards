import { describe, expect, it } from 'vitest';
import type { Card, Note } from '../model/types';
import type { Scheduler } from '../scheduler/types';
import { nameSet, parseDraft, planStory, revisionPrompt, storyTexts, usedWords, userPrompt } from './plan';
import { parseStoryText } from './textFormat';
import { analyzeText, buildLexicon, isExtraWord, KNOWN_RECALL, lookupForm, measureCoverage, meetsTarget } from './vocab';

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
function lexOf(items: { note: Note; card: Card }[], mine: string[] = []) {
  return buildLexicon(items.map((i) => i.note), items.map((i) => i.card), sched, NOW, mine);
}

describe('어휘 분류 (FSRS 상태)', () => {
  it('기본 단어는 덱에 없거나 아직 안 배웠으면 아는 단어로 치고, 배우기 시작했으면 덱 기록을 따른다. "이미 알아요" 단어도 아는 단어', () => {
    const lex = lexOf([word('ini', {}, 'new'), word('itu', {}, 'learning', 0.5), word('bakso', {}, 'new')], ['Sate']);
    const of = (w: string) => lookupForm(lex, w);
    expect(of('ini')).toMatchObject({ status: 'known', kind: 'basic' }); // 덱에 있지만 아직 안 배움
    expect(of('itu')).toMatchObject({ status: 'learning' }); // 배우는 중 → 덱 기록
    expect(of('itu')!.kind).toBeUndefined();
    expect(of('dari')).toMatchObject({ status: 'known', kind: 'basic', noteId: '' }); // 덱에 없음
    expect(of('sate')).toMatchObject({ status: 'known', kind: 'mine' });
    expect(of('bakso')).toMatchObject({ status: 'deckNew' });
  });

  it('복습 단계 + 떠올릴 확률 90% 이상만 아는 단어, 본 적 있으면 배우는 중, 안 본 카드는 덱의 새 단어', () => {
    const lex = lexOf([word('aku'), word('kamu', {}, 'review', KNOWN_RECALL - 0.01), word('saya', {}, 'learning', 0.99), word('bakso', {}, 'new')]);
    expect(Object.fromEntries(lex.entries.filter((e) => !isExtraWord(e)).map((e) => [e.word, e.status]))).toEqual({ aku: 'known', kamu: 'learning', saya: 'learning', bakso: 'deckNew' });
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
    // 이번 이야기에서 소개하라고 고른 새 단어는 목표 비율에서 빼고 센다 (넣으라고 해 놓고 세면 맞출 수 없다)
    const withNew = measureCoverage(['aku mau makan nasi nasi nasi'], lex, new Set(), new Set(['nasi']));
    expect(withNew.introduced).toBe(3);
    expect(withNew.deckNewWords).toEqual([]);
    expect(meetsTarget(withNew, 0.95, false)).toBe(true);
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
    expect(p).toMatch(/KNOWN WORDS: .*kata0/);
    expect(p).toContain('NEW WORDS: baru0, baru1, baru2, baru3');
    expect(p).toContain('DECK WORDS (only when necessary): baru4');
    expect(p).toContain('At least 95%');
  });

  it('새 단어는 최근 이야기에서 소개한 것을 건너뛰고, 어려운 단어는 FOCUS로, 상황 씨앗은 최근 것을 피한다', () => {
    const hard = (w: string) => {
      const x = word(w, {}, 'learning', 0.5);
      return { ...x, card: { ...x.card, lapses: 5 } };
    };
    const items = [
      ...Array.from({ length: 30 }, (_, i) => word(`kata${i}`)),
      ...Array.from({ length: 10 }, (_, i) => word(`lemah${i}`, {}, 'learning', 0.6)),
      hard('susah0'),
      hard('susah1'),
      ...Array.from({ length: 20 }, (_, i) => word(`baru${i}`, {}, 'new')),
    ];
    const lex = lexOf(items);
    expect(lex.entries.find((e) => e.word === 'susah0')!.hard).toBe(true);
    const rng = () => 0.3;
    const plan = planStory(lex, 'normal', { newWords: ['baru0', 'baru1'], reinforce: [], seeds: [] }, 'food', rng);
    expect(plan.newWords.map((e) => e.word)).toEqual(['baru2', 'baru3', 'baru4', 'baru5']);
    expect(plan.focus.map((e) => e.word).sort()).toEqual(['susah0', 'susah1']);
    expect(plan.reinforce.every((e) => e.word.startsWith('lemah'))).toBe(true);
    expect(plan.reinforce.length).toBeLessThanOrEqual(6);
    expect(plan.seed).toBeDefined();
    expect(plan.seed!.topics.length === 0 || plan.seed!.topics.includes('food')).toBe(true);
    const again = planStory(lex, 'normal', { newWords: [], reinforce: [], seeds: [plan.seed!.id] }, 'food', rng);
    expect(again.seed!.id).not.toBe(plan.seed!.id);
    const p = userPrompt(plan, 'food');
    expect(p).toContain('FOCUS WORDS: ');
    // 단어 넣기보다 이야기가 먼저: 몇 번 넣으라는 조건이 없고, 줄거리를 먼저 짠다
    expect(p).not.toMatch(/at least twice|3 or more|every FOCUS WORD/);
    expect(p).toContain('There is no minimum');
    expect(p).toContain('MOST IMPORTANT: a natural, fun and logically consistent story');
    expect(p).toContain('PLAN: <English planning note>');
    expect(p).toContain('Never leave the key thing of the plot unnamed');
    expect(p).toContain(`Situation (start from this idea`);
    expect(p).toContain(plan.seed!.en);
  });

  it('비슷한 말 묶음의 구어(jadi / makanya …)는 상황에 맞게 골고루, 글말은 내레이션에서 조금씩 쓰게 한다', () => {
    const items = [...Array.from({ length: 40 }, (_, i) => word(`kata${i}`)), word('jadi'), word('makanya'), word('sehingga'), word('tapi'), word('padahal')];
    const p = userPrompt(planStory(lexOf(items), 'normal'), 'food');
    expect(p).toContain('SIMILAR WORDS: jadi / makanya; tapi / padahal');
    expect(p).toContain('vary them across the story');
    expect(p).toContain('Do use a few WRITTEN FORMS in narration');
    expect(p).toMatch(/WRITTEN FORMS \(known[^\n]*sehingga→jadi/);
    expect(p.split('\n').find((l) => l.startsWith('SIMILAR WORDS'))).not.toContain('sehingga');
  });

  it('뜻이 거의 같은 구어(selesai = kelar)는 둘 다 알면 골고루 섞어 쓰라고 한다', () => {
    const items = [...Array.from({ length: 40 }, (_, i) => word(`kata${i}`)), word('selesai'), word('kelar'), word('tanya')];
    const p = userPrompt(planStory(lexOf(items), 'normal'), 'food');
    expect(p).toContain('SAME-MEANING WORDS: selesai = kelar');
    expect(p).not.toContain('tanya = nanya'); // nanya는 모르는 말
    expect(p).toContain('Mix them');
  });

  it('표준어·글말 단어(memberikan, jika …)는 따로 적어서, 대화에서는 구어형을 쓰라고 한다', () => {
    const items = [...Array.from({ length: 40 }, (_, i) => word(`kata${i}`)), word('memberikan'), word('jika'), word('kasih')];
    const lex = lexOf(items);
    expect(lex.entries.find((e) => e.word === 'memberikan')!.spoken).toBe('kasih');
    const p = userPrompt(planStory(lex, 'normal'), 'food');
    const known = p.split('\n').find((l) => l.startsWith('KNOWN WORDS: '))!;
    expect(known).toContain('kasih');
    expect(known).not.toMatch(/\bmemberikan\b|\bjika\b/);
    expect(p).toMatch(/WRITTEN FORMS \(known; narration only → spoken form for dialogue\): .*memberikan→kasih/);
    expect(p).toContain('jika→kalo');
    expect(p).toContain('dialogue lines (LINE: <character>) use spoken forms only');
  });

  it('기록에는 고른 단어 중 이야기에 실제로 나온 것만 남는다 (빠진 단어는 다음 이야기 후보)', () => {
    const lex = lexOf([word('makan'), word('minum'), word('tidur')]);
    const [makan, minum, tidur] = ['makan', 'minum', 'tidur'].map((w) => lex.entries.find((e) => e.word === w)!);
    const blocks = [
      { kind: 'line' as const, speaker: 'a', text: 'Aku makannya nanti.', ko: '' },
      { kind: 'line' as const, speaker: 'b', text: 'Tidur dulu!', ko: '' },
    ];
    expect(usedWords([makan!, minum!, tidur!], blocks, lex, new Set())).toEqual(['makan', 'tidur']);
  });

  it('줄거리(PLAN) 줄은 이야기에 들어가지 않는다', () => {
    const { raw } = parseStoryText('PLAN: Budi wants coffee; it is morning.\nTITLE: Kopi\nLINE: a | Mau kopi? | 커피?\nEND');
    expect(raw.title).toBe('Kopi');
    expect(raw.blocks).toHaveLength(1);
  });

  it('배운 단어가 많아도(600개) 모두 아는 단어 목록으로 보낸다', () => {
    const lex = lexOf(Array.from({ length: 600 }, (_, i) => word(`kata${i}`)));
    const plan = planStory(lex, 'normal');
    expect(plan.familiar.filter((e) => !isExtraWord(e))).toHaveLength(600);
    expect(userPrompt(plan, 'food')).toContain('kata599');
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

describe('질문·말하는 사람이 잘못 온 줄 (사용자 화면 2026-10-26)', () => {
  it('LINE으로 온 질문은 질문으로 읽고, 대사가 narrator로 오거나 모르는 id면 다시 쓰게 한다', async () => {
    const { parseStoryText } = await import('./textFormat');
    const { raw } = parseStoryText(
      [
        'TITLE: Bis',
        'CHARACTER: a | Ani',
        'CHARACTER: b | Budi',
        'LINE: narrator | Ani naik bis. | 아니가 버스를 탄다.',
        'LINE: 아니는 늦지 않았다 | false | 늦었다',
        'LINE: 왜 졸려? | Makan banyak / Lembur / Bangun siang | 2 | 야근',
        'LINE: narrator | Aku ___ bis. | naik / turun / makan | 1 | 탄다',
        'LINE: narrator | Mbak tenang dulu deh. | 진정해요.',
        'LINE: Budi | Iya. | 네.',
        'LINE: sopir | Ayo turun. | 내려요.',
        'END',
      ].join('\n'),
    );
    expect(raw.blocks.map((b) => b.type)).toEqual(['line', 'truefalse', 'choice', 'gap', 'line', 'line', 'line']);
    expect(raw.blocks[1]).toMatchObject({ statement: '아니는 늦지 않았다', answerTrue: false });
    expect(raw.blocks[2]).toMatchObject({ prompt: '왜 졸려?', answer: 1 });
    expect(raw.blocks[3]).toMatchObject({ sentence: 'Aku ___ bis.', answer: 0 });
    const r = parseDraft(raw);
    const lines = r.draft!.blocks.filter((b) => b.kind === 'line');
    expect(lines.map((b) => (b as { speaker: string }).speaker)).toEqual(['narrator', 'narrator', 'b', 'narrator']);
    expect(r.blocking.join(' ')).toContain('sopir');
    expect(r.blocking.join(' ')).toContain('Mbak tenang dulu deh.');
  });

  it('내레이션처럼 보이는 대사: 입말 조사·나/너·물음표', async () => {
    const { looksLikeDialogue } = await import('./plan');
    expect(looksLikeDialogue('Soalnya bos aku bakal marah.')).toBe(true);
    expect(looksLikeDialogue('Wah, untung ketemu Mas!')).toBe(true);
    expect(looksLikeDialogue('Ani mulai nyadar kalo bis ini belok ke arah barat.')).toBe(false);
    expect(looksLikeDialogue('Bisnya belok ke kanan.')).toBe(false);
  });
});

describe('의미 단위', () => {
  it('묶음을 읽고, 문장 안에서 앞에서부터 차례로 겹치지 않게 찾는다 (낱말 중간은 안 맞춘다)', async () => {
    const { parseChunks, chunkSegments } = await import('./chunks');
    const chunks = parseChunks('Budi nunggu = 부디가 기다린다 / Sita = 시타를 / di stasiun kereta = 기차역에서 / ta = 없음');
    expect(chunks.map((c) => c.text)).toEqual(['Budi nunggu', 'Sita', 'di stasiun kereta', 'ta']);
    const text = 'Budi nunggu Sita di stasiun kereta.';
    const segs = chunkSegments(text, chunks);
    expect(segs.map((g) => text.slice(g.start, g.end))).toEqual(['Budi nunggu', 'Sita', 'di stasiun kereta']); // "ta"는 낱말 중간뿐이라 없음
    expect(segs[2]!.ko).toBe('기차역에서');
    expect(parseChunks('뜻 없음')).toEqual([]);
  });

  it('줄 형식의 4번째 칸으로 받고, 문장에 실제로 있는 묶음만 이야기에 남긴다', async () => {
    const { parseStoryText, formatStoryText } = await import('./textFormat');
    const { raw } = parseStoryText('LINE: a | Aku mau kopi. | 나 커피 원해. | Aku = 나 / mau kopi = 커피를 원해\nLINE: b | Ya. | 응.\nEND');
    expect(raw.blocks[0]).toMatchObject({ ko: '나 커피 원해.', chunks: [{ text: 'Aku', ko: '나' }, { text: 'mau kopi', ko: '커피를 원해' }] });
    expect(raw.blocks[1]).toMatchObject({ ko: '응.', chunks: [] });
    expect(parseStoryText(formatStoryText(raw)).raw.blocks).toEqual(raw.blocks);
    const base = goodRaw();
    base.blocks[0] = { ...base.blocks[0]!, chunks: [{ text: 'tidak ada', ko: '없다' }] };
    const r = parseDraft(base);
    const first = r.draft!.blocks[0] as { chunks?: unknown };
    expect(first.chunks).toBeUndefined(); // 문장에 없는 묶음뿐이면 버린다
  });
});

describe('어조 말 (id-particle)', () => {
  /** 어조 말 예문 노트 하나 */
  const ex = (w: string, state: 'new' | 'learning' | 'review' = 'review', r = 0.95) => {
    const x = word(w, { example: `Contoh ${w} ${n}` }, state, r);
    x.note.typeId = 'id-particle';
    return x;
  };
  const particleLex = (items: { note: Note; card: Card }[]) => lexOf([word('aku'), word('mau'), ...items]);

  it('예문마다 노트가 있어도 말 하나로 묶고, 안 본 말은 deckNew, 예문 둘 이상이 모두 단단하면 known', () => {
    const lex = particleLex([ex('sih'), ex('sih'), ex('sih'), ex('dong'), ex('dong', 'new'), ex('kok', 'new'), ex('kok', 'new')]);
    const ps = lex.entries.filter((e) => e.kind === 'particle');
    expect(ps.map((p) => [p.word, p.status])).toEqual([['sih', 'known'], ['dong', 'learning'], ['kok', 'deckNew']]);
    expect(lex.entries.filter((e) => e.word === 'sih')).toHaveLength(1);
  });

  it('본 예문이 하나뿐이거나 하나라도 덜 외웠으면 learning', () => {
    const lex = particleLex([ex('sih'), ex('sih', 'new'), ex('deh', 'review', 0.8), ex('deh', 'review', 0.99)]);
    expect(Object.fromEntries(lex.entries.filter((e) => e.kind === 'particle').map((p) => [p.word, p.status]))).toEqual({ sih: 'learning', deh: 'learning' });
  });

  it('어조 말이 이야기에 나오면 알려진 말로 읽히고 뜻(느낌)이 나온다. 안 배운 말도 비율에서는 아는 말로 센다', () => {
    const lex = particleLex([ex('sih'), ex('sih'), ex('kok', 'new')]);
    const spans = analyzeText('Aku mau kok sih', lex, new Set());
    expect(spans.map((x) => [x.text, x.cls])).toEqual([['Aku', 'known'], ['mau', 'known'], ['kok', 'deckNew'], ['sih', 'known']]);
    const c = measureCoverage(['Aku mau kok sih'], lex, new Set());
    expect(c).toMatchObject({ tokens: 4, known: 4, deckNew: 0 });
    expect(spans[2]!.entry?.meaning).toBe('뜻:kok');
  });

  it('이야기 계획: 어조 말은 단어 목록과 따로, 기억이 약한 순으로 쓰게 하고 안 본 말 하나는 소개한다', () => {
    const base = Array.from({ length: 45 }, (_, i) => word(`kata${i}`));
    const strong = [ex('dong'), ex('dong')];
    const weak = [ex('sih', 'review', 0.7), ex('sih', 'review', 0.75)];
    const fresh = [ex('kok', 'new'), ex('kok', 'new'), ex('nah', 'new')];
    const lex = lexOf([...base, ...strong, ...weak, ...fresh]);
    const plan = planStory(lex, 'normal');
    expect(plan.particles.map((p) => p.word)).toEqual(['sih', 'dong']);
    expect(plan.newParticle?.word).toBe('kok');
    expect(plan.familiar.some((e) => e.kind === 'particle')).toBe(false);
    expect(plan.newWords.some((e) => e.kind === 'particle')).toBe(false);
    const prompt = userPrompt(plan, 'daily life');
    expect(prompt).toMatch(/PARTICLE WORDS \(known, weakest first\): sih, dong/);
    expect(prompt).toMatch(/NEW PARTICLE: kok/);
    expect(prompt).toMatch(/Use them naturally in the dialogue lines only/);
    expect(prompt).not.toMatch(/KNOWN WORDS:.*\bsih\b/);
  });

  it('어조 말 카드가 없으면 프롬프트에 어조 말 줄이 없다', () => {
    const lex = lexOf(Array.from({ length: 45 }, (_, i) => word(`kata${i}`)));
    const prompt = userPrompt(planStory(lex, 'normal'), 'food');
    expect(prompt).not.toMatch(/PARTICLE/);
  });
});
