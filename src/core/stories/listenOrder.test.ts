import { describe, expect, it } from 'vitest';
import type { StoryProgress } from './types';
import { listenOrder } from './listenOrder';

const DAY = 86_400_000;
const p = (storyId: string, done: boolean, lastListenedAt?: number): StoryProgress => ({ storyId, position: 1, answers: {}, readCount: 1, updatedAt: 0, ...(done ? { completedAt: 1 } : {}), ...(lastListenedAt ? { lastListenedAt } : {}) });

describe('운전 모드 순서', () => {
  it('끝까지 읽은 이야기만, 한 번도 안 들은 것 → 오래전에 들은 것 순서로, 같은 날끼리는 섞는다', () => {
    const stories = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const progress = [p('a', true, 10 * DAY), p('b', true), p('c', false), p('d', true, 2 * DAY), p('e', true)];
    const order = listenOrder(stories, progress, () => 0.5);
    expect(order).toHaveLength(4);
    expect(order).not.toContain('c');
    expect(order.slice(0, 2).sort()).toEqual(['b', 'e']);
    expect(order.slice(2)).toEqual(['d', 'a']);
    let i = 0;
    const flipped = listenOrder(stories, progress, () => [0.9, 0.1, 0.5, 0.5][i++ % 4]!);
    expect(flipped.slice(0, 2).sort()).toEqual(['b', 'e']);
  });
});
