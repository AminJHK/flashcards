import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, Note } from '../../core/model/types';
import type { Scheduler } from '../../core/scheduler/types';
import { planStory } from '../../core/stories/plan';
import { formatStoryText } from '../../core/stories/textFormat';
import { buildLexicon } from '../../core/stories/vocab';
import { FlashcardsDB } from '../storage/db';
import { deleteStory, getProgress, listStories, restartStory, saveProgress, saveStory } from '../storage/stories';
import { createStory, looksLooping, MAX_REVISIONS, resetThinkingMemory, STREAM_TIMING } from './story';

afterEach(() => {
  vi.unstubAllGlobals();
  resetThinkingMemory();
});

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
const reply = (body: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: formatStoryText(body as Parameters<typeof formatStoryText>[0]) }] } }] }), { status: 200 });

describe('AI 이야기 만들기', () => {
  it('모르는 단어가 너무 많으면 그 단어를 알려주며 다시 써 달라고 하고, 맞는 결과를 저장용 이야기로 만든다', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply(story(['bakso', 'sate', 'kerupuk', 'es', 'teh', 'jeruk', 'soto', 'mie', 'gado', 'rujak', 'pecel', 'lontong']))).mockResolvedValueOnce(reply(story(['bakso'])));
    vi.stubGlobal('fetch', f);
    const steps: string[] = [];
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'food', key: 'K', stream: false, onStep: (x) => steps.push(`${x.attempt}:${x.stage}`) });
    expect(f).toHaveBeenCalledTimes(2);
    const second = JSON.parse(f.mock.calls[1]![1].body);
    expect(second.generationConfig.responseSchema).toBeUndefined(); // 구조화 출력은 되풀이에 빠져서 쓰지 않는다
    expect(second.contents[0].parts[0].text).toContain('LINE: a | <Indonesian> | <Korean translation>');
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

  it(`목표를 못 맞추면 고쳐 쓰기는 ${MAX_REVISIONS}번만 하고, 가장 나은 결과를 이유와 함께 돌려준다`, async () => {
    const f = vi.fn().mockImplementation(async () => reply(story(['satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'])));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'easy'), topicKey: 'free', key: 'K', stream: false });
    expect(f).toHaveBeenCalledTimes(1 + MAX_REVISIONS);
    expect(s.warning).toMatch(/목표는 아는 단어 98%였는데 실제로는 93%예요/);
  });

  it('쓸 수 있는 결과가 한 번도 없으면, 시도마다 왜 못 썼는지 담아 오류', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply({ title: 'x', characters: [], blocks: [], glossary: [] })));
    await expect(createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false })).rejects.toThrow(
      /쓸 수 있는 이야기가 오지 않았어요 \(1번째: 줄이 너무 적어요 \(0줄\).* \/ 2번째: .* \/ 3번째: /,
    );
  });

  it('고쳐 쓰다가 연결이 끊겨도, 앞에서 받은 이야기는 버리지 않는다', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply(story(['bakso', 'sate', 'kerupuk', 'es', 'teh', 'jeruk', 'soto', 'mie', 'gado', 'rujak', 'pecel', 'lontong']))).mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false, sleep: async () => {} });
    expect(s.title).toBe('Pagi');
    expect(s.attempts).toBe(1);
    expect(s.warning).toMatch(/목표는 아는 단어 95%/);
  });

  it('목표에 아주 가까우면(2% 안) 다시 쓰지 않고 그대로 쓴다 (경고만)', async () => {
    const f = vi.fn().mockResolvedValue(reply(story(['bakso', 'sate', 'kerupuk', 'es', 'teh', 'jeruk', 'soto', 'mie']))); // 94%, 목표 95%
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.warning).toMatch(/목표는 아는 단어 95%였는데 실제로는 94%예요/);
  });

  it('질문 하나가 틀린 정도는 그 질문만 빼고, 이야기를 다시 쓰게 하지 않는다', async () => {
    const body = story([]);
    body.blocks.splice(4, 0, { type: 'choice', prompt: '?', options: ['가', '나'], answer: 5, explain: '' } as never);
    const f = vi.fn().mockResolvedValue(reply(body));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.warning).toBeUndefined();
    expect(s.blocks.filter((b) => b.kind !== 'line')).toHaveLength(3);
  });

  it('temperature는 보내지 않는다 (Gemini 3은 낮추면 같은 말을 반복할 수 있다)', async () => {
    const f = vi.fn().mockResolvedValue(reply(story([])));
    vi.stubGlobal('fetch', f);
    await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', stream: false });
    expect(JSON.parse(f.mock.calls[0]![1].body).generationConfig.temperature).toBeUndefined();
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

  it('붐빌 때 서버가 연결을 끊어도(Failed to fetch) 바로 포기하지 않고 기다렸다 다시, 그다음 모델로 넘어간다', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('flash-lite')) return reply(story([]));
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', f);
    const waits: number[] = [];
    const s = await createStory({ lex, plan: plan(), topicKey: 'free', key: 'K', stream: false, sleep: async (ms) => void waits.push(ms) });
    expect(f).toHaveBeenCalledTimes(4); // 첫 모델 3번 + lite 1번
    expect(waits).toEqual([2000, 6000]);
    expect(s.model).toBe('gemini-flash-lite-latest');
  });

  it('인터넷은 되는데 연결만 계속 끊기면 "인터넷 없음" 대신 서버 문제라고 알려 준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createStory({ lex, plan: plan(), topicKey: 'free', key: 'K', stream: false, sleep: async () => {} })).rejects.toThrow(/Gemini 서버와 연결이 자꾸 끊겨요/);
  });

  it('정말 인터넷이 끊겼으면 기다리지 않고 바로 알려 준다', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    await expect(createStory({ lex, plan: plan(), topicKey: 'free', key: 'K', stream: false, sleep: async () => {} })).rejects.toThrow('인터넷에 연결되어 있지 않아요');
    expect(f).toHaveBeenCalledTimes(1);
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
    const text = formatStoryText(story([]));
    const third = Math.floor(text.length / 3);
    const cut = [text.slice(0, third), text.slice(third, 2 * third), text.slice(2 * third)];
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

  it('400(잘못된 요청)이면 생각 설정을 thinkingBudget → minimal → low → 없음 순서로 바꿔 같은 모델로 다시 하고, 된 방식을 기억한다', async () => {
    const bad = () => new Response(JSON.stringify({ error: { message: 'Request contains an invalid argument.' } }), { status: 400 });
    const f = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(bad()).mockResolvedValueOnce(bad()).mockImplementation(async () => sse([formatStoryText(story([]))]));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} });
    const cfg = (i: number) => JSON.parse(f.mock.calls[i]![1].body).generationConfig.thinkingConfig;
    expect(f).toHaveBeenCalledTimes(4);
    expect([cfg(0), cfg(1), cfg(2), cfg(3)]).toEqual([{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, undefined]);
    expect(f.mock.calls.every((c) => String(c[0]).includes('gemini-flash-latest:'))).toBe(true);
    expect(s.model).toBe('gemini-flash-latest');
    // 다음 이야기는 처음부터 된 방식으로 (400을 다시 겪지 않는다)
    await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} });
    expect(f).toHaveBeenCalledTimes(5);
    expect(cfg(4)).toBeUndefined();
  });

  it('생각 설정을 다 빼도 400이면 Google의 이유를 보여 준다', async () => {
    const bad = () => new Response(JSON.stringify({ error: { message: 'Request contains an invalid argument.' } }), { status: 400 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => bad()));
    await expect(createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} })).rejects.toThrow(/400: Request contains an invalid argument/);
  });
});

