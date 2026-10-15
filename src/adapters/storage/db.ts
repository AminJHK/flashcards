import Dexie, { type EntityTable } from 'dexie';
import type { AudioClip, Card, Deck, Note, ReviewLog, Settings, Tombstone } from '../../core/model/types';
import type { Story, StoryProgress } from '../../core/stories/types';

export class FlashcardsDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  audio!: EntityTable<AudioClip, 'key'>;
  tombstones!: EntityTable<Tombstone, 'id'>;
  /** AI 읽기 이야기와 읽은 위치. 카드·복습 기록과 따로 둔다 (읽기는 복습이 아니다) */
  stories!: EntityTable<Story, 'id'>;
  storyProgress!: EntityTable<StoryProgress, 'storyId'>;

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
    this.version(3).stores({ tombstones: 'id, at' });
    this.version(4).stores({ stories: 'id, createdAt', storyProgress: 'storyId' });
  }
}

export const db = new FlashcardsDB();
