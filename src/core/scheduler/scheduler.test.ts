import { describe, expect, it } from 'vitest';
import type { Card, Rating, ReviewLog } from '../model/types';
import { DAY, MIN, T0, review } from '../testUtil';
import { formatInterval } from './format';
import { createFsrs6 } from './fsrs6';
import { createFsrs7 } from './fsrs7';
import { applyReview, withState } from './queue';
import { rebuildFromLogs } from './rebuild';
import { createScheduler, DEFAULT_SCHEDULER_ID } from './registry';
import type { Scheduler } from './types';

describe.each([
  ['FSRS-6', createFsrs6({ desiredRetention: 0.9 })],
  ['FSRS-7', createFsrs7({ desiredRetention: 0.9 })],
] as [string, Scheduler][])('%s + 로그 재계산', (_name, sched) => {
  const newCard = (id = 'c1'): Card => {
    const base: Card = {
      id, noteId: 'n1', deckId: 'd', templateId: 'forward', ord: 0, hidden: false, suspended: false,
      createdAt: T0, isNew: true, due: T0, phase: 'new', reps: 0, lapses: 0,
    };
    return withState(base, sched.initial(T0, id), sched.id);
  };
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
    const rebuilt = rebuildFromLogs(T0, logs, sched, 'c1');
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

  it('떠올릴 확률은 새 카드 0, 복습 직후 높고 시간이 지나면 낮아진다', () => {
    expect(sched.retrievability(newCard(), T0)).toBe(0);
    const c = applyReview(newCard(), 3, T0, sched);
    const soon = sched.retrievability(c, T0 + MIN);
    const later = sched.retrievability(c, T0 + 30 * DAY);
    expect(soon).toBeGreaterThan(0.9);
    expect(later).toBeLessThan(soon);
  });
});

describe('알고리즘 목록', () => {
  it('기본은 FSRS-7, FSRS-6도 고를 수 있고 모르는 id는 기본으로', () => {
    expect(DEFAULT_SCHEDULER_ID).toBe('fsrs-7');
    expect(createScheduler('fsrs-6', { desiredRetention: 0.9 }).id).toBe('fsrs-6');
    expect(createScheduler('???', { desiredRetention: 0.9 }).id).toBe('fsrs-7');
  });

  it('FSRS-7은 FSRS-6용 최적화 값(21개)을 쓰지 않고 기본값으로 계산한다', () => {
    const w6 = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
    const a = createFsrs7({ desiredRetention: 0.9, params: w6 });
    const b = createFsrs7({ desiredRetention: 0.9 });
    expect(a.preview(a.initial(T0, 'x'), T0)).toEqual(b.preview(b.initial(T0, 'x'), T0));
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
