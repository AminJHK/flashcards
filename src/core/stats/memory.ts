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

export type MemoryLevel = 'fresh' | 'learning' | 'growing' | 'solid';

/** 약한 것 → 단단한 것 순서 */
export const LEVELS: readonly MemoryLevel[] = ['fresh', 'learning', 'growing', 'solid'];

/** 카드 한 장의 단계 */
export function cardLevel(c: Card): MemoryLevel {
  if (c.phase === 'new') return 'fresh';
  if (c.phase === 'learning') return 'learning';
  return c.due - (c.lastReviewAt ?? c.due) >= SOLID_DAYS * DAY ? 'solid' : 'growing';
}

/** 단어(노트) 하나의 기억 상태. 카드가 여러 장(정방향·역방향)이면 가장 약한 카드를 기준으로 한다. */
export interface WordMemory {
  level: MemoryLevel;
  /** 지금 떠올릴 확률 (본 적 없으면 없음) */
  recall?: number;
  /** 다음 복습 시각 (본 적 없으면 없음) */
  due?: Millis;
  /** 틀린 횟수 합 */
  lapses: number;
}

export function wordMemory(cards: readonly Card[], scheduler: Scheduler, now: Millis): WordMemory | undefined {
  const visible = cards.filter((c) => !c.hidden && !c.suspended);
  if (!visible.length) return undefined;
  const lapses = visible.reduce((s, c) => s + c.lapses, 0);
  const seen = visible.filter((c) => c.phase !== 'new');
  if (!seen.length) return { level: 'fresh', lapses };
  const scored = seen.map((c) => ({ c, r: scheduler.retrievability(stateOf(c), now) }));
  // 단계가 낮은 카드가 더 약하다. 단계가 같으면 떠올릴 확률이 낮은 쪽
  const rank = (x: { c: Card; r: number }) => LEVELS.indexOf(cardLevel(x.c)) * 10 + x.r;
  const weakest = scored.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  return { level: cardLevel(weakest.c), recall: weakest.r, due: Math.min(...seen.map((c) => c.due)), lapses };
}

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
    m[cardLevel(c)]++;
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

/**
 * 어려운 단어(leech, docs/DESIGN.md §4.6): 배운 뒤에 이만큼 이상 잊어버린 단어.
 * 단어의 카드(정방향·역방향)가 잊은 횟수를 합친다. 설계의 8번은 카드 한 장 기준이고,
 * 배우기 시작한 지 얼마 안 된 덱에서도 보이도록 단어 기준 4번으로 잡았다.
 */
export const HARD_LAPSES = 4;

/** 어려운 단어인지. 기억이 탄탄해지면(가장 약한 카드도 21일 이상) 표시가 사라진다. */
export function isHard(m: Pick<WordMemory, 'level' | 'lapses'> | undefined): boolean {
  return !!m && m.lapses >= HARD_LAPSES && m.level !== 'solid' && m.level !== 'fresh';
}

/** 카드들 중 어려운 단어의 noteId → 잊은 횟수. 기억 확률이 필요 없어서 scheduler 없이 센다. */
export function hardWords(cards: readonly Card[]): Map<string, number> {
  const byNote = new Map<string, Card[]>();
  for (const c of cards) {
    if (c.hidden || c.suspended) continue;
    byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
  }
  const out = new Map<string, number>();
  for (const [id, cs] of byNote) {
    const seen = cs.filter((c) => c.phase !== 'new');
    if (!seen.length) continue;
    const level = LEVELS[Math.min(...seen.map((c) => LEVELS.indexOf(cardLevel(c))))]!;
    const lapses = cs.reduce((s, c) => s + c.lapses, 0);
    if (isHard({ level, lapses })) out.set(id, lapses);
  }
  return out;
}
