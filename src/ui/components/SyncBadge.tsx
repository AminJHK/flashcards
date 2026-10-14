import { useEffect, useState } from 'react';
import { driveErrorMessage } from '../driveBackup';
import { syncWithDrive } from '../driveSync';
import { useSyncStatus } from '../useSyncStatus';
import { useToast } from '../toast';
import { Icon } from './Icon';

function ago(t: number | undefined, now: number): string {
  if (!t) return '아직 한 번도 안 맞췄어요';
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

/**
 * "지금 종료해도 되나?"에 답한다. 초록 = 이 기기의 기록이 모두 Drive에 올라갔음.
 * 아니면 몇 개가 아직이라고 알려 주고, 누르면 바로 맞춘다 (버튼을 누른 것이라 로그인 창도 열 수 있다).
 */
export function SyncBadge({ className = '' }: { className?: string }) {
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
  const label = st.syncing
    ? '동기화 중…'
    : st.failed
      ? '동기화 실패 · 누르면 다시'
      : st.pending > 0
        ? `아직 올리지 않은 기록 ${st.pending}개 · 누르면 동기화`
        : st.lastSyncAt
          ? `동기화됨 · ${ago(st.lastSyncAt, now)} · 종료해도 돼요`
          : '아직 동기화 전 · 누르면 동기화';
  return (
    <button type="button" className={`sync-badge ${ok ? 'sync-ok' : 'sync-warn'} ${className}`} onClick={sync} disabled={st.syncing} aria-label={label}>
      <Icon name={ok ? 'check' : 'clock'} size={16} strokeWidth={2.2} />
      <span>{label}</span>
    </button>
  );
}
