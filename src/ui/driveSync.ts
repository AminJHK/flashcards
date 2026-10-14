import { makeSyncFile, parseSyncFile, SYNC_FILE_NAME } from '../core/io/sync';
import { clearTokenCache, getAccessToken, peekToken } from '../adapters/google/auth';
import { DriveError, downloadText, ensureFolder, findFile, updateText, uploadJson } from '../adapters/google/drive';
import { exportSyncData, getSettings, mergeIntoLocal, saveSettings } from '../adapters/storage/repo';

export interface SyncResult {
  /** 합친 뒤 이 기기에 있는 단어 수 */
  notes: number;
  /** Drive에 동기화 파일이 이미 있었는지 (없으면 이 기기 것을 처음 올린 것) */
  hadRemote: boolean;
}

let running: Promise<SyncResult | undefined> | undefined;

/**
 * Google Drive의 동기화 파일과 이 기기를 합친다: 내려받기 → 합치기 → 올리기.
 * interactive=false면 로그인 창을 띄우지 않고, 이미 받은 토큰이 있을 때만 한다 (없으면 undefined).
 * 동시에 두 번 돌지 않는다.
 */
export function syncWithDrive(opts: { interactive: boolean }): Promise<SyncResult | undefined> {
  running ??= run(opts).finally(() => {
    running = undefined;
  });
  return running;
}

async function run({ interactive }: { interactive: boolean }): Promise<SyncResult | undefined> {
  const s = await getSettings();
  const drive = s.googleDrive;
  if (!drive?.clientId) throw new Error('Google Drive가 연결되어 있지 않아요');
  let token = interactive ? await getAccessToken(drive.clientId) : peekToken(drive.clientId);
  if (!token) return undefined;
  const attempt = async (t: string): Promise<SyncResult> => {
    const folderId = await ensureFolder(t, drive.folderId);
    const file = await findFile(t, folderId, SYNC_FILE_NAME);
    let hadRemote = false;
    let merged;
    if (file) {
      const remote = parseSyncFile(await downloadText(t, file.id));
      hadRemote = true;
      // 이 기기에서 처음 동기화하면 다른 기기에서 쓰던 설정(목표 기억률, 테마 등)도 가져온다
      if (!drive.lastSyncAt) await saveSettings(remote.settings);
      merged = await mergeIntoLocal(remote.data);
    } else {
      merged = await exportSyncData();
    }
    const text = JSON.stringify(makeSyncFile(merged, await getSettings(), Date.now()));
    if (file) await updateText(t, file.id, text);
    else await uploadJson(t, folderId, SYNC_FILE_NAME, text);
    const cur = await getSettings();
    await saveSettings({ googleDrive: { ...cur.googleDrive!, folderId, lastSyncAt: Date.now() } });
    return { notes: merged.notes.length, hadRemote };
  };
  try {
    return await attempt(token);
  } catch (e) {
    if (e instanceof DriveError && e.status === 401) {
      clearTokenCache();
      if (!interactive) return undefined;
      token = await getAccessToken(drive.clientId);
      return attempt(token);
    }
    throw e;
  }
}
