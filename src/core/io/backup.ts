import { hasCardType } from '../cardTypes/registry';
import type { Card, Deck, Millis, Note, ReviewLog, Settings } from '../model/types';

export const BACKUP_FORMAT = 'flashcards-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  settings: Settings;
}

export function makeBackup(data: Omit<Backup, 'format' | 'version' | 'exportedAt'>, now: Millis): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), ...data };
}

export function backupFileName(now: Millis): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `flashcards-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export class BackupError extends Error {}

/** 백업 파일 내용을 검사한다. 카드 캐시는 믿지 않고, 가져온 뒤 로그로 다시 계산한다. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('JSON 파일이 아니에요.');
  }
  const b = raw as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT) throw new BackupError('이 앱의 백업 파일이 아니에요.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new BackupError('더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트해 주세요.');
  for (const k of ['decks', 'notes', 'cards', 'reviewLogs'] as const) {
    if (!Array.isArray(b[k])) throw new BackupError(`백업 파일이 손상됐어요 (${k}).`);
  }
  if (!b.settings || typeof b.settings !== 'object') throw new BackupError('백업 파일이 손상됐어요 (settings).');
  const unknownType = b.notes!.find((n) => !hasCardType(n.typeId));
  if (unknownType) throw new BackupError(`이 앱이 모르는 카드 종류가 있어요: ${unknownType.typeId}`);
  return b as Backup;
}
