import { backupFileName, BackupError, parseBackup } from '../core/io/backup';
import { pickTextFile, saveFile } from '../adapters/files/share';
import { exportBackup, getSettings, importBackup, saveSettings, schedulerFor } from '../adapters/storage/repo';
import { studyCsv, studyFileName } from '../core/io/studyExport';
import { ask } from './confirm';

export async function runBackup(toast: (m: string) => void): Promise<void> {
  try {
    const now = Date.now();
    const backup = await exportBackup();
    const res = await saveFile(backupFileName(now), JSON.stringify(backup));
    if (res === 'cancelled') return;
    await saveSettings({ lastBackupAt: now });
    toast(res === 'shared' ? '백업 파일을 보냈어요' : '백업 파일을 다운로드 폴더에 저장했어요');
  } catch {
    toast('백업하지 못했어요. 다시 시도해 주세요');
  }
}

/** AI(ChatGPT 등)에게 보여 줄 학습 기록 파일 (단어마다 한 줄, CSV). 사용자가 직접 저장하거나 보낸다 */
export async function runStudyExport(toast: (m: string) => void): Promise<void> {
  try {
    const now = Date.now();
    const [backup, settings] = await Promise.all([exportBackup(), getSettings()]);
    const csv = studyCsv(backup, schedulerFor(settings), now);
    // 엑셀에서 열어도 한글이 깨지지 않게 BOM을 붙인다
    const res = await saveFile(studyFileName(now), `\uFEFF${csv}`, 'text/csv');
    if (res === 'cancelled') return;
    toast(res === 'shared' ? '학습 기록 파일을 보냈어요' : '학습 기록 파일을 다운로드 폴더에 저장했어요');
  } catch {
    toast('학습 기록을 만들지 못했어요. 다시 시도해 주세요');
  }
}

export async function runRestore(toast: (m: string) => void): Promise<void> {
  const text = await pickTextFile();
  if (text === null) return;
  try {
    const b = parseBackup(text);
    const words = b.notes.length;
    if (!(await ask(`지금 있는 데이터를 모두 지우고 백업(${b.exportedAt.slice(0, 10)}, 단어 ${words}개)으로 바꿀까요?`, '복원'))) return;
    await importBackup(b);
    toast(`복원했어요 · 단어 ${words}개`);
  } catch (e) {
    toast(e instanceof BackupError ? e.message : '복원하지 못했어요');
  }
}

export function daysSince(t: number | undefined, now = Date.now()): number | undefined {
  return t === undefined ? undefined : Math.floor((now - t) / 86_400_000);
}
