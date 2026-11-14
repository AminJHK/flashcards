import type { Card } from '../model/types';
import type { Scheduler } from '../scheduler/types';
import type { SyncData } from './sync';

export const PRACTICE_FILE_NAME = 'flashcards-indonesian-practice.json';

export function makeIndonesianPracticeFile(data: SyncData, scheduler: Scheduler, savedAt: number) {
  const byTemplate = new Map(data.cards.map((card) => [`${card.noteId}:${card.templateId}`, card]));
  const activeDecks = new Set(data.decks.map((deck) => deck.id));
  const progress = (card?: Card) => {
    if (!card) return null;
    return {
      cardId: card.id,
      phase: card.phase,
      reps: card.reps,
      lapses: card.lapses,
      lastReviewAt: card.lastReviewAt ?? null,
      recallProbability: card.schedulerId === scheduler.id && !card.isNew
        ? scheduler.retrievability(card, savedAt)
        : null,
    };
  };

  return {
    format: 'flashcards-indonesian-practice',
    version: 1,
    savedAt,
    scheduler: scheduler.id,
    entries: data.notes.flatMap((note) => {
      if (note.typeId !== 'id-spoken' || !activeDecks.has(note.deckId)) return [];
      const forward = byTemplate.get(`${note.id}:forward`);
      if (!forward || forward.hidden || forward.suspended) return [];
      const indonesian = note.fields.word?.trim();
      const korean = note.fields.meaning?.trim();
      if (!indonesian || !korean) return [];
      return [{
        noteId: note.id,
        korean,
        indonesian,
        example: note.fields.example?.trim() || undefined,
        exampleKorean: note.fields.exampleKo?.trim() || undefined,
        indonesianToKorean: progress(forward),
        koreanToIndonesian: progress(byTemplate.get(`${note.id}:reverse`)),
      }];
    }),
  };
}
