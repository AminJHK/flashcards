import { useEffect, useState } from 'react';
import { driveErrorMessage } from '../driveBackup';
import { syncWithDrive } from '../driveSync';
import { useSyncStatus } from '../useSyncStatus';
import { useToast } from '../toast';
import { Icon, type IconName } from './Icon';

function ago(t: number | undefined, now: number): string {
  if (!t) return '아직 한 번도 안 맞췄어요';
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

/**
 * 동기화 상태를 작은 구름 아이콘으로 보여 준다 (글자는 마우스를 올리거나 읽어 주는 말로만).
 * ☁✓ 동기화됨(종료해도 돼요) · ☁↑ 3 올리지 않은 기록 3개 · ☁! 실패 · 돌면 동기화 중. 누르면 바로 동기화한다.
 * inline이면 아이콘 옆에 짧은 글자도 함께 (복습 끝 화면).
 */
export function SyncBadge({ inline = false }: { inline?: boolean }) {
  const st = useSyncStatus();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!st) return null;

  const sync = async () => {
    try {
      const r = await syncWithDrive({ interactive: true });
      if (r) toast('Drive와 맞췄어요. 종료해도 돼요');
    } catch (e) {
      toast(`동기화하지 못했어요 · ${driveErrorMessage(e)}`);
    }
  };

  const ok = st.pending === 0 && !st.failed && !!st.lastSyncAt;
  const icon: IconName = st.failed ? 'cloudAlert' : ok ? 'cloudCheck' : st.pending > 0 ? 'cloudUp' : 'cloud';
  const full = st.syncing
    ? '동기화 중…'
    : st.failed
      ? '동기화 실패 · 누르면 다시'
      : st.pending > 0
        ? `아직 올리지 않은 기록 ${st.pending}개 · 누르면 동기화`
        : st.lastSyncAt
          ? `동기화됨 · ${ago(st.lastSyncAt, now)} · 종료해도 돼요`
          : '아직 동기화 전 · 누르면 동기화';
  const short = st.syncing ? '동기화 중' : st.failed ? '실패' : st.pending > 0 ? `${st.pending}` : '';
  const state = st.failed ? 'fail' : ok ? 'ok' : 'warn';
  return (
    <button type="button" className={`sync-icon sync-${state}${st.syncing ? ' sync-spin' : ''}${inline ? ' sync-inline' : ''}`} onClick={sync} disabled={st.syncing} aria-label={full} title={full}>
      <Icon name={icon} size={inline ? 20 : 18} strokeWidth={2} />
      {inline ? <span>{full}</span> : short && <span>{short}</span>}
    </button>
  );
}
