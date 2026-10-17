import { describe, expect, it } from 'vitest';
import { createNote } from '../model/notes';
import type { Card } from '../model/types';
import { createFsrs6 } from '../scheduler/fsrs6';
import { applyReview } from '../scheduler/queue';
import { DAY, MIN, T0, deck } from '../testUtil';
import { HARD_LAPSES, hardWords, isHard, memoryBreakdown, memoryByDeck, wordMemory } from './memory';

const sched = createFsrs6({ desiredRetention: 0.9 });
const d = deck('d');
const word = (i: number, dk = d): Card => createNote(dk, 'zh-word', { hanzi: `字${i}`, meaning: `뜻${i}` }, T0 - DAY + i, sched).cards[0]!;

/** 매번 "알았음"으로 간격을 늘려 가며 n번 복습한다 */
function reviewed(c: Card, n: number): { card: Card; at: number } {
  let at = T0;
  let card = c;
  for (let i = 0; i < n; i++) {
    card = applyReview(card, 3, at, sched);
    at = Math.max(at + MIN, card.due);
  }
  return { card, at };
}

describe('기억 상태', () => {
  it('새 카드, 배우는 중, 자라는 중, 탄탄함으로 나눈다', () => {
    const fresh = word(1);
    const learning = applyReview(word(2), 1, T0, sched); // 틀림 → 배우는 중
    const growing = reviewed(word(3), 3).card; // 며칠 간격
    const solid = reviewed(word(4), 8).card; // 몇 달 간격
    expect(solid.due - solid.lastReviewAt!).toBeGreaterThanOrEqual(21 * DAY);
    expect(growing.due - growing.lastReviewAt!).toBeLessThan(21 * DAY);
    const m = memoryBreakdown([fresh, learning, growing, solid], sched, T0);
    expect([m.fresh, m.learning, m.growing, m.solid, m.total]).toEqual([1, 1, 1, 1, 4]);
    expect(m.recall).toBeGreaterThan(0);
    expect(m.recall).toBeLessThanOrEqual(1);
  });

  it('숨긴 카드와 보류한 카드는 세지 않고, 본 카드가 없으면 기억 확률이 없다', () => {
    const m = memoryBreakdown([word(1), { ...word(2), hidden: true }, { ...word(3), suspended: true }], sched, T0);
    expect(m).toEqual({ fresh: 1, learning: 0, growing: 0, solid: 0, total: 1 });
  });

  it('시간이 지나면 기억 확률이 내려간다', () => {
    const { card, at } = reviewed(word(1), 4);
    const soon = memoryBreakdown([card], sched, card.lastReviewAt!).recall!;
    const later = memoryBreakdown([card], sched, at + 120 * DAY).recall!;
    expect(soon).toBeGreaterThan(later);
  });

  it('단어 하나: 카드가 여러 장이면 가장 약한 카드를 보여주고, 숨긴 카드는 빼고, 안 본 단어는 새 카드', () => {
    const solid = reviewed(word(1), 8).card;
    const weak = applyReview(word(2), 1, T0, sched);
    const m = wordMemory([solid, { ...weak, noteId: solid.noteId }], sched, T0 + MIN)!;
    expect(m.level).toBe('learning');
    expect(m.lapses).toBe(weak.lapses + solid.lapses);
    expect(m.due).toBe(Math.min(solid.due, weak.due));
    expect(wordMemory([solid, { ...weak, hidden: true }], sched, T0 + MIN)!.level).toBe('solid');
    expect(wordMemory([word(3)], sched, T0)).toEqual({ level: 'fresh', lapses: 0 });
    expect(wordMemory([{ ...word(4), hidden: true }], sched, T0)).toBeUndefined();
  });

  it('덱별로 나눈다', () => {
    const e = deck('e');
    const r = memoryByDeck([word(1), word(2), word(3, e)], sched, T0);
    expect(r.get('d')!.total).toBe(2);
    expect(r.get('e')!.total).toBe(1);
  });
});

describe('어려운 단어', () => {
  /** 배운 뒤 n번 잊었다 (복습 단계에서 "다시") */
  function forgot(c: Card, n: number): Card {
    let { card, at } = reviewed(c, 2);
    for (let i = 0; i < n; i++) {
      card = applyReview(card, 1, at, sched);
      at += 10 * MIN;
      card = applyReview(card, 3, at, sched);
      at = Math.max(at + MIN, card.due);
    }
    return card;
  }

  it('잊은 횟수가 기준 이상이면 어려운 단어, 정방향·역방향을 합쳐 센다', () => {
    const hard = forgot(word(1), HARD_LAPSES);
    expect(hard.lapses).toBe(HARD_LAPSES);
    const easy = forgot(word(2), HARD_LAPSES - 1);
    const half = forgot(word(3), 2);
    const halfReverse = { ...forgot(word(4), 2), id: 'rev', noteId: half.noteId };
    const m = hardWords([hard, easy, half, halfReverse]);
    expect([...m.keys()].sort()).toEqual([hard.noteId, half.noteId].sort());
    expect(m.get(half.noteId)).toBe(4);
    expect(isHard(wordMemory([hard], sched, T0))).toBe(true);
  });

  it('기억이 탄탄해지거나 숨긴 카드는 어려운 단어가 아니다', () => {
    expect(isHard({ level: 'solid', lapses: 9 })).toBe(false);
    expect(isHard({ level: 'growing', lapses: HARD_LAPSES })).toBe(true);
    expect(isHard(undefined)).toBe(false);
    const hard = forgot(word(1), HARD_LAPSES);
    expect(hardWords([{ ...hard, hidden: true }]).size).toBe(0);
  });
});
