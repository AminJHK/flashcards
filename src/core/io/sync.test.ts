import { describe, expect, it } from 'vitest';
import { createNote } from '../model/notes';
import type { Deck, ReviewLog } from '../model/types';
import { createFsrs6 } from '../scheduler/fsrs6';
import { deck as mkDeck, review, T0 } from '../testUtil';
import { mergeSync, parseSyncFile, makeSyncFile, sharedSettings, type SyncData } from './sync';
import { DEFAULT_SETTINGS } from '../model/types';

const sched = createFsrs6({ desiredRetention: 0.9 });
const d: Deck = { ...mkDeck('d'), createdAt: T0 };
const word = (i: number, at = T0) => createNote(d, 'zh-word', { hanzi: `字${i}`, meaning: `뜻${i}` }, at, sched);
const empty = (): SyncData => ({ decks: [], notes: [], cards: [], reviewLogs: [], tombstones: [] });

describe('기기 사이 동기화 (합치기)', () => {
  it('복습 기록은 두 기기 것을 모두 합치고, 같은 기록은 하나로', () => {
    const w = word(1);
    const a: SyncData = { ...empty(), decks: [d], notes: [w.note], cards: w.cards, reviewLogs: [review(w.cards[0]!.id, 3, T0 + 1)] };
    const shared: ReviewLog = review(w.cards[0]!.id, 1, T0 + 2);
    a.reviewLogs.push(shared);
    const b: SyncData = { ...empty(), decks: [d], notes: [w.note], cards: w.cards, reviewLogs: [shared, review(w.cards[0]!.id, 4, T0 + 3)] };
    const m = mergeSync(a, b);
    expect(m.reviewLogs.map((l) => l.at)).toEqual([T0 + 1, T0 + 2, T0 + 3]);
  });

  it('같은 단어를 두 기기에서 고쳤으면 더 나중에 고친 쪽', () => {
    const w = word(1);
    const older = { ...w.note, fields: { ...w.note.fields, meaning: '예전 뜻' }, updatedAt: T0 + 10 };
    const newerNote = { ...w.note, fields: { ...w.note.fields, meaning: '새 뜻' }, updatedAt: T0 + 20 };
    const a: SyncData = { ...empty(), decks: [d], notes: [newerNote], cards: w.cards };
    const b: SyncData = { ...empty(), decks: [d], notes: [older], cards: w.cards };
    expect(mergeSync(a, b).notes[0]!.fields.meaning).toBe('새 뜻');
    expect(mergeSync(b, a).notes[0]!.fields.meaning).toBe('새 뜻');
  });

  it('한 기기에서 지운 단어는 다른 기기에 남아 있어도 되살리지 않는다 (지운 뒤에 고친 게 아니면)', () => {
    const w1 = word(1);
    const w2 = word(2);
    const phone: SyncData = { ...empty(), decks: [d], notes: [w2.note], cards: w2.cards, tombstones: [{ id: w1.note.id, kind: 'note', at: T0 + 100 }] };
    const pc: SyncData = { ...empty(), decks: [d], notes: [w1.note, w2.note], cards: [...w1.cards, ...w2.cards] };
    const m = mergeSync(phone, pc);
    expect(m.notes.map((n) => n.id)).toEqual([w2.note.id]);
    expect(m.cards.every((c) => c.noteId === w2.note.id)).toBe(true);
    // 지운 뒤에 다른 기기에서 고쳤으면 살린다
    const edited = { ...w1.note, updatedAt: T0 + 200 };
    expect(mergeSync(phone, { ...pc, notes: [edited, w2.note] }).notes.map((n) => n.id).sort()).toEqual([w1.note.id, w2.note.id].sort());
  });

  it('덱을 지우면 그 덱의 단어도 빠진다', () => {
    const w = word(1);
    const a: SyncData = { ...empty(), tombstones: [{ id: d.id, kind: 'deck', at: T0 + 50 }] };
    const b: SyncData = { ...empty(), decks: [d], notes: [w.note], cards: w.cards };
    const m = mergeSync(a, b);
    expect(m.decks).toEqual([]);
    expect(m.notes).toEqual([]);
    expect(m.cards).toEqual([]);
  });

  it('어느 순서로 합쳐도, 여러 번 합쳐도 결과가 같다', () => {
    const w1 = word(1);
    const w2 = word(2);
    const renamed: Deck = { ...d, name: '새 이름', updatedAt: T0 + 5 };
    const a: SyncData = { ...empty(), decks: [renamed], notes: [w1.note], cards: w1.cards, reviewLogs: [review(w1.cards[0]!.id, 3, T0 + 1)] };
    const b: SyncData = { ...empty(), decks: [d], notes: [w2.note], cards: w2.cards, reviewLogs: [review(w2.cards[0]!.id, 3, T0 + 2)] };
    const ab = mergeSync(a, b);
    expect(mergeSync(b, a)).toEqual(ab);
    expect(mergeSync(ab, a)).toEqual(ab);
    expect(ab.decks[0]!.name).toBe('새 이름');
    expect(ab.notes).toHaveLength(2);
  });

  it('동기화 파일: 키와 Drive 연결, 기기 음성은 넣지 않는다', () => {
    const s = { ...DEFAULT_SETTINGS, gemini: { apiKey: 'SECRET', ttsModel: 'x', voice: 'Kore', useTts: true, useStt: true }, googleDrive: { clientId: 'CID' }, voices: { 'es-ES': 'v' } };
    const f = makeSyncFile(empty(), s, T0);
    const text = JSON.stringify(f);
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('CID');
    expect(sharedSettings(s)).not.toHaveProperty('voices');
    expect(parseSyncFile(text).data.tombstones).toEqual([]);
    expect(() => parseSyncFile('{"format":"other"}')).toThrow();
  });
});
