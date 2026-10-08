import Dexie, { type EntityTable } from 'dexie';
import type { AudioClip, Card, Deck, Note, ReviewLog, Settings } from '../../core/model/types';

export class FlashcardsDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  audio!: EntityTable<AudioClip, 'key'>;

  constructor(name = 'flashcards') {
    super(name);
    this.version(1).stores({
      decks: 'id, createdAt',
      notes: 'id, deckId, typeId, createdAt',
      cards: 'id, noteId, deckId',
      reviewLogs: 'id, cardId, at',
      settings: 'id',
    });
    this.version(2).stores({ audio: 'key, createdAt' });
  }
}

export const db = new FlashcardsDB();
