import type { Deck, ReviewLog, Rating } from './model/types';

export const KST = -540;

export function deck(id: string, over: Partial<Deck['settings']> = {}): Deck {
  return {
    id,
    name: id,
    createdAt: 0,
    settings: { defaultTypeId: 'zh-word', reverseEnabled: false, newPerDay: 20, autoplay: 'back', langs: { front: 'id-ID', back: 'ko-KR' }, ...over },
  };
}

let n = 0;
export function review(cardId: string, rating: Rating, at: number): ReviewLog {
  return { id: `log-${++n}`, cardId, kind: 'review', rating, at, tzOffsetMin: KST, scheduler: 'test' };
}

/** 2026-10-08 10:00 KST */
export const T0 = Date.UTC(2026, 9, 8, 1, 0, 0);
export const MIN = 60_000;
export const DAY = 86_400_000;
