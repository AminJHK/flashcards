import { describe, expect, it } from 'vitest';
import { createNote, cardsForNote } from '../model/notes';
import type { Card } from '../model/types';
import { DAY, KST, MIN, T0, deck } from '../testUtil';
import { createFsrs6 } from './fsrs6';
import { applyReview, assumeAnswered, buildQueue, hasUnsavedAnswers } from './queue';

const sched = createFsrs6({ desiredRetention: 0.9 });

function words(d: ReturnType<typeof deck>, n: number, start = T0 - DAY): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) out.push(...createNote(d, 'zh-word', { hanzi: `字${i}`, meaning: `뜻${i}` }, start + i, sched).cards);
  return out;
}

const q = (cards: Card[], decks: ReturnType<typeof deck>[], now = T0, learnAheadMs = 0) =>
  buildQueue({ now, tzOffsetMin: KST, dayStartHour: 4, cards, decks, scheduler: sched, learnAheadMs });

describe('buildQueue', () => {
  it('덱의 하루 새 카드 한도를 지킨다', () => {
    const d = deck('d', { newPerDay: 3 });
    const r = q(words(d, 10), [d]);
    expect(r.counts.newc).toBe(3);
    expect(r.next).toBeDefined();
  });

  it('오늘 이미 소개한 새 카드도 한도에 포함한다', () => {
    const d = deck('d', { newPerDay: 3 });
    const cards = words(d, 10);
    cards[0] = applyReview(cards[0]!, 3, T0 - 30 * MIN, sched);
    const r = q(cards, [d]);
    expect(r.counts.newc).toBe(2);
  });

  it('역방향이 꺼져 있으면 역방향 카드는 숨긴다', () => {
    const d = deck('d', { newPerDay: 50 });
    const cards = words(d, 5);
    expect(cards.filter((c) => c.hidden)).toHaveLength(5);
    expect(q(cards, [d]).counts.newc).toBe(5);
  });

  it('형제 카드는 같은 날 하나만 보여준다', () => {
    const d = deck('d', { newPerDay: 50, reverseEnabled: true });
    const cards = words(d, 3);
    expect(q(cards, [d]).counts.newc).toBe(3); // 노트 3개 → 하루에 하나씩
    const fwd = cards.findIndex((c) => c.templateId === 'forward');
    cards[fwd] = applyReview(cards[fwd]!, 3, T0 - 5 * MIN, sched);
    cards[fwd] = applyReview(cards[fwd]!, 3, T0 - 1 * MIN, sched);
    const r = q(cards, [d]);
    const sibling = cards.find((c) => c.noteId === cards[fwd]!.noteId && c.templateId === 'reverse')!;
    expect(r.next?.id).not.toBe(sibling.id);
    expect(r.counts.newc).toBe(2);
  });

  it('학습 단계 카드를 가장 먼저 보여준다', () => {
    const d = deck('d');
    const cards = words(d, 3);
    cards[2] = applyReview(cards[2]!, 1, T0 - 2 * MIN, sched); // 다시 → 1분 뒤
    const r = q(cards, [d]);
    expect(r.next?.id).toBe(cards[2]!.id);
  });

  it('다른 카드가 남아 있으면 학습 단계 카드는 예정 시각까지 기다린다', () => {
    const d = deck('d', { newPerDay: 2 });
    const cards = words(d, 2).filter((c) => !c.hidden);
    cards[0] = applyReview(cards[0]!, 3, T0, sched); // 알았음 → 10분 뒤
    expect(q(cards, [d], T0 + MIN).next?.id).toBe(cards[1]!.id);
  });

  it('기본: 학습 단계 카드만 남아도 정해진 간격을 지키고, 그때까지 기다린다', () => {
    const d = deck('d', { newPerDay: 1 });
    const cards = words(d, 1).filter((c) => !c.hidden);
    cards[0] = applyReview(cards[0]!, 2, T0, sched); // 어려움 → 몇 분 뒤
    const r = q(cards, [d], T0 + MIN);
    expect(r.next).toBeUndefined();
    expect(r.waiting).toEqual({ count: 1, nextDue: cards[0]!.due, cardId: cards[0]!.id });
    // 시간이 되면 나온다
    expect(q(cards, [d], cards[0]!.due).next?.id).toBe(cards[0]!.id);
  });

  it('미리 보기를 켜면(20분) 그 안의 학습 카드는 앞당겨 보여주고, 그보다 이르면 기다린다', () => {
    const d = deck('d', { newPerDay: 1 });
    const cards = words(d, 1).filter((c) => !c.hidden);
    cards[0] = applyReview(cards[0]!, 3, T0, sched); // 알았음 → 10분 뒤
    expect(q(cards, [d], T0 + MIN, 20 * MIN).next?.id).toBe(cards[0]!.id);
    cards[0] = { ...cards[0]!, due: T0 + 40 * MIN };
    const r = q(cards, [d], T0 + MIN, 20 * MIN);
    expect(r.next).toBeUndefined();
    expect(r.waiting).toEqual({ count: 1, nextDue: T0 + 40 * MIN, cardId: cards[0]!.id });
  });

  it('덱 설정을 켜면 숨겼던 역방향 카드가 기록과 함께 다시 보인다', () => {
    const off = deck('d');
    const { note, cards } = createNote(off, 'zh-word', { hanzi: '书', meaning: '책' }, T0, sched);
    const on = deck('d', { reverseEnabled: true });
    const changed = cardsForNote(note, cards, on, T0 + DAY, sched);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.hidden).toBe(false);
    expect(changed[0]!.id).toBe(cards.find((c) => c.templateId === 'reverse')!.id);
  });
});

describe('방금 답한 카드 (목록 갱신이 늦을 때)', () => {
  it('목록에 아직 반영되지 않았으면 같은 카드를 다시 고르지 않는다', () => {
    const d = deck('d', { newPerDay: 5 });
    const cards = words(d, 3).filter((c) => !c.hidden);
    const first = q(cards, [d]).next!;
    // 답했지만 목록은 아직 예전 그대로
    const answered = { [first.id]: T0 };
    expect(hasUnsavedAnswers(cards, answered)).toBe(true);
    const r = q(assumeAnswered(cards, answered), [d]);
    expect(r.next?.id).toBeDefined();
    expect(r.next?.id).not.toBe(first.id);
    expect(r.counts.newc).toBe(2); // 오늘 소개한 새 카드로 센다
  });

  it('목록에 반영되면 진짜 상태를 쓴다 (10분 뒤 학습 카드)', () => {
    const d = deck('d', { newPerDay: 1 });
    const cards = words(d, 1).filter((c) => !c.hidden);
    const saved = [applyReview(cards[0]!, 3, T0, sched)];
    const answered = { [cards[0]!.id]: T0 };
    expect(hasUnsavedAnswers(saved, answered)).toBe(false);
    expect(assumeAnswered(saved, answered)[0]).toBe(saved[0]);
    expect(q(saved, [d], saved[0]!.due).next?.id).toBe(cards[0]!.id);
  });
});
