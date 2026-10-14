import { useEffect, useState } from 'react';
import { applyUpdate, currentVersion, fetchLatestVersion } from '../adapters/update/update';

const GUARD_KEY = 'flashcards-auto-update';

/** 같은 버전을 5분 안에 또 자동으로 받으려 하면(배포 캐시가 늦을 때) 새로고침이 계속 반복되지 않게 막는다 */
function autoAllowed(v: string): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(GUARD_KEY) ?? 'null') as { v: string; at: number } | null;
    return !(last && last.v === v && Date.now() - last.at < 5 * 60_000);
  } catch {
    return true;
  }
}
function markAuto(v: string): void {
  try {
    sessionStorage.setItem(GUARD_KEY, JSON.stringify({ v, at: Date.now() }));
  } catch {
    /* 무시 */
  }
}

/**
 * 새 버전이 배포되면 자동으로 받아서 다시 연다 (앱을 열 때·다시 볼 때·2분마다 확인).
 * 복습 중이거나 단어를 입력 중이면(canReload=false) 끊지 않고 알림만 보이다가, 그 화면에서 나오면 바로 적용한다.
 * 덱·복습 기록은 그대로다 (applyUpdate 참고).
 */
export function UpdateBanner({ canReload }: { canReload: boolean }) {
  const [latest, setLatest] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () =>
      void fetchLatestVersion().then((v) => {
        if (v && v !== currentVersion()) setLatest(v);
      });
    check();
    const t = setInterval(check, 2 * 60_000);
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);

  useEffect(() => {
    if (!latest || !canReload || busy || !autoAllowed(latest)) return;
    markAuto(latest);
    setBusy(true);
    void applyUpdate(latest);
  }, [latest, canReload, busy]);

  if (!latest) return null;
  return (
    <div className={`update-banner${canReload ? '' : ' update-banner-low'}`} role="alert">
      <span>{busy ? '새 버전으로 업데이트하는 중…' : canReload ? `새 버전이 있어요 (${latest})` : '새 버전이 있어요. 이 화면을 나가면 자동으로 업데이트돼요'}</span>
      {!busy && (
        <button
          type="button"
          onClick={() => {
            setBusy(true);
            void applyUpdate(latest);
          }}
        >
          지금 업데이트
        </button>
      )}
    </div>
  );
}
