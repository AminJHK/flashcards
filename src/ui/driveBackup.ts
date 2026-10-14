import { backupFileName, BackupError, parseBackup } from '../core/io/backup';
import type { Settings } from '../core/model/types';
import { clearTokenCache, getAccessToken } from '../adapters/google/auth';
import { DriveError, downloadText, ensureFolder, listBackups, pruneBackups, uploadJson, userEmail, type DriveFile } from '../adapters/google/drive';
import { exportBackup, getSettings, importBackup, saveSettings } from '../adapters/storage/repo';
import { syncWithDrive, type SyncResult } from './driveSync';

/** Drive에 남겨 둘 백업 개수 */
export const KEEP_BACKUPS = 30;

async function withToken<T>(fn: (token: string, drive: NonNullable<Settings['googleDrive']>) => Promise<T>): Promise<T> {
  const s = await getSettings();
  const drive = s.googleDrive;
  if (!drive?.clientId) throw new Error('Google Drive가 연결되어 있지 않아요');
  const token = await getAccessToken(drive.clientId);
  try {
    return await fn(token, drive);
  } catch (e) {
    if (e instanceof DriveError && e.status === 401) {
      clearTokenCache();
      return fn(await getAccessToken(drive.clientId), drive);
    }
    throw e;
  }
}

/**
 * 처음 연결: 로그인 → 계정 확인 → 폴더 만들기 → (이 기기에 단어가 있으면) 첫 백업 → 다른 기기와 동기화.
 * 다른 기기에서 이미 쓰던 Drive면 그 데이터를 이 기기로 불러온다.
 */
export async function connectDrive(clientId: string): Promise<{ email?: string; sync?: SyncResult }> {
  const token = await getAccessToken(clientId, { forceConsent: true });
  const email = await userEmail(token);
  const folderId = await ensureFolder(token);
  await saveSettings({ googleDrive: { clientId, email, folderId } });
  if ((await exportBackup()).notes.length) await backupToDrive();
  const sync = await syncWithDrive({ interactive: true });
  return { email, sync };
}

export async function backupToDrive(): Promise<void> {
  await withToken(async (token, drive) => {
    const now = Date.now();
    const folderId = await ensureFolder(token, drive.folderId);
    const backup = await exportBackup();
    await uploadJson(token, folderId, backupFileName(now), JSON.stringify(backup));
    await pruneBackups(token, folderId, KEEP_BACKUPS);
    const cur = await getSettings();
    await saveSettings({ lastBackupAt: now, googleDrive: { ...cur.googleDrive!, folderId, lastDriveBackupAt: now } });
  });
}

export function listDriveBackups(): Promise<DriveFile[]> {
  return withToken(async (token, drive) => listBackups(token, await ensureFolder(token, drive.folderId)));
}

export async function restoreFromDrive(file: DriveFile): Promise<number> {
  const text = await withToken((token) => downloadText(token, file.id));
  const b = parseBackup(text);
  await importBackup(b);
  return b.notes.length;
}

export function driveErrorMessage(e: unknown): string {
  if (e instanceof BackupError) return e.message;
  return e instanceof Error && e.message ? e.message : 'Google Drive 작업에 실패했어요';
}

/** 하루에 한 번 정도 백업하도록 알려줄지 */
export function driveBackupDue(s: Settings | undefined, now = Date.now()): boolean {
  const d = s?.googleDrive;
  return !!d?.clientId && (!d.lastDriveBackupAt || now - d.lastDriveBackupAt > 20 * 3600_000);
}
