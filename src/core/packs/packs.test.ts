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
    for (const n of pack.notes.filter((x) => x.typeId.startsWith('zh-'))) {
      expect(n.fields.zh, n.fields.ko).toMatch(HAN);
      expect(n.fields.zh).not.toMatch(HANGUL);
      expect(n.fields.ko, n.fields.zh).toMatch(HANGUL);
    }
  });

  it('같은 문장이 두 번 들어 있지 않다', () => {
    const seen = new Map<string, string>();
    for (const n of pack.notes) {
      const key = `${n.typeId}:${getCardType(n.typeId).duplicateKey(n.fields)}`;
      expect(seen.has(key), `중복: ${key}`).toBe(false);
      seen.set(key, key);
    }
  });

  it('덱 기본 카드 종류가 있다', () => {
    expect(hasCardType(pack.deckSettings.defaultTypeId)).toBe(true);
  });
});

describe('여행 스페인어', () => {
  const pack = PACKS.find((p) => p.id === 'spanish-travel-es')!;

  it('앞면은 스페인어, 뒷면은 영어 뜻이다 (한글 없음)', () => {
    expect(pack.deckSettings.langs).toEqual({ front: 'es-ES', back: 'en-US' });
    for (const n of pack.notes) {
      expect(n.typeId).toBe('basic');
      for (const f of ['front', 'back', 'memo']) expect(n.fields[f] ?? '', n.fields.front).not.toMatch(HANGUL);
      expect(n.fields.back, n.fields.front).toMatch(/^[a-z(]/i);
    }
  });

  it('남녀 형태를 같이 적은 명사는 「el … / la …」 모양이다', () => {
    for (const n of pack.notes.filter((x) => x.fields.front!.includes('/'))) {
      expect(n.fields.front).toMatch(/^el \S+ \/ la \S+$/);
    }
  });

  it('영어 뜻이 서로 겹치지 않는다 (영어 → 스페인어로 볼 때 같은 카드처럼 보이지 않게)', () => {
    // 쉼표·세미콜론·빗금으로 나눈 뜻 조각(괄호 안 설명 포함)이 두 단어에 똑같이 들어 있으면 안 된다
    const parts = (s: string) => {
      const out: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of s.toLowerCase()) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth === 0 && /[;,/]/.test(ch)) {
          out.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      out.push(cur.trim());
      return out.filter(Boolean);
    };
    const seen = new Map<string, string>();
    for (const n of pack.notes) {
      for (const p of parts(n.fields.back!)) {
        expect(seen.get(p), `"${p}": ${seen.get(p)} / ${n.fields.front}`).toBeUndefined();
        seen.set(p, n.fields.front!);
      }
    }
  });

  it('명사는 관사와 함께, 동사는 원형(-ar/-er/-ir)으로 들어 있다', () => {
    for (const n of pack.notes) {
      const front = n.fields.front!;
      if (n.tags.includes('명사')) expect(front, front).toMatch(/^(el|la|los|las) \S/);
      else {
        expect(n.tags).toContain('동사');
        expect(front, front).toMatch(/^[a-zñ]*(ar|er|ir|ír)(se)?$/);
      }
    }
  });
});

