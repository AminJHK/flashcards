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
    await repo.saveSettings({ gemini: { apiKey: 'SECRET', ttsModel: 'm', voice: 'Kore', useTts: true, useStt: true } }, d);
    const text = JSON.stringify(await repo.exportBackup(d));
    expect(text).not.toContain('SECRET');
    await repo.importBackup(parseBackup(text), d);
    expect((await repo.getSettings(d)).gemini?.apiKey).toBe('SECRET');
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
});
