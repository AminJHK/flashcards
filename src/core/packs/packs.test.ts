import { describe, expect, it } from 'vitest';
import { getCardType, hasCardType } from '../cardTypes/registry';
import { missingRequired } from '../cardTypes/types';
import { PACKS } from './registry';

const HAN = /\p{Script=Han}/u;
const HANGUL = /\p{Script=Hangul}/u;

describe.each(PACKS.map((p) => [p.id, p] as const))('준비된 덱 %s', (_id, pack) => {
  it('모든 문장이 있는 카드 종류를 쓰고 필수 칸이 채워져 있다', () => {
    for (const n of pack.notes) {
      expect(hasCardType(n.typeId), n.typeId).toBe(true);
      expect(missingRequired(getCardType(n.typeId), n.fields), JSON.stringify(n.fields)).toEqual([]);
      expect(n.tags.length).toBeGreaterThan(0);
    }
  });

  it('중국어 칸은 한자, 한국어 칸은 한글이다', () => {
    for (const n of pack.notes) {
      expect(n.fields.zh, n.fields.ko).toMatch(HAN);
      expect(n.fields.zh).not.toMatch(HANGUL);
      expect(n.fields.ko, n.fields.zh).toMatch(HANGUL);
    }
  });

  it('같은 문장이 두 번 들어 있지 않다', () => {
    const seen = new Map<string, string>();
    for (const n of pack.notes) {
      const key = `${n.typeId}:${getCardType(n.typeId).duplicateKey(n.fields)}`;
      expect(seen.has(key), `중복: ${n.fields.zh}`).toBe(false);
      seen.set(key, n.fields.zh!);
    }
  });

  it('덱 기본 카드 종류가 있다', () => {
    expect(hasCardType(pack.deckSettings.defaultTypeId)).toBe(true);
  });
});
