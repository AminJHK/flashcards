import { describe, expect, it } from 'vitest';
import type { Note } from '../model/types';
import { findRegisterPairs } from './registerPairs';

const note = (id: string, word: string, standard = ''): Note => ({ id, deckId: 'd', typeId: 'id-spoken', typeVersion: 2, fields: { word, meaning: '뜻', standard }, tags: [], createdAt: 0, updatedAt: 0 });

describe('구어형·표준형 짝', () => {
  const kasih = note('1', 'kasih', 'memberi');
  const memberikan = note('2', 'memberikan', 'memberikan');
  const dengerin = note('3', 'dengerin', 'mendengarkan');
  const mendengarkan = note('4', 'mendengarkan', 'mendengarkan');
  const makan = note('5', 'makan', 'makan');
  const all = [kasih, memberikan, dengerin, mendengarkan, makan];

  it('표준형 카드에서는 구어형 짝을, 구어형 카드에서는 표준형 짝을 찾는다', () => {
    expect(findRegisterPairs(memberikan, all).map((p) => [p.note.fields.word, p.kind])).toEqual([['kasih', 'spoken']]);
    expect(findRegisterPairs(kasih, all).map((p) => [p.note.fields.word, p.kind])).toEqual([['memberikan', 'written']]);
    // 표준형 칸으로도 이어진다
    expect(findRegisterPairs(dengerin, all).map((p) => [p.note.fields.word, p.kind])).toEqual([['mendengarkan', 'written']]);
    expect(findRegisterPairs(mendengarkan, all).map((p) => [p.note.fields.word, p.kind])).toEqual([['dengerin', 'spoken']]);
    expect(findRegisterPairs(makan, all)).toEqual([]);
  });
});
