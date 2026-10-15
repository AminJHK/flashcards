import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, Note } from '../../core/model/types';
import type { Scheduler } from '../../core/scheduler/types';
import { planStory } from '../../core/stories/plan';
import { buildLexicon } from '../../core/stories/vocab';
import { FlashcardsDB } from '../storage/db';
import { deleteStory, getProgress, listStories, restartStory, saveProgress, saveStory } from '../storage/stories';
import { createStory, MAX_ATTEMPTS } from './story';

afterEach(() => vi.unstubAllGlobals());

const KNOWN = ['aku', 'kamu', 'mau', 'makan', 'nasi', 'di', 'mana', 'enak', 'banget', 'ya', 'nggak', 'ada', 'ini', 'itu', 'kopi', 'pagi'];
const sched = { retrievability: () => 0.97 } as unknown as Scheduler;
const notes: Note[] = [];
const cards: Card[] = [];
[...KNOWN, ...Array.from({ length: 40 }, (_, i) => `kata${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${'xyz'[Math.floor(i / 26)]}`)].forEach((w, i) => {
  notes.push({ id: `n${i}`, deckId: 'd', typeId: 'id-spoken', typeVersion: 1, fields: { word: w, meaning: `뜻 ${w}` }, tags: [], createdAt: i, updatedAt: i });
  cards.push({ id: `c${i}`, noteId: `n${i}`, deckId: 'd', templateId: 'forward', ord: 0, hidden: false, suspended: false, createdAt: i, isNew: false, phase: 'review', due: 9e15, lastReviewAt: 0, reps: 3, lapses: 0 });
});
const lex = buildLexicon(notes, cards, sched, 1e12);

/** 아는 단어로만 된 13줄 (130단어) + 덤으로 넣을 낯선 단어 */
function story(extra: string[]) {
  const lines = Array.from({ length: 13 }, (_, i) => ({ type: 'line', speaker: i % 2 ? 'a' : 'b', text: `${KNOWN.slice(0, 10).join(' ')}${i === 0 && extra.length ? ' ' + extra.join(' ') : ''}.`, ko: '번역' }));
  return {
    title: 'Pagi',
    titleKo: '아침',
    characters: [
      { id: 'a', name: 'Budi' },
      { id: 'b', name: 'Sari' },
    ],
    blocks: [
      lines[0], lines[1], lines[2],
      { type: 'choice', prompt: '?', options: ['가', '나', '다'], answer: 1, explain: '설명' },
      ...lines.slice(3, 8),
      { type: 'truefalse', statement: '맞나?', answerTrue: true, explain: '네' },
      ...lines.slice(8),
      { type: 'match', pairs: [{ id: 'aku', ko: '나' }, { id: 'kamu', ko: '너' }, { id: 'makan', ko: '먹다' }] },
    ],
    glossary: [],
  };
}
const reply = (body: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), { status: 200 });

describe('AI 이야기 만들기', () => {
  it('모르는 단어가 너무 많으면 그 단어를 알려주며 다시 써 달라고 하고, 맞는 결과를 저장용 이야기로 만든다', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply(story(['bakso', 'sate', 'kerupuk', 'es', 'teh', 'jeruk', 'soto', 'mie']))).mockResolvedValueOnce(reply(story(['bakso'])));
    vi.stubGlobal('fetch', f);
    const steps: string[] = [];
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'food', key: 'K', stream: false, onStep: (x) => steps.push(`${x.attempt}:${x.stage}`) });
    expect(f).toHaveBeenCalledTimes(2);
    const second = JSON.parse(f.mock.calls[1]![1].body);
    expect(second.generationConfig.responseMimeType).toBe('application/json');
    expect(second.contents).toHaveLength(3); // 요청 → 첫 답 → 고쳐 달라는 요청
    expect(second.contents[2].parts[0].text).toMatch(/Replace these words[^\n]*bakso, sate/);
    expect(steps).toEqual(['1:writing', '1:checking', '2:revising', '2:checking']);
    expect(s.attempts).toBe(2);
    expect(s.warning).toBeUndefined();
    expect(s.coverage).toMatchObject({ tokens: 131, outside: 1, names: 0 });
    expect(s.coverage.familiar).toBeGreaterThan(0.99);
    expect(s.topic).toBe('food');
    expect(s.snapshot.known).toBe(56);
    // 키는 요청 헤더에만, 단어 목록은 본문에
    expect(f.mock.calls[0]![1].headers['x-goog-api-key']).toBe('K');
    expect(JSON.parse(f.mock.calls[0]![1].body).contents[0].parts[0].text).toContain('KNOWN WORDS: aku, kamu');
  });

  it(`끝까지 목표를 못 맞추면 ${MAX_ATTEMPTS}번에서 멈추고, 가장 나은 결과를 이유와 함께 돌려준다`, async () => {
    const f = vi.fn().mockImplementation(async () => reply(story(['satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'])));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'easy'), topicKey: 'free', key: 'K', stream: false });
    expect(f).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(s.warning).toMatch(/목표는 아는 단어 98%였는데 실제로는 93%예요/);
  });

  it('쓸 수 있는 결과가 한 번도 없으면 오류', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply({ title: 'x', characters: [], blocks: [], glossary: [] })));
    await expect(createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false })).rejects.toThrow(/만들지 못했어요/);
  });
});