/** SSE 조각들을 보내고, close=false면 연결을 닫지 않는다 (실제로 멈춰 있던 상황) */
function sseStream(chunks: string[], close: boolean) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ch }] } }] })}\r\n\r\n`));
        if (close) c.close();
      },
    }),
    { status: 200 },
  );
}

describe('조금씩 받다가 멈출 때', () => {
  it('이야기가 끝까지 왔는데 연결이 안 닫혀도, 기다리지 않고 바로 쓴다', async () => {
    const text = formatStoryText(story([]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseStream([text.slice(0, 2000), text.slice(2000)], false)));
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} });
    expect(s.title).toBe('Pagi');
  });

  it('같은 말을 되풀이하기 시작하면 바로 끊고, 그 답은 버리고 짧게 다시 요청한다', async () => {
    const junk = Array.from({ length: 80 }, () => '{"text":"aku","ko":"나"},'.repeat(20));
    const f = vi.fn().mockResolvedValueOnce(sseStream(['{"blocks":[', ...junk], false)).mockResolvedValueOnce(sseStream([formatStoryText(story([]))], true));
    vi.stubGlobal('fetch', f);
    const steps: string[] = [];
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {}, onStep: (x) => steps.push(`${x.attempt}:${x.stage}`) });
    expect(f).toHaveBeenCalledTimes(2);
    const second = JSON.parse(f.mock.calls[1]![1].body);
    expect(second.contents).toHaveLength(1); // 고장 난 답은 대화에 넣지 않는다
    expect(second.contents[0].parts[0].text).toMatch(/previous answer was broken or unusable/);
    expect(second.generationConfig.maxOutputTokens).toBe(32768);
    expect(steps).toContain('2:retrying');
    expect(s.title).toBe('Pagi');
  });

  it('이야기 줄은 다 왔는데 끝(GLOSS)에서 끊기면, 살려서 그대로 쓴다', async () => {
    const text = formatStoryText(story([]));
    const cut = text.slice(0, text.lastIndexOf('END')) + 'GLOSS: wah | 와';
    const f = vi.fn().mockResolvedValue(sseStream([cut], true));
    vi.stubGlobal('fetch', f);
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} });
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.title).toBe('Pagi');
    expect(s.blocks.filter((b) => b.kind === 'line')).toHaveLength(13);
  });

  it('생각에 토큰을 다 써서 몇 줄에서 끊기면, 끝난 이유와 생각 토큰 수를 오류에 담는다', async () => {
    const head = formatStoryText(story([])).slice(0, 400);
    const enc = new TextEncoder();
    const cutStream = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: head }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { thoughtsTokenCount: 7900 } })}\n\n`));
            c.close();
          },
        }),
        { status: 200 },
      );
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => cutStream()));
    await expect(createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} })).rejects.toThrow(/1번째: 줄이 너무 적어요.*\[400자, 끝난 이유 MAX_TOKENS, 생각 7900토큰\]/);
  });

  it('되풀이 알아차리기', () => {
    expect(looksLooping(formatStoryText(story([])))).toBe(false);
    expect(looksLooping('{"blocks":[' + '{"text":"aku","ko":"나"},'.repeat(200))).toBe(true);
    expect(looksLooping('{"a":"' + ' '.repeat(5000))).toBe(true);
  });
});

