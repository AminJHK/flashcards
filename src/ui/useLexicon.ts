import { useMemo } from 'react';
import { buildLexicon, type Lexicon } from '../core/stories/vocab';
import { useCards, useNotes, useNow, useScheduler, useSettings } from './hooks';

/** 덱의 인도네시아어 단어를 지금의 FSRS 상태로 나눈 어휘 (이야기 만들기·읽기 화면이 같이 쓴다) */
export function useLexicon(): Lexicon | undefined {
  const settings = useSettings();
  const scheduler = useScheduler(settings);
  const notes = useNotes();
  const cards = useCards();
  const now = useNow(5 * 60_000);
  return useMemo(() => (notes && cards ? buildLexicon(notes, cards, scheduler, now) : undefined), [notes, cards, scheduler, now]);
}

/** 이야기에서 단어를 덱에 넣을 덱: 인도네시아어 단어가 가장 많은 덱 */
export function storyDeckId(lex: Lexicon, notes: readonly { id: string; deckId: string }[]): string | undefined {
  const ids = new Set(lex.entries.map((e) => e.noteId));
  const count = new Map<string, number>();
  for (const n of notes) if (ids.has(n.id)) count.set(n.deckId, (count.get(n.deckId) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}