describe('서버가 붐빌 때 (503)', () => {
  const busy = () => new Response(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }), { status: 503 });
  const plan = () => planStory(lex, 'normal');

  it('같은 모델에 기다렸다 다시 시도해서 성공하면 그 결과를 쓴다', async () => {
    const f = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(reply(story([])));
    vi.stubGlobal('fetch', f);
    const waits: number[] = [];
    const s = await createStory({ lex, plan: plan(), topicKey: 'free', key: 'K', stream: false, sleep: async (ms) => void waits.push(ms) });
    expect(f).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2000, 6000]);
    expect(f.mock.calls.every((c) => String(c[0]).includes('gemini-flash-latest:'))).toBe(true);
    expect(s.model).toBe('gemini-flash-latest');
  });

  it('계속 붐비면 다음 모델(flash-lite)로 넘어간다', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => (String(url).includes('flash-lite') ? reply(story([])) : busy()));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: plan(), topicKey: 'free', key: 'K', stream: false, sleep: async () => {} });
    expect(f).toHaveBeenCalledTimes(4); // 첫 모델 3번 + lite 1번
    expect(s.model).toBe('gemini-flash-lite-latest');
  });

  it('모든 모델이 붐비면 쉬운 한국어로 알려준다 (영어 원문을 그대로 보이지 않는다)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => busy()));
    await expect(createStory({ lex, plan: plan(), topicKey: 'free', key: 'K', stream: false, sleep: async () => {} })).rejects.toThrow('Gemini 서버가 지금 붐벼요. 잠시 뒤에 다시 시도해요');
  });
});

const sse = (chunks: string[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: c }] } }] })}\r\n\r\n`).join(''), { status: 200 });

describe('조금씩 받기 (진행률)', () => {
  it('받은 글자 수로 진행률을 알려 주고, 조각을 이어 붙여 이야기를 만든다', async () => {
    const text = JSON.stringify(story([]));
    const cut = [text.slice(0, 1500), text.slice(1500, 3000), text.slice(3000)];
    const f = vi.fn().mockResolvedValue(sse(cut));
    vi.stubGlobal('fetch', f);
    const pcts: number[] = [];
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', onStep: (x) => x.stage === 'writing' && x.pct !== undefined && pcts.push(Math.round(x.pct * 100)) });
    expect(String(f.mock.calls[0]![0])).toContain('models/gemini-flash-latest:streamGenerateContent?alt=sse');
    expect(JSON.parse(f.mock.calls[0]![1].body).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(pcts.length).toBeGreaterThanOrEqual(2);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b)); // 줄어들지 않는다
    expect(Math.max(...pcts)).toBeLessThanOrEqual(95);
    expect(s.title).toBe('Pagi');
  });

  it('모델이 thinking 설정을 못 받으면 그 설정만 빼고 같은 모델로 다시 한다', async () => {
    const err = new Response(JSON.stringify({ error: { message: 'Thinking is not supported by this model' } }), { status: 400 });
    const f = vi.fn().mockResolvedValueOnce(err).mockResolvedValueOnce(sse([JSON.stringify(story([]))]));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1]![1].body).generationConfig.thinkingConfig).toBeUndefined();
    expect(s.model).toBe('gemini-flash-latest');
  });
});

describe('이야기 저장', () => {
  it('저장·목록·읽은 위치·처음부터·삭제 (카드와 복습 기록 표는 건드리지 않는다)', async () => {
    const d = new FlashcardsDB('stories-test');
    await d.open();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(story([]))));
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false, now: 5 });
    const later = { ...s, id: 'later', createdAt: 9 };
    await saveStory(s, d);
    await saveStory(later, d);
    expect((await listStories(d)).map((x) => x.id)).toEqual(['later', s.id]);
    expect(await getProgress(s.id, d)).toMatchObject({ position: 1, answers: {}, readCount: 0 });
    await saveProgress({ storyId: s.id, position: 7, answers: { 3: true }, readCount: 1, completedAt: 123, updatedAt: 0 }, d);
    await restartStory(s.id, d);
    expect(await getProgress(s.id, d)).toMatchObject({ position: 1, answers: {}, readCount: 1, completedAt: undefined });
    await deleteStory(s.id, d);
    expect((await listStories(d)).map((x) => x.id)).toEqual(['later']);
    expect(await d.storyProgress.count()).toBe(0);
    expect(await d.reviewLogs.count()).toBe(0);
  });
});
