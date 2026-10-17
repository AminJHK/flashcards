import { describe, expect, it } from 'vitest';
import type { Note } from '../model/types';
import { packAdditions, packChanges } from './update';
import type { Pack } from './types';

const pack: Pack = {
  id: 'p',
  name: 'p',
  description: '',
  deckName: 'p',
  deckSettings: { defaultTypeId: 'basic', reverseEnabled: false, newPerDay: 10, autoplay: 'off', langs: { front: 'es-ES', back: 'en-US' } },
  notes: [
    { typeId: 'basic', fields: { front: 'tener', back: 'to have (own, possess)', memo: 'tengo' }, tags: ['동사'] },
    { typeId: 'basic', fields: { front: 'la casa', back: 'house, home', memo: '' }, tags: ['명사'] },
  ],
};

const note = (id: string, fields: Record<string, string>, over: Partial<Note> = {}): Note => ({
  id,
  deckId: 'd',
  typeId: 'basic',
  typeVersion: 1,
  fields,
  tags: ['동사', 'pack:p'],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('준비된 덱 업데이트', () => {
  it('꾸러미에서 바뀐 칸만 고치고, 같은 내용이면 건너뛴다', () => {
    const r = packChanges(pack, [note('a', { front: 'tener', back: 'to have', memo: 'tengo' }), note('b', { front: 'la casa', back: 'house, home', memo: '' })]);
    expect(r).toEqual([{ noteId: 'a', fields: { front: 'tener', back: 'to have (own, possess)', memo: 'tengo' } }]);
  });

  it('사용자가 고친 단어, 다른 꾸러미 단어, 꾸러미에 없는 단어는 건드리지 않는다', () => {
    const r = packChanges(pack, [
      note('a', { front: 'tener', back: 'my own meaning', memo: '' }, { updatedAt: 5 }),
      note('b', { front: 'tener', back: 'to have', memo: '' }, { tags: ['pack:other'] }),
      note('c', { front: 'el gato', back: 'cat', memo: '' }),
    ]);
    expect(r).toEqual([]);
  });
});

describe('준비된 덱에 단어가 늘었을 때', () => {
  const big: Pack = { ...pack, notes: [...pack.notes, { typeId: 'basic', fields: { front: 'el gato', back: 'cat', memo: '' }, tags: [] }, { typeId: 'basic', fields: { front: 'el perro', back: 'dog', memo: '' }, tags: [] }] };

  it('이미 받은 단어 뒤의 새 단어만 돌려준다', () => {
    const r = packAdditions(big, [note('a', { front: 'tener', back: 'x', memo: '' }), note('b', { front: 'la casa', back: 'x', memo: '' })]);
    expect(r.map((n) => n.fields.front)).toEqual(['el gato', 'el perro']);
  });

  it('사용자가 지운 단어는 다시 넣지 않고, 다른 덱(꾸러미 단어 없음)에는 아무것도 없다', () => {
    // 'tener'를 지웠어도 'la casa'까지 받은 덱이면 그 뒤만
    expect(packAdditions(big, [note('b', { front: 'la casa', back: 'x', memo: '' })]).map((n) => n.fields.front)).toEqual(['el gato', 'el perro']);
    expect(packAdditions(big, [note('c', { front: 'la casa', back: 'x', memo: '' }, { tags: [] })])).toEqual([]);
    expect(packAdditions(big, [])).toEqual([]);
    // 다 받았으면 없음
    const all = big.notes.map((pn, i) => note(`n${i}`, pn.fields));
    expect(packAdditions(big, all)).toEqual([]);
  });

  it('다른 덱(예: 연결어·표현)으로 옮긴 단어는 이미 받은 단어로 세어서, 새 단어로 다시 들어오지 않는다', () => {
    const inThisDeck = [note('1', { front: 'tener', back: 'to have (own, possess)', memo: 'tengo' })];
    const movedAway = [note('2', { front: 'la casa', back: 'house, home', memo: '' }, { deckId: 'other' })];
    // 이 덱에만 보면 뒤의 단어(la casa)가 새 단어처럼 보이지만, 모든 덱을 보면 이미 받은 단어다
    expect(packAdditions(pack, inThisDeck).map((n) => n.fields.front)).toEqual(['la casa']);
    expect(packAdditions(pack, inThisDeck, [...inThisDeck, ...movedAway])).toEqual([]);
    // 이 덱에 꾸러미 단어가 하나도 없으면 다른 덱이므로 없음
    expect(packAdditions(pack, [], movedAway)).toEqual([]);
  });
});
