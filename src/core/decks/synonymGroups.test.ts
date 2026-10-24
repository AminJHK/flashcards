import { describe, expect, it } from 'vitest';
import { PACKS } from '../packs/registry';
import { SPOKEN_OF } from '../stories/formalForms';
import { SYNONYM_GROUPS, synonymGroupOf } from './synonymGroups';

describe('비슷한 말 묶음 (연결어)', () => {
  const pack = PACKS.find((p) => p.id === 'indonesian-colloquial')!;
  const note = (w: string) => pack.notes.find((n) => n.fields.word === w)?.fields;

  it('묶음마다 대표 구어가 하나, 모든 단어가 덱에 있고, 한 단어는 한 묶음에만, 같은 묶음 안의 한국어 뜻은 서로 다르다', () => {
    const seen = new Set<string>();
    for (const grp of SYNONYM_GROUPS) {
      expect(grp.members.filter((m) => m.role === 'main'), grp.title).toHaveLength(1);
      const meanings = grp.members.map((m) => {
        expect(note(m.word), `${grp.title}: ${m.word}`).toBeDefined();
        expect(seen.has(m.word), m.word).toBe(false);
        seen.add(m.word);
        return note(m.word)!.meaning;
      });
      expect(new Set(meanings).size, grp.title).toBe(meanings.length);
    }
  });

  it('대표는 구어로 쓰는 말이고, 글말은 이야기 대화에서 같은 묶음의 구어로 바뀐다 (SPOKEN_OF)', () => {
    for (const grp of SYNONYM_GROUPS) {
      const main = grp.members.find((m) => m.role === 'main')!;
      expect(SPOKEN_OF[main.word], main.word).toBeUndefined();
      for (const m of grp.members.filter((x) => x.role === 'written')) {
        expect(grp.members.map((x) => x.word), `${m.word} → ${SPOKEN_OF[m.word]}`).toContain(SPOKEN_OF[m.word]);
      }
    }
    expect(synonymGroupOf('Sehingga')!.title).toMatch(/그래서/);
  });
});
