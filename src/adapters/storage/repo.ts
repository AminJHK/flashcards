import { CONNECTOR_DECK_NAME, CONNECTOR_DECK_SETTINGS, isConnector } from '../../core/decks/connectors';
import { getCardType } from '../../core/cardTypes/registry';
import type { DeriveDeps } from '../../core/cardTypes/types';
import type { Pack } from '../../core/packs/types';
import { makeBackup, type Backup } from '../../core/io/backup';
import { newId } from '../../core/model/ids';
import { cardsForNote, createNote, trimFields, userEdited } from '../../core/model/notes';
import { DEFAULT_SETTINGS, type Card, type Deck, type DeckSettings, type Id, type Millis, type Note, type Rating, type ReviewLog, type Settings } from '../../core/model/types';
import { applyReview, withState } from '../../core/scheduler/queue';
import { rebuildFromLogs } from '../../core/scheduler/rebuild';
import { createScheduler } from '../../core/scheduler/registry';
import type { Scheduler } from '../../core/scheduler/types';
import { db, type FlashcardsDB } from './db';
import type { PackChange } from '../../core/packs/update';
import { mergeSync, type SyncData } from '../../core/io/sync';

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

/** 덱 설정을 바꾼다. 정방향·역방향 스위치가 바뀌면 카드의 hidden을 맞춘다 (기록은 그대로). */
export async function updateDeck(id: Id, patch: { name?: string; settings?: Partial<DeckSettings> }, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const deck = await d.decks.get(id);
    if (!deck) return;
    const next: Deck = { ...deck, name: patch.name?.trim() || deck.name, settings: { ...deck.settings, ...patch.settings }, updatedAt: Date.now() };
    await d.decks.put(next);
    if (next.settings.reverseEnabled !== deck.settings.reverseEnabled || next.settings.forwardEnabled !== deck.settings.forwardEnabled) {
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
  await d.transaction('rw', [d.decks, d.notes, d.cards, d.tombstones], async () => {
    // 다른 기기와 동기화할 때 되살아나지 않게 지운 흔적을 남긴다
    const at = Date.now();
    const noteIds = (await d.notes.where('deckId').equals(id).primaryKeys()) as Id[];
    await d.tombstones.bulkPut([{ id, kind: 'deck', at }, ...noteIds.map((n) => ({ id: n, kind: 'note' as const, at }))]);
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
      // 고친 내용 받기와 같은 밀리초여도 "직접 고친 단어"로 남게 한 칸 뒤로
      updatedAt: Math.max(Date.now(), (note.packUpdatedAt ?? note.createdAt) + 1),
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

/**
 * 연결어·표현 덱을 만들고(이미 있으면 그 덱) 이 덱의 연결어 단어를 옮긴다. 복습 기록과 기억 상태는 그대로 따라간다.
 * 이미 연결어 덱에 있는 단어는 건드리지 않는다. 옮긴 개수와 덱을 돌려준다.
 */
export async function moveConnectors(fromDeckId: Id, d: FlashcardsDB = db): Promise<{ moved: number; deck: Deck }> {
  return d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const all = await d.decks.toArray();
    let deck = all.find((x) => x.name === CONNECTOR_DECK_NAME && x.id !== fromDeckId);
    const mine = (await d.notes.where('deckId').equals(fromDeckId).toArray()).filter(isConnector);
    if (!mine.length) return { moved: 0, deck: deck ?? (await createDeck(CONNECTOR_DECK_NAME, { ...CONNECTOR_DECK_SETTINGS }, d)) };
    if (!deck) deck = await createDeck(CONNECTOR_DECK_NAME, { ...CONNECTOR_DECK_SETTINGS }, d);
    const now = Date.now();
    const sched = schedulerFor(await getSettings(d));
    const cards = await d.cards.where('deckId').equals(fromDeckId).toArray();
    const byNote = new Map<Id, Card[]>();
    for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
    const notes: Note[] = [];
    const changed: Card[] = [];
    for (const n of mine) {
      // 덱만 옮긴 것이라 사용자가 고친 단어로 치지 않는다 (준비된 덱 업데이트를 계속 받게)
      const next: Note = { ...n, deckId: deck.id, updatedAt: now, ...(userEdited(n) ? {} : { packUpdatedAt: now }) };
      notes.push(next);
      changed.push(...cardsForNote(next, byNote.get(n.id) ?? [], deck, now, sched));
    }
    // 한 번에 저장한다 (70개를 하나씩 저장하면 폰에서 몇 초 걸린다)
    await d.notes.bulkPut(notes);
    await d.cards.bulkPut(changed);
    return { moved: mine.length, deck };
  });
}

/** 노트와 카드를 지운다. 복습 로그는 남긴다 (나중에 파라미터 최적화에 쓸 수 있음). */
export async function deleteNote(id: Id, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.notes, d.cards, d.tombstones], async () => {
    await d.tombstones.put({ id, kind: 'note', at: Date.now() });
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
    const deck: Deck = { id: newId(), name: pack.deckName, createdAt: Date.now(), settings: { ...pack.deckSettings } };
    await d.decks.add(deck);
    await addPackNotesTo(deck, pack, pack.notes, deps, d);
    return deck;
  });
}

