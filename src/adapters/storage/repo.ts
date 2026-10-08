import { getCardType } from '../../core/cardTypes/registry';
import type { DeriveDeps } from '../../core/cardTypes/types';
import type { Pack } from '../../core/packs/types';
import { makeBackup, type Backup } from '../../core/io/backup';
import { newId } from '../../core/model/ids';
import { cardsForNote, createNote, trimFields } from '../../core/model/notes';
import { DEFAULT_SETTINGS, type Card, type Deck, type DeckSettings, type Id, type Note, type Rating, type ReviewLog, type Settings } from '../../core/model/types';
import { applyReview, withState } from '../../core/scheduler/queue';
import { rebuildFromLogs } from '../../core/scheduler/rebuild';
import { createScheduler } from '../../core/scheduler/registry';
import type { Scheduler } from '../../core/scheduler/types';
import { db, type FlashcardsDB } from './db';

/**
 * 저장소 작업 모음. 화면은 db를 직접 고치지 않고 여기 함수만 부른다.
 * ReviewLog는 추가만 한다 (CLAUDE.md 절대 규칙).
 */

const tz = () => new Date().getTimezoneOffset();

export async function getSettings(d: FlashcardsDB = db): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await d.settings.get('settings')) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>, d: FlashcardsDB = db): Promise<void> {
  const cur = await getSettings(d);
  await d.settings.put({ ...cur, ...patch, id: 'settings' });
}

export function schedulerFor(s: Settings): Scheduler {
  return createScheduler(s.schedulerId, { desiredRetention: s.desiredRetention, params: s.fsrsParams });
}

// ---------------- 덱 ----------------

export async function createDeck(name: string, settings: DeckSettings, d: FlashcardsDB = db): Promise<Deck> {
  const deck: Deck = { id: newId(), name: name.trim(), createdAt: Date.now(), settings };
  await d.decks.add(deck);
  return deck;
}

/** 덱 설정을 바꾼다. 역방향 스위치가 바뀌면 카드의 hidden을 맞춘다 (기록은 그대로). */
export async function updateDeck(id: Id, patch: { name?: string; settings?: Partial<DeckSettings> }, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const deck = await d.decks.get(id);
    if (!deck) return;
    const next: Deck = { ...deck, name: patch.name?.trim() || deck.name, settings: { ...deck.settings, ...patch.settings } };
    await d.decks.put(next);
    if (next.settings.reverseEnabled !== deck.settings.reverseEnabled) {
      const sched = schedulerFor(await getSettings(d));
      const now = Date.now();
      const notes = await d.notes.where('deckId').equals(id).toArray();
      const cards = await d.cards.where('deckId').equals(id).toArray();
      const changed = notes.flatMap((n) => cardsForNote(n, cards.filter((c) => c.noteId === n.id), next, now, sched));
      await d.cards.bulkPut(changed);
    }
  });
}

export async function deleteDeck(id: Id, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.decks, d.notes, d.cards], async () => {
    await d.cards.where('deckId').equals(id).delete();
    await d.notes.where('deckId').equals(id).delete();
    await d.decks.delete(id);
  });
}

// ---------------- 노트 ----------------

export async function addNote(deckId: Id, typeId: string, fields: Record<string, string>, d: FlashcardsDB = db): Promise<Note> {
  return d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const deck = await d.decks.get(deckId);
    if (!deck) throw new Error('덱을 찾을 수 없어요');
    const { note, cards } = createNote(deck, typeId, fields, Date.now(), schedulerFor(await getSettings(d)));
    await d.notes.add(note);
    await d.cards.bulkAdd(cards);
    return note;
  });
}

export async function updateNote(
  id: Id,
  patch: { fields?: Record<string, string>; deckId?: Id; ttsOverride?: Record<string, string> },
  d: FlashcardsDB = db,
): Promise<void> {
  await d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const note = await d.notes.get(id);
    if (!note) return;
    const type = getCardType(note.typeId);
    const next: Note = {
      ...note,
      fields: patch.fields ? trimFields(type, patch.fields) : note.fields,
      deckId: patch.deckId ?? note.deckId,
      ttsOverride: patch.ttsOverride ?? note.ttsOverride,
      updatedAt: Date.now(),
    };
    await d.notes.put(next);
    if (next.deckId !== note.deckId) {
      const deck = await d.decks.get(next.deckId);
      if (!deck) throw new Error('덱을 찾을 수 없어요');
      const cards = await d.cards.where('noteId').equals(id).toArray();
      const changed = cardsForNote(next, cards, deck, Date.now(), schedulerFor(await getSettings(d)));
      await d.cards.bulkPut(changed);
    }
  });
}

/** 노트와 카드를 지운다. 복습 로그는 남긴다 (나중에 파라미터 최적화에 쓸 수 있음). */
export async function deleteNote(id: Id, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.notes, d.cards], async () => {
    await d.cards.where('noteId').equals(id).delete();
    await d.notes.delete(id);
  });
}

/**
 * 준비된 덱을 설치한다. 덱을 새로 만들고 문장을 순서대로 넣는다 (새 카드도 이 순서로 나온다).
 * 병음 같은 자동 필드는 deps로 채운다.
 */
