import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { db } from '../adapters/storage/db';
import { useSettings } from './hooks';
import { getSyncState, subscribeSyncState } from './driveSync';

export interface SyncStatus {
  /** 이 기기에서 마지막으로 Drive와 맞춘 시각 */
  lastSyncAt?: number;
  /** 마지막으로 맞춘 뒤에 이 기기에서 생긴 변경 (복습 기록, 바꾼 단어·덱) */
  pending: number;
  syncing: boolean;
  failed: boolean;
}

/** Drive를 연결했을 때만 값이 있다. 종료해도 되는지 판단하는 데 쓴다. */
export function useSyncStatus(): SyncStatus | undefined {
  const settings = useSettings();
  const drive = settings?.googleDrive;
  const state = useSyncExternalStore(subscribeSyncState, getSyncState);
  const lastSyncAt = drive?.lastSyncAt;
  const pending = useLiveQuery(async () => {
    const since = lastSyncAt ?? 0;
    const logs = await db.reviewLogs.where('at').above(since).count();
    const notes = (await db.notes.toArray()).filter((n) => (n.updatedAt ?? n.createdAt) > since).length;
    const decks = (await db.decks.toArray()).filter((d) => (d.updatedAt ?? d.createdAt) > since).length;
    const gone = await db.tombstones.where('at').above(since).count();
    return logs + notes + decks + gone;
  }, [lastSyncAt]);
  if (!drive?.clientId || pending === undefined) return undefined;
  return { lastSyncAt, pending, ...state };
}