/** 준비된 덱에 새로 생긴 단어를 이미 설치한 덱의 뒤에 넣는다 (packAdditions 참고). 넣은 개수를 돌려준다. */
export async function addPackNotes(deckId: Id, pack: Pack, notes: Pack['notes'], deps: DeriveDeps, d: FlashcardsDB = db): Promise<number> {
  return d.transaction('rw', [d.decks, d.notes, d.cards, d.settings], async () => {
    const deck = await d.decks.get(deckId);
    if (!deck) throw new Error('덱이 없어요');
    return addPackNotesTo(deck, pack, notes, deps, d);
  });
}

async function addPackNotesTo(deck: Deck, pack: Pack, packNotes: Pack['notes'], deps: DeriveDeps, d: FlashcardsDB): Promise<number> {
  // 덱에 이미 있는 단어보다 항상 뒤에 오도록 (방금 설치한 덱이면 시각이 겹칠 수 있다)
  let last = 0;
  await d.notes.where('deckId').equals(deck.id).each((n) => {
    last = Math.max(last, n.createdAt);
  });
  const now = Math.max(Date.now(), last + 1);
  const sched = schedulerFor(await getSettings(d));
  const notes: Note[] = [];
  const cards: Card[] = [];
  packNotes.forEach((pn, i) => {
    const type = getCardType(pn.typeId);
    let fields = { ...pn.fields };
    for (const src of new Set(type.fields.map((f) => f.autoFrom).filter(Boolean) as string[])) {
      const patch = type.derive?.(src, fields, deps) ?? {};
      // 꾸러미에 직접 적힌 값이 있으면 그걸 쓴다
      fields = { ...fields, ...Object.fromEntries(Object.entries(patch).filter(([k]) => !fields[k]?.trim())) };
    }
    // 시각을 하나씩 늘려서 새 카드가 꾸러미 순서대로 나오게 한다
    const made = createNote(deck, pn.typeId, fields, now + i, sched);
    notes.push({ ...made.note, tags: [...pn.tags, `pack:${pack.id}`] });
    cards.push(...made.cards);
  });
  await d.notes.bulkAdd(notes);
  await d.cards.bulkAdd(cards);
  return notes.length;
}

/**
 * 준비된 덱이 고쳐졌을 때 이미 넣어 둔 단어에 반영한다 (사용자가 고친 단어는 제외, packChanges 참고).
 * 복습 기록은 그대로다. 반영한 단어도 "사용자가 안 고친 단어"로 남겨서 다음 업데이트를 또 받을 수 있게 한다.
 */
export async function applyPackChanges(changes: readonly PackChange[], d: FlashcardsDB = db): Promise<number> {
  return d.transaction('rw', [d.notes], async () => {
    let n = 0;
    for (const c of changes) {
      const note = await d.notes.get(c.noteId);
      if (!note) continue;
      // updatedAt을 올려야 동기화가 이 내용을 다른 기기로 보내고, 받기 전 내용으로 되돌리지 않는다
      const now = Math.max(Date.now(), note.updatedAt + 1);
      if (userEdited(note)) {
        // 사용자가 고친 단어: 비어 있는 새 칸만 채운다 (직접 쓴 내용은 그대로, 계속 "고친 단어")
        const fill = Object.entries(c.fill ?? {}).filter(([k]) => !(note.fields[k] ?? '').trim());
        if (!fill.length) continue;
        await d.notes.put({ ...note, fields: { ...note.fields, ...Object.fromEntries(fill) }, updatedAt: now });
        n++;
        continue;
      }
      await d.notes.put({ ...note, fields: c.fields, updatedAt: now, packUpdatedAt: now });
      n++;
    }
    return n;
  });
}

/** "되돌리기"용: 방금 만든 노트를 그대로 되살린다. */
export async function restoreNote(note: Note, cards: Card[], d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.notes, d.cards, d.tombstones], async () => {
    await d.tombstones.delete(note.id);
    await d.notes.put(note);
    await d.cards.bulkPut(cards);
  });
}

// ---------------- 복습 ----------------