export async function installPack(pack: Pack, deps: DeriveDeps, d: FlashcardsDB = db): Promise<Deck> {
  return d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const now = Date.now();
    const deck: Deck = { id: newId(), name: pack.deckName, createdAt: now, settings: { ...pack.deckSettings } };
    await d.decks.add(deck);
    const sched = schedulerFor(await getSettings(d));
    const notes: Note[] = [];
    const cards: Card[] = [];
    pack.notes.forEach((pn, i) => {
      const type = getCardType(pn.typeId);
      let fields = { ...pn.fields };
      for (const src of new Set(type.fields.map((f) => f.autoFrom).filter(Boolean) as string[])) {
        const patch = type.derive?.(src, fields, deps) ?? {};
        // 꾸러미에 직접 적힌 값이 있으면 그걸 쓴다
        fields = { ...fields, ...Object.fromEntries(Object.entries(patch).filter(([k]) => !fields[k]?.trim())) };
      }
      const made = createNote(deck, pn.typeId, fields, now + i, sched);
      notes.push({ ...made.note, tags: [...pn.tags, `pack:${pack.id}`] });
      cards.push(...made.cards);
    });
    await d.notes.bulkAdd(notes);
    await d.cards.bulkAdd(cards);
    return deck;
  });
}

/** "되돌리기"용: 방금 만든 노트를 그대로 되살린다. */
export async function restoreNote(note: Note, cards: Card[], d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.notes, d.cards], async () => {
    await d.notes.put(note);
    await d.cards.bulkPut(cards);
  });
}

// ---------------- 복습 ----------------

async function freshCard(card: Card, sched: Scheduler, d: FlashcardsDB): Promise<Card> {
  if (card.schedulerId === sched.id) return card;
  const logs = await d.reviewLogs.where('cardId').equals(card.id).toArray();
  return withState(card, rebuildFromLogs(card.createdAt, logs, sched), sched.id);
}

/** 답을 기록한다. 반환값은 되돌리기에 쓰는 로그 id. */
export async function recordReview(cardId: Id, rating: Rating, durationMs: number | undefined, d: FlashcardsDB = db): Promise<Id> {
  return d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const card = await d.cards.get(cardId);
    if (!card) throw new Error('카드를 찾을 수 없어요');
    const sched = schedulerFor(await getSettings(d));
    const at = Date.now();
    const log: ReviewLog = { id: newId(), cardId, kind: 'review', rating, at, tzOffsetMin: tz(), durationMs, scheduler: sched.version };
    const updated = applyReview(await freshCard(card, sched, d), rating, at, sched);
    await d.reviewLogs.add(log);
    await d.cards.put(updated);
    return log.id;
  });
}

/** 복습을 되돌린다. 로그를 지우지 않고 void 로그를 추가한 뒤 다시 계산한다. */
export async function undoReview(logId: Id, d: FlashcardsDB = db): Promise<Id | undefined> {
  return d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const log = await d.reviewLogs.get(logId);
    if (!log || log.kind !== 'review') return undefined;
    const voidLog: ReviewLog = { id: newId(), cardId: log.cardId, kind: 'void', voidsId: log.id, at: Date.now(), tzOffsetMin: tz() };
    await d.reviewLogs.add(voidLog);
    await rebuildCard(log.cardId, d);
    return log.cardId;
  });
}

/** 카드 학습 진행도를 처음으로 되돌린다 (reset 이벤트). */
export async function resetCard(cardId: Id, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const resetLog: ReviewLog = { id: newId(), cardId, kind: 'reset', at: Date.now(), tzOffsetMin: tz() };
    await d.reviewLogs.add(resetLog);
    await rebuildCard(cardId, d);
  });
}

async function rebuildCard(cardId: Id, d: FlashcardsDB): Promise<void> {
  const card = await d.cards.get(cardId);
  if (!card) return;
  const sched = schedulerFor(await getSettings(d));
  const logs = await d.reviewLogs.where('cardId').equals(cardId).toArray();
  await d.cards.put(withState(card, rebuildFromLogs(card.createdAt, logs, sched), sched.id));
}

/** 모든 카드를 로그로 다시 계산한다 (알고리즘을 바꾸거나 백업을 가져온 뒤). */
export async function rebuildAll(d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const sched = schedulerFor(await getSettings(d));
    const logs = await d.reviewLogs.toArray();
    const byCard = new Map<Id, ReviewLog[]>();
    for (const l of logs) byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l]);
    const cards = await d.cards.toArray();
    await d.cards.bulkPut(cards.map((c) => withState(c, rebuildFromLogs(c.createdAt, byCard.get(c.id) ?? [], sched), sched.id)));
  });
}

// ---------------- 백업 ----------------

export async function exportBackup(d: FlashcardsDB = db): Promise<Backup> {
  const [decks, notes, cards, reviewLogs, settings] = await Promise.all([
    d.decks.toArray(),
    d.notes.toArray(),
    d.cards.toArray(),
    d.reviewLogs.toArray(),
    getSettings(d),
  ]);
  // API 키는 백업 파일에 넣지 않는다 (파일을 어디에 두든 키가 새지 않게)
  const { gemini: _gemini, ...safeSettings } = settings;
  return makeBackup({ decks, notes, cards, reviewLogs, settings: safeSettings as Settings }, Date.now());
}

/** 백업으로 모든 데이터를 바꾼다. 카드 상태는 로그로 다시 계산한다. */
export async function importBackup(b: Backup, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.decks, d.notes, d.cards, d.reviewLogs, d.settings], async () => {
    const keep = (await d.settings.get('settings'))?.gemini; // 이 기기의 Gemini 키는 유지
    await Promise.all([d.decks.clear(), d.notes.clear(), d.cards.clear(), d.reviewLogs.clear(), d.settings.clear()]);
    await d.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, gemini: keep, id: 'settings' });
    await d.decks.bulkAdd(b.decks);
    await d.notes.bulkAdd(b.notes);
    await d.cards.bulkAdd(b.cards.map((c) => ({ ...c, schedulerId: undefined })));
    await d.reviewLogs.bulkAdd(b.reviewLogs);
  });
  await rebuildAll(d);
}
