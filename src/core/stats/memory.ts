import type { Card, Millis } from '../model/types';
import { stateOf } from '../scheduler/queue';
import type { Scheduler } from '../scheduler/types';

/** 이 간격(일) 이상이면 "탄탄함" (Anki의 mature 기준과 같다) */
export const SOLID_DAYS = 21;

/**
 * 덱 하나의 기억 상태. 카드를 기억의 단단함 순서로 네 칸에 나눈다.
 * - fresh: 아직 안 본 새 카드
 * - learning: 오늘 배우는 중 (짧은 간격으로 다시 보는 단계, 틀려서 다시 배우는 카드 포함)
 * - growing: 복습 간격이 21일 미만
 * - solid: 복습 간격이 21일 이상
 * recall: 본 적 있는 카드를 지금 떠올릴 확률의 평균 (0~1). 본 카드가 없으면 undefined.
 */
export interface MemoryBreakdown {
  fresh: number;
  learning: number;
  growing: number;
  solid: number;
  total: number;
  recall?: number;
}

export const EMPTY_MEMORY: MemoryBreakdown = { fresh: 0, learning: 0, growing: 0, solid: 0, total: 0 };

const DAY = 86_400_000;

export function memoryBreakdown(cards: readonly Card[], scheduler: Scheduler, now: Millis): MemoryBreakdown {
  const m = { ...EMPTY_MEMORY };
  let sum = 0;
  let seen = 0;
  for (const c of cards) {
    if (c.hidden || c.suspended) continue;
    m.total++;
    if (c.phase === 'new') {
      m.fresh++;
      continue;
    }
    if (c.phase === 'learning') m.learning++;
    else if (c.due - (c.lastReviewAt ?? c.due) >= SOLID_DAYS * DAY) m.solid++;
    else m.growing++;
    sum += scheduler.retrievability(stateOf(c), now);
    seen++;
  }
  return seen ? { ...m, recall: sum / seen } : m;
}

/** 카드를 덱별로 나눠 계산한다. */
export function memoryByDeck(cards: readonly Card[], scheduler: Scheduler, now: Millis): Map<string, MemoryBreakdown> {
  const byDeck = new Map<string, Card[]>();
  for (const c of cards) byDeck.set(c.deckId, [...(byDeck.get(c.deckId) ?? []), c]);
  return new Map([...byDeck].map(([id, cs]) => [id, memoryBreakdown(cs, scheduler, now)]));
}
