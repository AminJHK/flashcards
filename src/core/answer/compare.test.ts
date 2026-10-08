import { describe, expect, it } from 'vitest';
import { compareAnswer } from './compare';

describe('compareAnswer', () => {
  it('문장부호와 띄어쓰기는 무시한다', () => {
    const r = compareAnswer('你打算什么时候去？', '你打算 什么时候去');
    expect(r.exact).toBe(true);
    expect(r.score).toBe(1);
  });

  it('빠뜨린 글자와 틀린 글자를 표시한다', () => {
    const r = compareAnswer('你打算什么时候去', '你想什么时候去');
    expect(r.exact).toBe(false);
    expect(r.expected).toEqual([
      { op: 'same', text: '你' },
      { op: 'missing', text: '打算' },
      { op: 'same', text: '什么时候去' },
    ]);
    expect(r.given).toEqual([
      { op: 'same', text: '你' },
      { op: 'extra', text: '想' },
      { op: 'same', text: '什么时候去' },
    ]);
    expect(r.score).toBeCloseTo(6 / 8);
  });

  it('빈 답은 0점', () => {
    expect(compareAnswer('你好', '').score).toBe(0);
  });
});