describe('스페인어 불규칙 동사 변화', () => {
  const pack = PACKS.find((p) => p.id === 'spanish-irregular-es')!;

  it('여섯 인칭 변화형이 모두 있고 인칭 어미가 맞다', () => {
    for (const n of pack.notes) {
      const f = n.fields;
      const label = `${f.verb} ${f.tense}`;
      expect(n.typeId).toBe('es-conj');
      for (const k of ['yo', 'tu', 'el', 'nos', 'vos', 'ellos']) expect(f[k]?.trim(), `${label} ${k}`).toBeTruthy();
      expect(f.nos, label).toMatch(/mos$/);
      expect(f.vos, label).toMatch(/(is|ís)$/);
      expect(f.ellos, label).toMatch(/n$/);
      for (const k of ['verb', 'meaning', 'tense', 'yo', 'tu', 'el', 'nos', 'vos', 'ellos', 'memo']) expect(f[k] ?? '', label).not.toMatch(HANGUL);
    }
  });

  it('현재형이 과거형보다 앞에 있다', () => {
    const lastPresent = pack.notes.map((n) => n.fields.tense).lastIndexOf('presente');
    const firstPast = pack.notes.findIndex((n) => n.fields.tense !== 'presente');
    expect(lastPresent).toBeLessThan(firstPast);
  });

  it('카드 화면: 앞면은 동사와 시제, 뒷면은 대명사가 붙은 여섯 줄이고 한 번에 읽는다', () => {
    const type = getCardType('es-conj');
    const n = pack.notes.find((x) => x.fields.verb === 'tener' && x.fields.tense === 'presente')!;
    const deck = { id: 'd', name: 'x', createdAt: 0, settings: pack.deckSettings };
    const v = type.view('forward', { fields: n.fields, deck });
    expect(v.front.map((b) => ('text' in b ? b.text : ''))).toEqual(['presente', 'tener', 'to have']);
    const lines = v.back.filter((b) => b.kind === 'sentence').map((b) => ('text' in b ? b.text : ''));
    expect(lines).toEqual(['yo tengo', 'tú tienes', 'él tiene', 'nosotros tenemos', 'vosotros tenéis', 'ellos tienen']);
    expect(v.tts.back).toEqual([{ text: lines.join(', '), lang: 'es-ES' }]);
    expect(v.tts.front).toEqual([{ text: 'tener', lang: 'es-ES' }]);
  });
});

describe('인도네시아어 구어체', () => {
  const pack = PACKS.find((p) => p.id === 'indonesian-colloquial')!;

  it('앞면(말하는 형태)·예문은 인도네시아어, 뜻·예문 뜻은 한국어이고 사용역이 정해져 있다', () => {
    for (const n of pack.notes) {
      const f = n.fields;
      expect(n.typeId).toBe('id-spoken');
      for (const k of ['word', 'standard', 'root', 'example']) expect(f[k] ?? '', `${f.word} ${k}`).not.toMatch(HANGUL);
      expect(f.meaning, f.word).toMatch(HANGUL);
      expect(f.exampleKo, f.word).toMatch(HANGUL);
      expect(f.example, f.word).toBeTruthy();
      expect(['일반', '구어', '자카르타식', '격식', '속어']).toContain(f.register);
    }
  });

  it('예문에 그 단어(또는 붙은 형태)가 들어 있다', () => {
    for (const n of pack.notes) {
      const word = n.fields.word!.toLowerCase().split(' ')[0]!;
      expect(n.fields.example!.toLowerCase(), n.fields.word).toContain(word.replace(/-.*/, ''));
    }
  });

  it('모든 단어에 영어 뜻과 자주 쓰는 표현이 있고, 표현에 그 단어가 들어 있다', async () => {
    const { parsePhrases } = await import('../cardTypes/idSpoken');
    for (const n of pack.notes) {
      const f = n.fields;
      expect(f.en, f.word).toMatch(/[a-z]/i);
      expect(f.en, f.word).not.toMatch(HANGUL);
      const items = parsePhrases(f.phrases ?? '');
      expect(items.length, f.word).toBeGreaterThan(0);
      for (const p of items) {
        expect(p.text.toLowerCase(), f.word).toContain(f.word!.toLowerCase());
        expect(p.ko, `${f.word}: ${p.text}`).toMatch(/[\p{Script=Hangul}0-9]/u);
      }
    }
    expect(pack.fillEmpty).toEqual(['en', 'phrases']);
  });
});

