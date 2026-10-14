import type { Card, Deck, Id, Millis, Note, ReviewLog, Settings, Tombstone } from '../model/types';

/**
 * 기기 사이 동기화 (docs/DESIGN.md §3). 내 Google Drive의 동기화 파일 하나를 여러 기기가 같이 쓴다.
 * 합치는 규칙:
 * - 복습 기록(ReviewLog): 추가만 하므로 id로 모두 합친다. 아무것도 잃지 않는다.
 * - 덱·단어: 같은 id면 더 나중에 고친 쪽 (같은 시각이면 내용으로 정해서 어느 기기에서 합쳐도 결과가 같다).
 * - 지운 것(Tombstone): 지운 시각보다 나중에 고친 게 아니면 지운 채로 둔다. 덱이 지워지면 그 덱의 단어도 뺀다.
 * - 카드: 상태는 캐시라서 합친 뒤 기록으로 다시 계산한다. 여기서는 단어가 남아 있는 카드만 고른다.
 * 같은 두 자료를 어느 순서로 합쳐도 같은 결과가 나온다 (두 기기가 결국 같아진다).
 */

export const SYNC_FORMAT = 'flashcards-sync';
export const SYNC_VERSION = 1;
export const SYNC_FILE_NAME = 'flashcards-sync.json';

export interface SyncData {
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  tombstones: Tombstone[];
}

export interface SyncFile {
  format: typeof SYNC_FORMAT;
  version: number;
  savedAt: Millis;
  data: SyncData;
  /** 기기마다 다를 수 있는 것(키, Drive 연결, 기기 음성)은 뺀 설정. 처음 동기화하는 기기가 가져다 쓴다 */
  settings: Partial<Settings>;
}

export class SyncError extends Error {}

/** 동기화에서 빼는 설정 (기기마다 다르거나 비밀인 것) */
export function sharedSettings(s: Settings): Partial<Settings> {
  const { gemini: _g, googleDrive: _d, voices: _v, id: _id, lastBackupAt: _b, ...rest } = s as Settings & { id?: string };
  return rest;
}

export function makeSyncFile(data: SyncData, settings: Settings, now: Millis): SyncFile {
  return { format: SYNC_FORMAT, version: SYNC_VERSION, savedAt: now, data, settings: sharedSettings(settings) };
}

export function parseSyncFile(text: string): SyncFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SyncError('동기화 파일이 손상됐어요');
  }
  const f = raw as Partial<SyncFile>;
  if (!f || f.format !== SYNC_FORMAT || !f.data) throw new SyncError('이 앱의 동기화 파일이 아니에요');
  if (typeof f.version !== 'number' || f.version > SYNC_VERSION) throw new SyncError('더 새로운 버전의 앱이 만든 동기화 파일이에요. 앱을 업데이트해 주세요');
  const d = f.data as Partial<SyncData>;
  for (const k of ['decks', 'notes', 'cards', 'reviewLogs'] as const) if (!Array.isArray(d[k])) throw new SyncError('동기화 파일이 손상됐어요');
  return { ...(f as SyncFile), data: { ...(d as SyncData), tombstones: Array.isArray(d.tombstones) ? d.tombstones : [] } };
}

const stable = (x: unknown) => JSON.stringify(x);

/** 더 나중 것. 시각이 같으면 내용으로 정한다 (어느 쪽에서 합쳐도 같은 답) */
function newer<T>(a: T, b: T, at: (x: T) => Millis): T {
  const ta = at(a);
  const tb = at(b);
  if (ta !== tb) return ta > tb ? a : b;
  return stable(a) >= stable(b) ? a : b;
}

function byId<T extends { id: Id }>(lists: T[][], pick: (a: T, b: T) => T): Map<Id, T> {
  const m = new Map<Id, T>();
  for (const list of lists) for (const x of list) m.set(x.id, m.has(x.id) ? pick(m.get(x.id)!, x) : x);
  return m;
}

export function mergeSync(a: SyncData, b: SyncData): SyncData {
  const tombs = byId([a.tombstones, b.tombstones], (x, y) => newer(x, y, (t) => t.at));
  const goneAt = (id: Id) => tombs.get(id)?.at ?? -Infinity;
  const deckAt = (d: Deck) => d.updatedAt ?? d.createdAt;

  const decks = [...byId([a.decks, b.decks], (x, y) => newer(x, y, deckAt)).values()].filter((d) => goneAt(d.id) < deckAt(d));
  const deckIds = new Set(decks.map((d) => d.id));
  const notes = [...byId([a.notes, b.notes], (x, y) => newer(x, y, (n) => n.updatedAt)).values()].filter(
    (n) => goneAt(n.id) < n.updatedAt && deckIds.has(n.deckId),
  );
  const noteIds = new Set(notes.map((n) => n.id));
  // 카드 상태는 다시 계산하니 아무 쪽이나 괜찮지만, 결과가 같도록 정해진 규칙으로 고른다
  const cards = [...byId([a.cards, b.cards], (x, y) => newer(x, y, (c) => c.lastReviewAt ?? 0)).values()].filter((c) => noteIds.has(c.noteId));
  const reviewLogs = [...byId([a.reviewLogs, b.reviewLogs], (x) => x).values()].sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
  const sortById = <T extends { id: Id }>(xs: T[]) => xs.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return { decks: sortById(decks), notes: sortById(notes), cards: sortById(cards), reviewLogs, tombstones: sortById([...tombs.values()]) };
}
