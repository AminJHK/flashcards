import { describe, expect, it } from 'vitest';
import type { Card, Rating, ReviewLog } from '../model/types';
import { DAY, MIN, T0, review } from '../testUtil';
import { formatInterval } from './format';
import { createFsrs6 } from './fsrs6';
import { applyReview, withState } from './queue';
import { rebuildFromLogs } from './rebuild';

const sched = createFsrs6({ desiredRetention: 0.9 });

function newCard(id = 'c1'): Card {
  const base: Card = {
    id, noteId: 'n1', deckId: 'd', templateId: 'forward', ord: 0, hidden: false, suspended: false,
    createdAt: T0, isNew: true, due: T0, phase: 'new', reps: 0, lapses: 0,
  };
  return withState(base, sched.initial(T0), sched.id);
}

describe('FSRS-6 + 로그 재계산', () => {
  const steps: [Rating, number][] = [
    [3, T0],
    [3, T0 + 10 * MIN],
    [1, T0 + 3 * DAY],
    [3, T0 + 3 * DAY + 10 * MIN],
    [3, T0 + 6 * DAY],
    [4, T0 + 20 * DAY],
  ];

  it('복습하면서 바로 계산한 결과와 로그로 다시 계산한 결과가 같다', () => {
    let live = newCard();
    const logs: ReviewLog[] = [];
    for (const [r, at] of steps) {
      live = applyReview(live, r, at, sched);
      logs.push(review('c1', r, at));
    }
    const rebuilt = rebuildFromLogs(T0, logs, sched);
    expect(rebuilt.due).toBe(live.due);
    expect(rebuilt.memory).toEqual(live.memory);
    expect(rebuilt.firstReviewAt).toBe(T0);
    expect(live.lapses).toBe(1);
  });

  it('같은 로그로 두 번 계산해도 결과가 같다 (퍼즈 포함)', () => {
    const logs = steps.map(([r, at]) => review('c1', r, at));
    expect(rebuildFromLogs(T0, logs, sched)).toEqual(rebuildFromLogs(T0, logs, sched));
  });

  it('void 로그가 가리키는 복습은 없었던 것으로 친다', () => {
    const a = review('c1', 3, T0);
    const wrong = review('c1', 1, T0 + 5 * MIN);
    const v: ReviewLog = { id: 'v1', cardId: 'c1', kind: 'void', voidsId: wrong.id, at: T0 + 6 * MIN, tzOffsetMin: -540 };
    expect(rebuildFromLogs(T0, [a, wrong, v], sched)).toEqual(rebuildFromLogs(T0, [a], sched));
  });

  it('reset 이후는 새 카드로 다시 시작한다', () => {
    const logs: ReviewLog[] = [
      review('c1', 3, T0),
      review('c1', 3, T0 + 2 * DAY),
      { id: 'r1', cardId: 'c1', kind: 'reset', at: T0 + 3 * DAY, tzOffsetMin: -540 },
    ];
    const s = rebuildFromLogs(T0, logs, sched);
    expect(s.isNew).toBe(true);
    expect(s.reps).toBe(0);
    expect(s.firstReviewAt).toBeUndefined();
  });

  it('버튼 미리보기는 다시 < 어려움 < 알았음 < 쉬움 순서', () => {
    const p = sched.preview(newCard(), T0);
    expect(p[1]).toBeLessThan(p[2]);
    expect(p[2]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
  });
});

describe('formatInterval', () => {
  it.each([
    [30_000, '1분'],
    [10 * MIN, '10분'],
    [3 * 60 * MIN, '3시간'],
    [4 * DAY, '4일'],
    [75 * DAY, '2.5개월'],
    [400 * DAY, '1.1년'],
  ])('%d → %s', (ms, label) => expect(formatInterval(ms)).toBe(label));
});
