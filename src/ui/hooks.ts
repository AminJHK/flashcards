import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { Card, Deck, Note, Settings } from '../core/model/types';
import { DEFAULT_SETTINGS } from '../core/model/types';
import type { Scheduler } from '../core/scheduler/types';
import { db } from '../adapters/storage/db';
import { getSettings, schedulerFor } from '../adapters/storage/repo';

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), []);
}

export function useScheduler(s: Settings | undefined): Scheduler {
  const key = s ? `${s.schedulerId}|${s.desiredRetention}|${s.fsrsParams?.join(',') ?? ''}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => schedulerFor(s ?? DEFAULT_SETTINGS), [key]);
}

export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), []);
}

export function useCards(): Card[] | undefined {
  return useLiveQuery(() => db.cards.toArray(), []);
}

export function useNotes(deckId?: string): Note[] | undefined {
  return useLiveQuery(() => (deckId ? db.notes.where('deckId').equals(deckId).toArray() : db.notes.toArray()), [deckId]);
}

/** 일정 간격으로 바뀌는 현재 시각 (학습 단계 카드가 때가 되면 화면을 갱신하려고). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
