import { describe, expect, it } from 'vitest';
import { indonesianColloquial } from '../packs/indonesianColloquial';
import { CONNECTOR_WORDS, isConnector } from './connectors';

describe('연결어·표현', () => {
  const words = new Set(indonesianColloquial.notes.map((n) => n.fields.word));

  it('목록의 말은 (철자 변형 하나 빼고) 모두 인도네시아어 구어체 덱에 있는 말이다', () => {
    const missing = CONNECTOR_WORDS.filter((w) => !words.has(w) && w !== 'sebenarnya');
    expect(missing).toEqual([]);
  });

  it('뜻이 고정된 기본 단어(yang, di, ke, dari, dan, tapi, atau …)는 옮기지 않는다', () => {
    for (const w of ['yang', 'di', 'ke', 'dari', 'dan', 'tapi', 'atau', 'sama', 'cuma', 'buat', 'kalo', 'karena', 'gitu', 'gini', 'kayak']) {
      expect(isConnector({ typeId: 'id-spoken', fields: { word: w } }), w).toBe(false);
    }
    for (const w of ['pokoknya', 'supaya', 'kayaknya', 'pasti', 'biar', 'ternyata']) expect(isConnector({ typeId: 'id-spoken', fields: { word: w } }), w).toBe(true);
  });

  it('다른 카드 종류는 옮기지 않는다', () => {
    expect(isConnector({ typeId: 'basic', fields: { word: 'pokoknya' } })).toBe(false);
    expect(isConnector({ typeId: 'id-particle', fields: { word: 'pasti' } })).toBe(false);
  });

  it('덱에서는 이 말을 꽤 모아서 옮길 만하다 (40개 안팎)', () => {
    const n = indonesianColloquial.notes.filter((x) => isConnector({ typeId: x.typeId, fields: x.fields })).length;
    expect(n).toBeGreaterThanOrEqual(35);
    expect(n).toBeLessThanOrEqual(45);
  });
});