describe('진행률 어림', () => {
  it('글자가 올수록 오르지만 100%에 닿지 않는다', async () => {
    const { progressOf } = await import('./story');
    expect(progressOf(0)).toBe(0);
    expect(progressOf(7000)).toBeGreaterThan(0.75);
    expect(progressOf(14000)).toBeGreaterThan(progressOf(7000));
    expect(progressOf(100_000)).toBe(0.97);
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

describe('Gemini가 답을 시작하지 않을 때 (오래 생각하거나 붐빔)', () => {
  const silent = () => new Response(new ReadableStream({ start() {} }), { status: 200 }); // 아무것도 안 보내고 닫지도 않는다
  const saved = { ...STREAM_TIMING };
  afterEach(() => Object.assign(STREAM_TIMING, saved));

  it('첫 글자를 기다리다 시간이 다 되면 같은 모델로 또 기다리지 않고 다음 모델로 넘어가 이야기를 받는다', async () => {
    Object.assign(STREAM_TIMING, { firstMs: 50, idleMs: 1000, totalMs: 5000 });
    const f = vi.fn().mockResolvedValueOnce(silent()).mockResolvedValueOnce(sseStream([formatStoryText(story([]))], true));
    vi.stubGlobal('fetch', f);
    const steps: string[] = [];
    const s = await createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {}, onStep: (x) => steps.push(x.stage) });
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0]![0])).toContain('gemini-flash-latest:');
    expect(String(f.mock.calls[1]![0])).toContain('gemini-flash-lite-latest:');
    expect(steps).toContain('waiting');
    expect(s.title).toBe('Pagi');
  });

  it('모든 모델이 답을 시작하지 않으면 그 이유를 알려 준다', async () => {
    Object.assign(STREAM_TIMING, { firstMs: 50, idleMs: 1000, totalMs: 5000 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => silent()));
    await expect(createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} })).rejects.toThrow(/답을 시작하지 않았어요/);
  });

  it('글이 오기 시작한 뒤에 멈추면 받은 글자 수를 알려 준다 (예전처럼)', async () => {
    Object.assign(STREAM_TIMING, { firstMs: 1000, idleMs: 50, totalMs: 5000 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => sseStream(['TITLE: Pagi\n'], false)));
    await expect(createStory({ lex, plan: planStory(lex, 'normal'), topicKey: 'free', key: 'K', sleep: async () => {} })).rejects.toThrow(/받은 글 \d+자에서 멈춤/);
  });
});
