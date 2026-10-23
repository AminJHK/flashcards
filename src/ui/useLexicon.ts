import { useMemo } from 'react';
import { saveSettings } from '../adapters/storage/repo';
import type { Settings } from '../core/model/types';
import { buildLexicon, norm, type Lexicon } from '../core/stories/vocab';
import { useCards, useNotes, useNow, useScheduler, useSettings } from './hooks';

/** 덱의 인도네시아어 단어를 지금의 FSRS 상태로 나눈 어휘 (이야기 만들기·읽기 화면이 같이 쓴다) */
export function useLexicon(): Lexicon | undefined {
  const settings = useSettings();
  const scheduler = useScheduler(settings);
  const notes = useNotes();
  const cards = useCards();
  const now = useNow(5 * 60_000);
  const mine = settings?.knownWords;
  return useMemo(() => (notes && cards ? buildLexicon(notes, cards, scheduler, now, mine) : undefined), [notes, cards, scheduler, now, mine]);
}

/** 이야기에서 단어를 덱에 넣을 덱: 인도네시아어 단어가 가장 많은 덱 */
export function storyDeckId(lex: Lexicon, notes: readonly { id: string; deckId: string }[]): string | undefined {
  const ids = new Set(lex.entries.map((e) => e.noteId));
  const count = new Map<string, number>();
  for (const n of notes) if (ids.has(n.id)) count.set(n.deckId, (count.get(n.deckId) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}
/** 덱에 없는 단어를 "이미 알아요" 목록에 넣거나 뺀다 (Settings.knownWords) */

export async function setKnownWord(settings: Settings, word: string, known: boolean): Promise<void> {
  const w = norm(word);
  const list = (settings.knownWords ?? []).filter((x) => norm(x) !== w);
  await saveSettings({ knownWords: known ? [...list, w] : list });
}
