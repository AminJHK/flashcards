import { expect, it } from 'vitest';
import type { Note } from '../model/types';
import { indexNotes, searchNotes } from './search';

function note(id: string, fields: Note['fields'], createdAt = 0): Note {
  return { id, fields, createdAt, updatedAt: createdAt, deckId: 'test', typeVersion: 3, typeId: 'id-spoken', tags: [] };
}

it('ranks a headword above a newer example match and accepts terms across fields', () => {
  const word = note('word', { word: 'tuvani', meaning: '테스트 단어', exampleKo: '공항 예문', standard: 'matavani' });
  const example = note('example', { word: 'ravono', example: 'tuvani' }, 100);
  const index = indexNotes([example, word]);
  expect(searchNotes(index, ' TUVANI ').matches).toEqual([word, example]);
  expect(searchNotes(index, '공항 테스트').matches).toEqual([word]);
  expect(searchNotes(index, 'matavani').matches).toEqual([word]);
});

it('offers one-edit spelling suggestions separately and skips short queries', () => {
  const word = note('word', { word: 'tuvani' });
  const another = note('another', { word: 'koba' });
  const index = indexNotes([word, another]);
  for (const typo of ['tvani', 'tuavni', 'tuvaniq', 'tuvano']) {
    expect(searchNotes(index, typo)).toEqual({ matches: [], suggestions: [word] });
  }
  expect(searchNotes(index, 'koa').suggestions).toEqual([]);
});
