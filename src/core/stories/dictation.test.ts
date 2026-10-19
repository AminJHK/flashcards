import { describe, expect, it } from 'vitest';
import { markWords, normalizeWord, pickBlanks, sameWord, wordsOf } from './dictation';

describe('받아쓰기 채점', () => {
  it('대소문자·문장부호·흔한 구어 철자 차이는 같은 말로 본다', () => {
    expect(normalizeWord('Nggak,')).toBe('nggak');
    expect(sameWord('nggak', 'gak')).toBe(true);
    expect(sameWord('udah', 'Uda')).toBe(true);
    expect(sameWord('Kamu?', 'kamu')).toBe(true);
    expect(wordsOf('Apa-apa aja, ya!')).toEqual(['apa-apa', 'aja', 'ya']);
  });

  it('5글자 이상은 한 글자 오타까지 맞은 걸로, 짧은 말은 정확히', () => {
    expect(sameWord('makanan', 'makann')).toBe(true);
    expect(sameWord('mau', 'mu')).toBe(false);
    expect(sameWord('makan', 'minum')).toBe(false);
    expect(sameWord('aku', '')).toBe(false);
  });

  it('전체 받아쓰기: 정답의 단어마다 맞았는지, 빠지거나 틀린 단어는 false', () => {
    expect(markWords('Kamu udah makan belum?', 'kamu uda makan blm')).toEqual([
      { word: 'Kamu', ok: true },
      { word: 'udah', ok: true },
      { word: 'makan', ok: true },
      { word: 'belum?', ok: false },
    ]);
    expect(markWords('Aku mau pulang.', 'aku pulang sekarang').map((m) => m.ok)).toEqual([true, false, true]);
    expect(markWords('Aku mau pulang.', '').every((m) => !m.ok)).toBe(true);
  });

  it('빈칸: 배우는 단어 → 새 단어 → 긴 단어 순으로, 긴 문장이면 2개, 같은 seed면 같은 결과', () => {
    const c = [
      { start: 0, end: 3, text: 'Aku', rank: 3 },
      { start: 4, end: 7, text: 'mau', rank: 3 },
      { start: 8, end: 14, text: 'pulang', rank: 0 },
      { start: 15, end: 22, text: 'sekarang', rank: 3 },
    ];
    expect(pickBlanks(c, 's', 4).map((b) => b.text)).toEqual(['pulang']);
    expect(pickBlanks(c, 's', 6).map((b) => b.text)).toEqual(['pulang', 'sekarang']);
    expect(pickBlanks(c, 's', 6)).toEqual(pickBlanks(c, 's', 6));
    expect(pickBlanks([{ start: 0, end: 1, text: 'a', rank: 0 }], 's', 1)).toEqual([]);
  });
});