async function freshCard(card: Card, sched: Scheduler, d: FlashcardsDB): Promise<Card> {
  if (card.schedulerId === sched.id) return card;
  const logs = await d.reviewLogs.where('cardId').equals(card.id).toArray();
  return withState(card, rebuildFromLogs(card.createdAt, logs, sched, card.id), sched.id);
}

/** 답을 기록한다. 반환값은 되돌리기에 쓰는 로그 id. */
/** at: 답한 시각 (알림에서 누른 답은 누른 시각). 이미 더 나중 기록이 있으면 로그로 다시 계산해서 순서를 지킨다 */
export async function recordReview(cardId: Id, rating: Rating, durationMs: number | undefined, d: FlashcardsDB = db, at: Millis = Date.now()): Promise<Id> {
  return d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const card = await d.cards.get(cardId);
    if (!card) throw new Error('카드를 찾을 수 없어요');
    const sched = schedulerFor(await getSettings(d));
    const log: ReviewLog = { id: newId(), cardId, kind: 'review', rating, at, tzOffsetMin: tz(), durationMs, scheduler: sched.version };
    if (card.lastReviewAt !== undefined && at < card.lastReviewAt) {
      await d.reviewLogs.add(log);
      await rebuildCard(cardId, d);
      return log.id;
    }
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
  await d.cards.put(withState(card, rebuildFromLogs(card.createdAt, logs, sched, card.id), sched.id));
}

/** 알고리즘을 바꾸고 모든 카드를 복습 기록으로 다시 계산한다 */
export async function chooseScheduler(schedulerId: string, d: FlashcardsDB = db): Promise<void> {
  await saveSettings({ schedulerId, schedulerChosen: true }, d);
  await rebuildAll(d);
}

/** FSRS-6을 쓰던 기기는 한 번 FSRS-7로 옮긴다 (사용자가 설정에서 직접 고른 적이 없을 때만). 옮겼으면 true */
export async function migrateToFsrs7(d: FlashcardsDB = db): Promise<boolean> {
  const s = await getSettings(d);
  if (s.schedulerChosen || s.schedulerId !== 'fsrs-6') return false;
  await saveSettings({ schedulerId: 'fsrs-7' }, d);
  await rebuildAll(d);
  return true;
}

/** 모든 카드를 로그로 다시 계산한다 (알고리즘을 바꾸거나 백업을 가져온 뒤). */
export async function rebuildAll(d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const sched = schedulerFor(await getSettings(d));
    const logs = await d.reviewLogs.toArray();
    const byCard = new Map<Id, ReviewLog[]>();
    for (const l of logs) byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l]);
    const cards = await d.cards.toArray();
    await d.cards.bulkPut(cards.map((c) => withState(c, rebuildFromLogs(c.createdAt, byCard.get(c.id) ?? [], sched, c.id), sched.id)));
  });
}

/** 지금 알고리즘으로 계산되지 않은 카드(schedulerId가 다름)만 로그로 다시 계산한다 */
export async function rebuildStale(d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.cards, d.reviewLogs, d.settings], async () => {
    const sched = schedulerFor(await getSettings(d));
    const stale = (await d.cards.toArray()).filter((c) => c.schedulerId !== sched.id);
    if (!stale.length) return;
    const ids = new Set(stale.map((c) => c.id));
    const byCard = new Map<Id, ReviewLog[]>();
    for (const l of await d.reviewLogs.toArray()) if (ids.has(l.cardId)) byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l]);
    await d.cards.bulkPut(stale.map((c) => withState(c, rebuildFromLogs(c.createdAt, byCard.get(c.id) ?? [], sched, c.id), sched.id)));
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
  const { gemini: _gemini, googleDrive: _drive, ...safeSettings } = settings;
  return makeBackup({ decks, notes, cards, reviewLogs, settings: safeSettings as Settings }, Date.now());
}

/** 백업으로 모든 데이터를 바꾼다. 카드 상태는 로그로 다시 계산한다. */
export async function importBackup(b: Backup, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.decks, d.notes, d.cards, d.reviewLogs, d.settings], async () => {
    const here = await d.settings.get('settings'); // 이 기기의 Gemini 키와 Drive 연결은 유지
    await Promise.all([d.decks.clear(), d.notes.clear(), d.cards.clear(), d.reviewLogs.clear(), d.settings.clear()]);
    await d.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, gemini: here?.gemini, googleDrive: here?.googleDrive, id: 'settings' });
    await d.decks.bulkAdd(b.decks);
    await d.notes.bulkAdd(b.notes);
    await d.cards.bulkAdd(b.cards.map((c) => ({ ...c, schedulerId: undefined })));
    await d.reviewLogs.bulkAdd(b.reviewLogs);
  });
  await rebuildAll(d);
}

