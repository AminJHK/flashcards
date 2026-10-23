import { describe, expect, it } from 'vitest';
import type { Note } from '../model/types';
import { familyRoot, findWordFamily } from './wordFamily';

function n(id: string, word: string, root = '', deckId = 'deck', typeId = 'id-spoken'): Note {
  return { id, deckId, typeId, typeVersion: 2, fields: { word, root }, tags: [], createdAt: 1, updatedAt: 1 };
}

describe('인도네시아어 어근 가족', () => {
  it('기본형의 root 칸이 비어 있어도 파생형을 연결한다', () => {
    const words = [n('1', 'rasa'), n('2', 'ngerasa', 'rasa'), n('3', 'terasa', 'rasa')];
    expect(findWordFamily(words[0]!, words).relatives.map((x) => x.fields.word)).toEqual(['ngerasa', 'terasa']);
  });
  it('denger와 dengar처럼 구어 철자가 다른 어근을 정규화한다', () => {
    const words = [n('1', 'denger'), n('2', 'dengerin', 'dengar'), n('3', 'kedengeran', 'dengar')];
    expect(familyRoot(words[0]!)).toBe('dengar');
    expect(findWordFamily(words[1]!, words).relatives.map((x) => x.fields.word)).toEqual(['denger', 'kedengeran']);
  });
  it('다른 덱과 같은 말의 노트는 섞지 않는다', () => {
    const current = n('1', 'mikir', 'pikir');
    const words = [current, n('2', 'pikiran', 'pikir'), n('3', 'pikir', '', 'other'), n('4', 'pikir', '', 'deck', 'basic')];
    expect(findWordFamily(current, words).relatives.map((x) => x.id)).toEqual(['2']);
  });
  it('비슷한 뜻이지만 다른 어근과 우연히 -in으로 끝나는 말은 연결하지 않는다', () => {
    const words = [n('1', 'bawa'), n('2', 'jemput'), n('3', 'bikin'), n('4', 'dingin')];
    for (const word of words) expect(findWordFamily(word, words).relatives).toEqual([]);
  });
  it('어근이 명시되지 않은 여러 단어 표현을 임의 분석하지 않는다', () => {
    const words = [n('1', 'ngasih tau'), n('2', 'kasih')];
    expect(findWordFamily(words[0]!, words).relatives).toEqual([]);
    const explicit = n('3', 'ngasih tau', 'kasih');
    expect(findWordFamily(explicit, [...words, explicit]).relatives.map((x) => x.id)).toEqual(['2']);
  });
});
