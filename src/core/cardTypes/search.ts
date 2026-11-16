import { getCardType } from './registry';
import type { Note } from '../model/types';

export function normalizeSearch(value: string): string {
  return value.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function indexNotes(notes: readonly Note[]) {
  return notes.map((note) => {
    const summary = getCardType(note.typeId).summary(note.fields);
    const primary = [summary.title, summary.sub, ...['meaning', 'en', 'pinyin', 'standard', 'root'].map((key) => note.fields[key] ?? '')].map(normalizeSearch);
    const fields = Object.values(note.fields).map(normalizeSearch);
    const spellings = [summary.title, note.fields.standard, note.fields.root]
      .flatMap((value) => normalizeSearch(value ?? '').match(/[a-z]{4,}/g) ?? []);
    return { note, primary, fields, spellings };
  });
}

// One insertion, deletion, substitution, or adjacent swap.
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  if (a.length > b.length) return oneEdit(b, a);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length < b.length) return a.slice(i) === b.slice(i + 1);
  return a.slice(i + 1) === b.slice(i + 1) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
}

export function searchNotes(index: ReturnType<typeof indexNotes>, input: string) {
  const query = normalizeSearch(input);
  if (!query) return { matches: [], suggestions: [] };
  const terms = query.split(' ');
  const matches: { note: Note; rank: number }[] = [];
  const suggestions: Note[] = [];
  for (const { note, primary, fields, spellings } of index) {
    if (terms.every((term) => fields.some((field) => field.includes(term)))) {
      const rank = primary.includes(query) ? 0
        : primary.some((field) => field.startsWith(query)) ? 1
        : terms.every((term) => primary.some((field) => field.includes(term))) ? 2 : 3;
      matches.push({ note, rank });
    } else if (/^[a-z]{4,}$/.test(query) && spellings.some((word) => oneEdit(query, word))) {
      suggestions.push(note);
    }
  }
  const recent = (a: Note, b: Note) => b.createdAt - a.createdAt;
  return {
    matches: matches.sort((a, b) => a.rank - b.rank || recent(a.note, b.note)).map(({ note }) => note),
    suggestions: suggestions.sort(recent).slice(0, 8),
  };
}
