import { expect, it } from 'vitest';
import { createNote } from '../model/notes';
import { createFsrs6 } from '../scheduler/fsrs6';
import { deck, review, T0 } from '../testUtil';
import { makeIndonesianPracticeFile } from './indonesianPractice';

it('exports only active Indonesian word cards and keeps the two directions separate', () => {
  const scheduler = createFsrs6({ desiredRetention: 0.9 });
  const d = deck('d');
  const add = (word: string) => createNote(d, 'id-spoken', {
    word, meaning: '가짜 뜻', note: 'PRIVATE MEMO',
  }, T0, scheduler);
  const active = add('test-word');
  const suspended = add('test-suspended');
  const other = createNote(d, 'zh-word', { hanzi: '字', meaning: '가짜 뜻' }, T0, scheduler);
  const forward = active.cards.find((card) => card.templateId === 'forward')!;
  const reviewed = { ...forward, ...scheduler.apply(forward, 3, T0 + 1000) };
  const result = makeIndonesianPracticeFile({
    decks: [d],
    notes: [active.note, suspended.note, other.note],
    cards: [
      ...active.cards.map((card) => card.id === forward.id ? reviewed : card),
      ...suspended.cards.map((card) => ({ ...card, suspended: true })),
      ...other.cards,
    ],
    reviewLogs: [review(forward.id, 3, T0 + 1000)],
    tombstones: [],
  }, scheduler, T0 + 2000);

  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]).toMatchObject({
    korean: '가짜 뜻',
    indonesian: 'test-word',
    indonesianToKorean: { cardId: forward.id, reps: 1, recallProbability: expect.any(Number) },
    koreanToIndonesian: { reps: 0, recallProbability: null },
  });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE MEMO|reviewLogs|memory|tombstones/);
});
