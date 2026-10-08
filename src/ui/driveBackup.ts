import { backupFileName, BackupError, parseBackup } from '../core/io/backup';
import type { Settings } from '../core/model/types';
import { clearTokenCache, getAccessToken } from '../adapters/google/auth';
import { DriveError, downloadText, ensureFolder, listBackups, pruneBackups, uploadJson, userEmail, type DriveFile } from '../adapters/google/drive';
import { exportBackup, getSettings, importBackup, saveSettings } from '../adapters/storage/repo';

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

/** 처음 연결: 로그인 → 계정 확인 → 폴더 만들기 → 첫 백업 */
export async function connectDrive(clientId: string): Promise<string | undefined> {
  const token = await getAccessToken(clientId, { forceConsent: true });
  const email = await userEmail(token);
  const folderId = await ensureFolder(token);
  await saveSettings({ googleDrive: { clientId, email, folderId } });
  await backupToDrive();
  return email;
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
