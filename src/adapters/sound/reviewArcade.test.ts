import { describe, expect, it } from 'vitest';
import { advanceCombo, comboTier } from './reviewArcade';

describe('review arcade combo', () => {
  it('increases for Good and Easy and caps the sound stage at 10', () => {
    let n = 0;
    for (let i = 0; i < 12; i++) n = advanceCombo(n, i % 2 ? 4 : 3);
    expect(n).toBe(12);
    expect([0, 1, 2, 3, 5, 6, 9, 10, 12].map(comboTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('drops one stage on Hard, resets on Again', () => {
    expect(advanceCombo(10, 2)).toBe(9);
    expect(advanceCombo(9, 2)).toBe(5);
    expect(advanceCombo(5, 2)).toBe(2);
    expect(advanceCombo(2, 2)).toBe(0);
    expect(advanceCombo(10, 1)).toBe(0);
  });

  it('allows combo to be reconstructed after Undo', () => {
    const ratings = [3, 4, 3, 1, 4, 4, 3] as const;
    const calculate = (answers: readonly (1 | 2 | 3 | 4)[]) => answers.reduce(advanceCombo, 0);
    expect(calculate(ratings)).toBe(3);
    expect(calculate(ratings.slice(0, -1))).toBe(2);
  });
});
