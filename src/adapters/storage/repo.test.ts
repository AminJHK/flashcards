import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../../core/io/backup';
import { FlashcardsDB } from './db';
import * as repo from './repo';

let d: FlashcardsDB;
let n = 0;
beforeEach(async () => {
  d = new FlashcardsDB(`test-${++n}`);
  await d.open();
});

const settings = { defaultTypeId: 'zh-word', reverseEnabled: false, newPerDay: 20, autoplay: 'back' as const, langs: { front: 'zh-CN', back: 'ko-KR' } };

describe('repo', () => {
  it('노트를 추가하면 템플릿마다 카드가 생기고, 선택 템플릿은 숨겨진다', async () => {
    const deck = await repo.createDeck('HSK', settings, d);
    const note = await repo.addNote(deck.id, 'zh-word', { hanzi: '书', meaning: '책' }, d);
    const cards = await d.cards.where('noteId').equals(note.id).toArray();
    expect(cards.map((c) => [c.templateId, c.hidden]).sort()).toEqual([['forward', false], ['reverse', true]]);
  });

  it('복습 → 되돌리기 → 상태가 처음으로 돌아가고 로그는 남는다', async () => {
    const deck = await repo.createDeck('HSK', settings, d);
    const note = await repo.addNote(deck.id, 'zh-word', { hanzi: '书', meaning: '책' }, d);
    const card = (await d.cards.where('noteId').equals(note.id).toArray()).find((c) => c.templateId === 'forward')!;
    const logId = await repo.recordReview(card.id, 3, 1200, d);
    expect((await d.cards.get(card.id))!.phase).toBe('learning');
    await repo.undoReview(logId, d);
    const after = (await d.cards.get(card.id))!;
    expect(after.phase).toBe('new');
    expect(after.reps).toBe(0);
    expect(await d.reviewLogs.count()).toBe(2); // review + void
  });

  it('역방향 스위치를 켜고 끄면 카드가 보였다 숨겨지고 기록은 유지된다', async () => {
    const deck = await repo.createDeck('HSK', settings, d);
    const note = await repo.addNote(deck.id, 'zh-word', { hanzi: '书', meaning: '책' }, d);
    await repo.updateDeck(deck.id, { settings: { reverseEnabled: true } }, d);
    const rev = (await d.cards.where('noteId').equals(note.id).toArray()).find((c) => c.templateId === 'reverse')!;
    expect(rev.hidden).toBe(false);
    await repo.recordReview(rev.id, 3, undefined, d);
    await repo.updateDeck(deck.id, { settings: { reverseEnabled: false } }, d);
    expect((await d.cards.get(rev.id))!.hidden).toBe(true);
    await repo.updateDeck(deck.id, { settings: { reverseEnabled: true } }, d);
    const back = (await d.cards.get(rev.id))!;
    expect(back.hidden).toBe(false);
    expect(back.reps).toBe(1);
  });

  it('정방향 스위치를 끄면 역방향만 보이고, 다시 켜면 기록과 함께 돌아온다', async () => {
    const deck = await repo.createDeck('ES', { ...settings, defaultTypeId: 'basic', reverseEnabled: true, forwardEnabled: false }, d);
    const note = await repo.addNote(deck.id, 'basic', { front: 'la casa', back: 'house' }, d);
    const cards = await d.cards.where('noteId').equals(note.id).toArray();
    const fwd = cards.find((c) => c.templateId === 'forward')!;
    const rev = cards.find((c) => c.templateId === 'reverse')!;
    expect([fwd.hidden, rev.hidden]).toEqual([true, false]);
    await repo.recordReview(rev.id, 3, undefined, d);
    await repo.updateDeck(deck.id, { settings: { forwardEnabled: true } }, d);
    expect((await d.cards.get(fwd.id))!.hidden).toBe(false);
    await repo.updateDeck(deck.id, { settings: { forwardEnabled: false } }, d);
    expect((await d.cards.get(fwd.id))!.hidden).toBe(true);
    expect((await d.cards.get(rev.id))!.reps).toBe(1);
  });

  it('백업을 내보내고 다른 DB로 가져오면 같은 상태가 된다', async () => {
    const deck = await repo.createDeck('HSK', settings, d);
    const note = await repo.addNote(deck.id, 'zh-word', { hanzi: '书', meaning: '책' }, d);
    const card = (await d.cards.where('noteId').equals(note.id).toArray())[0]!;
    await repo.recordReview(card.id, 3, undefined, d);
    await repo.recordReview(card.id, 3, undefined, d);
    const backup = parseBackup(JSON.stringify(await repo.exportBackup(d)));

    const other = new FlashcardsDB(`test-${++n}`);
    await repo.importBackup(backup, other);
    const a = await d.cards.get(card.id);
    const b = await other.cards.get(card.id);
    expect(b!.due).toBe(a!.due);
    expect(b!.memory).toEqual(a!.memory);
    expect(await other.notes.count()).toBe(1);
  });

  it('덱을 옮기면 카드도 따라간다', async () => {
    const a = await repo.createDeck('A', settings, d);
    const b = await repo.createDeck('B', { ...settings, reverseEnabled: true }, d);
    const note = await repo.addNote(a.id, 'zh-word', { hanzi: '书', meaning: '책' }, d);
    await repo.updateNote(note.id, { deckId: b.id }, d);
    const cards = await d.cards.where('noteId').equals(note.id).toArray();
    expect(cards.every((c) => c.deckId === b.id && !c.hidden)).toBe(true);
  });

  it('백업 파일에는 Gemini 키를 넣지 않고, 복원해도 이 기기의 키는 남는다', async () => {
    await repo.saveSettings({ gemini: { apiKey: 'SECRET', ttsModel: 'm', voice: 'Kore', useTts: true, useStt: true }, googleDrive: { clientId: 'CID.apps.googleusercontent.com' } }, d);
    const text = JSON.stringify(await repo.exportBackup(d));
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('CID.apps');
    await repo.importBackup(parseBackup(text), d);
    expect((await repo.getSettings(d)).gemini?.apiKey).toBe('SECRET');
    expect((await repo.getSettings(d)).googleDrive?.clientId).toBe('CID.apps.googleusercontent.com');
  });

  it('준비된 덱을 설치하면 문장 순서대로 카드가 생기고 병음이 채워진다', async () => {
    const { cardiacNursingZh } = await import('../../core/packs/cardiacNursingZh');
    const deck = await repo.installPack(cardiacNursingZh, { pinyin: (t) => `py:${t}` }, d);
    const notes = await d.notes.where('deckId').equals(deck.id).sortBy('createdAt');
    expect(notes).toHaveLength(cardiacNursingZh.notes.length);
    expect(notes[0]!.fields.zh).toBe(cardiacNursingZh.notes[0]!.fields.zh);
    expect(notes[0]!.fields.pinyin).toBe(`py:${cardiacNursingZh.notes[0]!.fields.zh}`);
    expect(notes[0]!.tags).toContain('pack:cardiac-nursing-zh');
    const visible = (await d.cards.where('deckId').equals(deck.id).toArray()).filter((c) => !c.hidden);
    expect(visible).toHaveLength(cardiacNursingZh.notes.length); // 역방향은 꺼져 있다
  });

  it('설치한 준비된 덱에 새 단어를 뒤에 이어서 넣는다 (새 카드도 그 뒤에 나온다)', async () => {
    const { indonesianColloquial: full } = await import('../../core/packs/indonesianColloquial');
    const { packAdditions } = await import('../../core/packs/update');
    const first = { ...full, notes: full.notes.slice(0, 100) };
    const deck = await repo.installPack(first, { pinyin: (t) => t }, d);
    const before = await d.notes.where('deckId').equals(deck.id).toArray();
    const more = packAdditions(full, before);
    expect(more).toHaveLength(full.notes.length - 100);
    expect(await repo.addPackNotes(deck.id, full, more, { pinyin: (t) => t }, d)).toBe(more.length);
    const notes = await d.notes.where('deckId').equals(deck.id).sortBy('createdAt');
    expect(notes.map((n) => n.fields.word)).toEqual(full.notes.map((n) => n.fields.word));
    expect(packAdditions(full, notes)).toEqual([]);
  });

  it('동기화: 다른 기기의 단어와 복습 기록을 합치고, 지운 것은 지운 채로 두고, 카드 상태는 기록으로 다시 계산한다', async () => {
    const deck = await repo.createDeck('HSK', settings, d);
    const mine = await repo.addNote(deck.id, 'zh-word', { hanzi: '书', meaning: '책' }, d);
    const gone = await repo.addNote(deck.id, 'zh-word', { hanzi: '笔', meaning: '펜' }, d);
    const myCard = (await d.cards.where('noteId').equals(mine.id).toArray())[0]!;
    await repo.recordReview(myCard.id, 3, undefined, d);

    // 다른 기기: 같은 덱에 단어 하나를 더 넣고, 내 카드도 한 번 복습했다. 이 기기에서는 '笔'를 지운다
    const other = new FlashcardsDB(`test-${++n}`);
    const remote = await repo.exportSyncData(d);
    await repo.deleteNote(gone.id, d);
    const extra = { ...mine, id: 'other-note', fields: { ...mine.fields, hanzi: '茶', meaning: '차' } };
    const extraCards = remote.cards.filter((c) => c.noteId === mine.id).map((c) => ({ ...c, id: `${c.id}-o`, noteId: 'other-note' }));
    const theirLog = { id: 'their-log', cardId: myCard.id, kind: 'review' as const, rating: 3 as const, at: Date.now() + 60_000, tzOffsetMin: 0, scheduler: 'x' };
    const merged = await repo.mergeIntoLocal({ ...remote, notes: [...remote.notes, extra], cards: [...remote.cards, ...extraCards], reviewLogs: [...remote.reviewLogs, theirLog] }, d);

    const notes = await d.notes.toArray();
    expect(notes.map((x) => x.fields.hanzi).sort()).toEqual(['书', '茶']);
    expect(await d.reviewLogs.count()).toBe(2);
    expect((await d.cards.get(myCard.id))!.reps).toBe(2);
    expect(merged.tombstones.map((t) => t.id)).toContain(gone.id);
    other.close();
  });

  it('연결어 옮기기: 연결어만 새 덱으로 가고, 복습 기록·기억 상태가 그대로 따라가며, 다시 눌러도 덱이 늘지 않는다', async () => {
    const idSettings = { defaultTypeId: 'id-spoken', reverseEnabled: false, newPerDay: 10, autoplay: 'front' as const, langs: { front: 'id-ID', back: 'ko-KR' } };
    const main = await repo.createDeck('인도네시아어 구어체', idSettings, d);
    const f = (word: string, meaning: string) => ({ word, meaning, example: `Contoh ${word}.`, exampleKo: '예' });
    const aku = await repo.addNote(main.id, 'id-spoken', f('aku', '나'), d);
    const pok = await repo.addNote(main.id, 'id-spoken', f('pokoknya', '아무튼'), d); // 목록에 있는 말
    await repo.addNote(main.id, 'id-spoken', f('supaya', '~하도록'), d);
    const yang = await repo.addNote(main.id, 'id-spoken', f('yang', '~하는'), d); // 기본 단어는 옮기지 않는다
    const card = (await d.cards.where('noteId').equals(pok.id).toArray())[0]!;
    await repo.recordReview(card.id, 3, 900, d);
    const before = (await d.cards.get(card.id))!;

    const r = await repo.moveConnectors(main.id, d);
    expect(r.moved).toBe(2);
    expect(r.deck.name).toBe('연결어·표현');
    expect(r.deck.settings).toMatchObject({ newPerDay: 3, sentenceFirst: true, defaultTypeId: 'id-spoken' });
    expect((await d.notes.get(aku.id))!.deckId).toBe(main.id);
    expect((await d.notes.get(yang.id))!.deckId).toBe(main.id);
    expect((await d.notes.get(pok.id))!.deckId).toBe(r.deck.id);
    const after = (await d.cards.get(card.id))!;
    expect(after.deckId).toBe(r.deck.id);
    expect([after.reps, after.phase, after.due, after.memory]).toEqual([before.reps, before.phase, before.due, before.memory]);
    expect(await d.reviewLogs.where('cardId').equals(card.id).count()).toBe(1);

    const again = await repo.moveConnectors(main.id, d);
    expect(again.moved).toBe(0);
    expect((await d.decks.toArray()).filter((x) => x.name === '연결어·표현')).toHaveLength(1);
  });
});
