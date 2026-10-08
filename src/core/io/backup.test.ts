import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../model/types';
import { BackupError, makeBackup, parseBackup } from './backup';

describe('backup', () => {
  const b = makeBackup({ decks: [], notes: [], cards: [], reviewLogs: [], settings: DEFAULT_SETTINGS }, 0);

  it('만든 백업을 다시 읽을 수 있다', () => {
    expect(parseBackup(JSON.stringify(b))).toEqual(b);
  });

  it('다른 파일은 거절한다', () => {
    expect(() => parseBackup('hello')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ ...b, version: 99 }))).toThrow(/새로운 버전/);
    expect(() => parseBackup(JSON.stringify({ ...b, notes: [{ typeId: 'nope' }] }))).toThrow(/모르는 카드 종류/);
  });
});