describe('인도네시아어 aja 연습', () => {
  it('72장, 모든 예문에 aja가 있고, 쓰임새 12가지가 번갈아 나온다', async () => {
    const { indonesianAja } = await import('./indonesianAja');
    const notes = indonesianAja.notes;
    expect(notes).toHaveLength(72);
    expect(PACKS).toContain(indonesianAja);
    for (const n of notes) {
      expect(n.typeId).toBe('id-particle');
      expect(n.fields.example!.toLowerCase(), n.fields.example).toMatch(/(^|[^a-z])aja([^a-z]|$)/);
      expect(n.fields.exampleKo, n.fields.example).toMatch(HANGUL);
    }
    expect(new Set(notes.map((n) => n.fields.example)).size).toBe(72);
    // 처음 12장은 쓰임새가 모두 다르다
    expect(new Set(notes.slice(0, 12).map((n) => n.tags[1])).size).toBe(12);
  });
});

describe('헷갈리는 말: 데려가다 묶음', () => {
  const pack = PACKS.find((p) => p.id === 'indonesian-colloquial')!;
  it('bawa · ajak · anter · jemput의 한국어 뜻이 서로 겹치지 않고, 참고에 서로를 비교한다', () => {
    const of = (w: string) => pack.notes.find((n) => n.fields.word === w)!.fields;
    const group = ['bawa', 'ajak', 'anter', 'jemput'];
    for (const w of group) {
      expect(of(w).meaning, w).not.toContain('데려가다');
      for (const other of group.filter((x) => x !== w)) expect(of(w).note, `${w} → ${other}`).toContain(other);
    }
    expect(new Set(group.map((w) => of(w).meaning)).size).toBe(group.length);
  });
});

describe('헷갈리는 말: 가져가다·가져오다·주다·받다 묶음', () => {
  const pack = PACKS.find((p) => p.id === 'indonesian-colloquial')!;
  it('물건 이동 말들의 한국어 뜻이 서로 겹치지 않고, 가져가다·가져오다는 각각 한 단어에만 있다', () => {
    const of = (w: string) => pack.notes.find((n) => n.fields.word === w)!.fields;
    const group = ['bawa', 'ambil', 'ngambil', 'kasih', 'kirim', 'nerima', 'dapet'];
    const meaning = (w: string) => of(w).meaning ?? '';
    expect(new Set(group.map(meaning)).size).toBe(group.length);
    expect(group.filter((w) => meaning(w).includes('가져가다'))).toEqual(['ambil']);
    expect(group.filter((w) => meaning(w).includes('가져오다'))).toEqual(['ngambil']);
    expect(group.filter((w) => meaning(w).includes('받다'))).toEqual(['nerima']);
    for (const w of group.filter((x) => x !== 'bawa')) for (const other of ['bawa', 'ambil', 'kasih', 'kirim']) expect(of(w).note, `${w} → ${other}`).toContain(other);
  });
});

describe('헷갈리는 말: 분명·확실·진짜 묶음', () => {
  const pack = PACKS.find((p) => p.id === 'indonesian-colloquial')!;
  const meaning = (w: string) => pack.notes.find((n) => n.fields.word === w)!.fields.meaning ?? '';
  const note = (w: string) => pack.notes.find((n) => n.fields.word === w)!.fields.note ?? '';
  const only = (group: string[], text: string) => group.filter((w) => meaning(w).includes(text));
  it('분명·확신·물론·진짜 같은 한국어 뜻이 한 단어에만 있고, 참고에 서로를 비교한다', () => {
    const cert = ['jelas', 'pasti', 'yakin', 'tentu', 'pastiin'];
    expect(new Set(cert.map(meaning)).size).toBe(cert.length);
    expect(only(cert, '분명')).toEqual(['jelas']);
    expect(only(cert, '확신')).toEqual(['yakin']);
    expect(only(cert, '물론')).toEqual(['tentu']);
    for (const w of cert) for (const o of cert.filter((x) => x !== w)) expect(note(w), `${w} → ${o}`).toContain(o);
    const real = ['bener', 'beneran', 'asli', 'sungguh', 'sumpah', 'banget', 'sebenernya'];
    expect(new Set(real.map(meaning)).size).toBe(real.length);
    expect(only(real, '진짜')).toEqual(['beneran']);
    expect(only(real, '정말')).toEqual(['sungguh']);
    for (const w of real) for (const o of real.filter((x) => x !== w)) expect(note(w), `${w} → ${o}`).toContain(o);
  });
});

