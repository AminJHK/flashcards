import { useEffect } from 'react';
import { isNativeApp } from '../adapters/native/platform';
import { applyAnswers, clearAlarms, onNotifyAnswers, scheduleAlarms } from '../adapters/native/reviewNotify';

/**
 * 안드로이드 앱의 복습 알림 (adapters/native/reviewNotify.ts).
 * 앱 화면이 보이면 알림에서 누른 답을 넣고 알림을 끈다. 앱을 내리면(화면이 꺼져도) 지금 상태로 다시 계산해 예약한다.
 * 앱이 뒤에 있는 동안 알림에서 답하면 바로 기록하고 다시 예약한다.
 */
export function useReviewNotify(): void {
  useEffect(() => {
    if (!isNativeApp()) return;
    let busy = Promise.resolve();
    const run = (f: () => Promise<unknown>) => {
      busy = busy.then(f).then(
        () => undefined,
        () => undefined,
      );
    };
    const sync = () =>
      run(async () => {
        await applyAnswers();
        if (document.visibilityState === 'visible') await clearAlarms();
        else await scheduleAlarms();
      });
    sync();
    document.addEventListener('visibilitychange', sync);
    const off = onNotifyAnswers(sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      off();
    };
  }, []);
}