// ---------------- 기기 사이 동기화 ----------------

export async function exportSyncData(d: FlashcardsDB = db): Promise<SyncData> {
  const [decks, notes, cards, reviewLogs, tombstones] = await Promise.all([d.decks.toArray(), d.notes.toArray(), d.cards.toArray(), d.reviewLogs.toArray(), d.tombstones.toArray()]);
  return { decks, notes, cards, reviewLogs, tombstones };
}

/**
 * 다른 기기의 자료를 이 기기에 합친다 (mergeSync). 합치는 동안 생긴 이 기기의 변경도 잃지 않도록
 * 지금 저장된 것을 한 트랜잭션 안에서 다시 읽어서 합친다. 반환값은 합친 결과 (Drive에 올릴 것).
 */
const stableJson = (x: unknown) => JSON.stringify(x);

export async function mergeIntoLocal(remote: SyncData, d: FlashcardsDB = db): Promise<SyncData> {
  const merged = await d.transaction('rw', [d.decks, d.notes, d.cards, d.reviewLogs, d.tombstones, d.settings], async () => {
    const local = await exportSyncData(d);
    const m = mergeSync(local, remote);
    const sched = schedulerFor(await getSettings(d));
    const now = Date.now();
    const keep = <T extends { id: Id }>(xs: T[]) => new Set(xs.map((x) => x.id));
    const gone = <T extends { id: Id }>(before: T[], after: T[]) => {
      const ids = keep(after);
      return before.filter((x) => !ids.has(x.id)).map((x) => x.id);
    };
    await d.decks.bulkDelete(gone(local.decks, m.decks));
    await d.notes.bulkDelete(gone(local.notes, m.notes));
    await d.cards.bulkDelete(gone(local.cards, m.cards));
    await d.decks.bulkPut(m.decks);
    // 바뀐 것만 쓴다 (단어가 많으면 전부 다시 쓰는 데만 몇 초 걸린다)
    const localNotes = new Map(local.notes.map((x) => [x.id, x]));
    await d.notes.bulkPut(m.notes.filter((x) => localNotes.get(x.id)?.updatedAt !== x.updatedAt || stableJson(localNotes.get(x.id)) !== stableJson(x)));
    // 카드 상태는 로그로 다시 계산한다. 단 새 로그가 없고 이 기기 상태가 지금 알고리즘으로 계산된 카드는 그대로 둔다
    // (모든 카드를 매번 다시 계산하면 단어가 많을수록 동기화가 느려진다: 1500단어에서 5초 넘게 걸렸다)
    const localLogIds = new Set(local.reviewLogs.map((l) => l.id));
    const touched = new Set(m.reviewLogs.filter((l) => !localLogIds.has(l.id)).map((l) => l.cardId));
    const localCards = new Map(local.cards.map((c) => [c.id, c]));
    const cards = m.cards.map((c) => {
      const lc = localCards.get(c.id);
      if (!lc || touched.has(c.id) || lc.schedulerId !== sched.id) return { ...c, schedulerId: undefined };
      // 일정(캐시)은 이 기기 것, 나머지(숨김·보류·덱 등)는 합친 것
      const { isNew, phase, due, reps, lapses, lastReviewAt, firstReviewAt, memory, schedulerId } = lc;
      const next: Card = { ...c, isNew, phase, due, reps, lapses, lastReviewAt, firstReviewAt, memory, schedulerId };
      return stableJson(next) === stableJson(lc) ? lc : next;
    });
    await d.cards.bulkPut(cards.filter((c) => c !== localCards.get(c.id)));
    await d.reviewLogs.bulkPut(m.reviewLogs.filter((l) => !localLogIds.has(l.id)));
    const localTombs = new Set(local.tombstones.map((t) => `${t.id}|${t.at}`));
    await d.tombstones.bulkPut(m.tombstones.filter((t) => !localTombs.has(`${t.id}|${t.at}`)));
    // 카드 구성 맞추기 (덱 설정에 따른 숨김, 빠진 카드 만들기)
    const deckById = new Map(m.decks.map((x) => [x.id, x]));
    const cardsByNote = new Map<Id, Card[]>();
    for (const c of cards) cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c]);
    const fixed = m.notes.flatMap((n) => cardsForNote(n, cardsByNote.get(n.id) ?? [], deckById.get(n.deckId)!, now, sched));
    if (fixed.length) await d.cards.bulkPut(fixed);
    return m;
  });
  await rebuildStale(d);
  return { ...merged, cards: await d.cards.toArray() };
}
