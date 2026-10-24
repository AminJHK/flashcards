import { describe, expect, it } from 'vitest';
import { PACKS } from '../packs/registry';
import { getCardType } from '../cardTypes/registry';
import { SPOKEN_OF } from '../stories/formalForms';
import { SAME_WORDS, sameMainOf } from './sameWords';
import { synonymGroupOf } from './synonymGroups';

describe('뜻이 거의 같은 구어 짝', () => {
  const pack = PACKS.find((p) => p.id === 'indonesian-colloquial')!;
  const words = new Set(pack.notes.map((n) => n.fields.word));

  it('모든 말이 덱에 있고, 한 말은 한 짝에만, 비슷한 말 묶음·표준어 짝과 겹치지 않는다', () => {
    const seen = new Set<string>();
    for (const [main, others] of Object.entries(SAME_WORDS)) {
      for (const w of [main, ...others]) {
        expect(words.has(w), w).toBe(true);
        expect(seen.has(w), w).toBe(false);
        seen.add(w);
        expect(synonymGroupOf(w), w).toBeUndefined();
        expect(SPOKEN_OF[w], w).toBeUndefined();
      }
    }
    expect(sameMainOf('kelar')).toBe('selesai');
    expect(sameMainOf('selesai')).toBeUndefined();
  });

  it('카드: 대표가 아닌 말은 대표를 강조색 짝으로, 대표는 아래에 "같은 말"', () => {
    const t = getCardType('id-spoken');
    const d = { id: 'd', name: 'd', createdAt: 0, settings: { defaultTypeId: 'id-spoken', reverseEnabled: false, newPerDay: 10, autoplay: 'off' as const, langs: { front: 'id-ID', back: 'ko-KR' } } };
    const kelar = t.view('forward', { fields: { word: 'kelar', meaning: '끝나다', standard: 'selesai', register: '자카르타식' }, deck: d });
    expect(kelar.back[0]).toMatchObject({ pair: { text: 'selesai', label: '같은 말 · 말할 때' } });
    const selesai = t.view('forward', { fields: { word: 'selesai', meaning: '끝나다', register: '일반' }, deck: d });
    expect(selesai.back[0]).toMatchObject({ same: 'kelar' });
    expect(selesai.back[0]).not.toHaveProperty('pair');
    expect(kelar.front).toEqual([{ kind: 'word', text: 'kelar', size: 'front', lang: 'id-ID' }]);
  });
});
