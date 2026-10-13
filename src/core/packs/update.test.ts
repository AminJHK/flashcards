import { describe, expect, it } from 'vitest';
import type { Note } from '../model/types';
import { packChanges } from './update';
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
