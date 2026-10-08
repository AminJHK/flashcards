import { studyDay, studyDayEnd } from '../model/day';
import type { Card, Deck, Id, Millis, Rating } from '../model/types';
import type { SchedState, Scheduler } from './types';

/** 남은 카드가 학습 단계 카드뿐이면 예정보다 이만큼 일찍 보여준다 (Anki의 learn ahead와 같음). */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface QueueInput {
  now: Millis;
  tzOffsetMin: number;
  dayStartHour: number;
  cards: readonly Card[];
  decks: readonly Deck[];
  scheduler: Scheduler;
  /** 특정 덱만 볼 때 */
  deckId?: Id;
}

export interface DeckCounts {
  review: number;
  learning: number;
  newc: number;
}

export interface QueueResult {
  /** 지금 보여줄 카드. 없으면 오늘은 끝났거나 학습 단계 카드를 기다리는 중 */
  next?: Card;
  counts: DeckCounts;
  byDeck: Record<Id, DeckCounts>;
  /** 오늘 안에 다시 볼 학습 단계 카드가 있지만 아직 때가 아닐 때 */
  waiting?: { count: number; nextDue: Millis; cardId: Id };
}

/**
 * 오늘의 복습 대기열 (docs/DESIGN.md §4.6).
 * - 학습 단계(같은 날 재복습) 카드를 먼저
 * - 그다음 복습 카드: 기억 확률이 낮은 것부터
 * - 새 카드는 복습 사이에 고르게 섞고, 덱마다 하루 한도를 지킨다
 * - 같은 노트의 형제 카드(정방향/역방향)는 같은 날 하나만
 */
export function buildQueue(input: QueueInput): QueueResult {
  const { now, tzOffsetMin, dayStartHour, scheduler } = input;
  const today = studyDay(now, tzOffsetMin, dayStartHour);
  const dayEnd = studyDayEnd(today, tzOffsetMin, dayStartHour);
  const isToday = (t?: Millis) => t !== undefined && studyDay(t, tzOffsetMin, dayStartHour) === today;
  const deckById = new Map(input.decks.map((d) => [d.id, d]));

  const active = input.cards.filter(
    (c) => !c.hidden && !c.suspended && deckById.has(c.deckId) && (!input.deckId || c.deckId === input.deckId),
  );

  // 오늘 이미 복습한 카드가 있는 노트 → 그 노트의 다른 카드는 내일로
  const notesTouchedToday = new Map<Id, Id>();
  for (const c of active) if (isToday(c.lastReviewAt)) notesTouchedToday.set(c.noteId, c.id);
  const siblingBlocked = (c: Card) => {
    const touched = notesTouchedToday.get(c.noteId);
    return touched !== undefined && touched !== c.id;
  };

  const learning = active
    .filter((c) => c.phase === 'learning' && c.due <= dayEnd)
    .sort((a, b) => a.due - b.due);

  const reviewsWithR = active
    .filter((c) => c.phase === 'review' && studyDay(c.due, tzOffsetMin, dayStartHour) <= today && !siblingBlocked(c))
    .map((c) => ({ c, r: scheduler.retrievability(stateOf(c), now) }))
    .sort((a, b) => a.r - b.r || a.c.due - b.c.due);
  const reviews: Card[] = [];
  const reviewNotes = new Set<Id>();
  for (const { c } of reviewsWithR) {
    if (reviewNotes.has(c.noteId)) continue; // 형제 카드가 같은 날 둘 다 예정이면 하나만
    reviewNotes.add(c.noteId);
    reviews.push(c);
  }

  // 덱별 하루 새 카드 한도
  const introducedToday = new Map<Id, number>();
  for (const c of active) if (isToday(c.firstReviewAt)) introducedToday.set(c.deckId, (introducedToday.get(c.deckId) ?? 0) + 1);
  const newByDeck = new Map<Id, Card[]>();
  const newNotes = new Set<Id>();
  const newCandidates = active
    .filter((c) => c.phase === 'new' && !siblingBlocked(c) && !reviewNotes.has(c.noteId))
    .sort((a, b) => a.createdAt - b.createdAt || a.ord - b.ord);
  for (const c of newCandidates) {
    if (newNotes.has(c.noteId)) continue;
    const deck = deckById.get(c.deckId)!;
    const left = deck.settings.newPerDay - (introducedToday.get(c.deckId) ?? 0);
    const list = newByDeck.get(c.deckId) ?? [];
    if (list.length >= left) continue;
    list.push(c);
    newByDeck.set(c.deckId, list);
    newNotes.add(c.noteId);
  }
  const newCards = [...newByDeck.values()].flat().sort((a, b) => a.createdAt - b.createdAt || a.ord - b.ord);

  // 개수
  const byDeck: Record<Id, DeckCounts> = {};
  const bump = (deckId: Id, k: keyof DeckCounts) => {
    byDeck[deckId] ??= { review: 0, learning: 0, newc: 0 };
    byDeck[deckId][k]++;
  };
  learning.forEach((c) => bump(c.deckId, 'learning'));
  reviews.forEach((c) => bump(c.deckId, 'review'));
  newCards.forEach((c) => bump(c.deckId, 'newc'));
  const counts = { learning: learning.length, review: reviews.length, newc: newCards.length };

  // 다음 카드 고르기
  let next: Card | undefined = learning.find((c) => c.due <= now);
  if (!next) {
    if (reviews.length && newCards.length) {
      // 복습 사이에 새 카드를 고르게 섞는다
      const every = Math.max(1, Math.round((reviews.length + newCards.length) / newCards.length));
      const doneToday = active.filter((c) => isToday(c.lastReviewAt)).length;
      next = doneToday % every === every - 1 ? newCards[0] : reviews[0];
    } else {
      next = reviews[0] ?? newCards[0];
    }
  }
  // 학습 단계 카드밖에 남지 않았으면 조금 앞당겨 보여주고, 그래도 이르면 기다린다
  if (!next) next = learning.find((c) => c.due <= now + LEARN_AHEAD_MS);
  if (!next && learning.length) {
    return { counts, byDeck, waiting: { count: learning.length, nextDue: learning[0]!.due, cardId: learning[0]!.id } };
  }
  return { next, counts, byDeck };
}

export function stateOf(c: Card): SchedState {
  return {
    isNew: c.isNew,
    phase: c.phase,
    due: c.due,
    reps: c.reps,
    lapses: c.lapses,
    lastReviewAt: c.lastReviewAt,
    firstReviewAt: c.firstReviewAt,
    memory: c.memory,
  };
}

/** 스케줄링 결과를 카드 캐시에 반영한다. */
export function withState(card: Card, state: SchedState, schedulerId: string): Card {
  return {
    ...card,
    isNew: state.isNew,
    phase: state.phase,
    due: state.due,
    reps: state.reps,
    lapses: state.lapses,
    lastReviewAt: state.lastReviewAt,
    firstReviewAt: state.firstReviewAt,
    memory: state.memory,
    schedulerId,
  };
}

/** 버튼을 눌렀을 때 카드의 새 상태. 로그 재계산과 같은 결과가 나와야 한다. */
export function applyReview(card: Card, rating: Rating, at: Millis, scheduler: Scheduler): Card {
  const next = scheduler.apply(stateOf(card), rating, at);
  return withState(card, { ...next, firstReviewAt: card.firstReviewAt ?? at }, scheduler.id);
}
