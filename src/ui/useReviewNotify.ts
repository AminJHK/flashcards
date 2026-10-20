import { liveQuery } from 'dexie';
import { useEffect } from 'react';
import { isNativeApp } from '../adapters/native/platform';
import { applyAnswers, onNotifyAnswers, scheduleAlarms } from '../adapters/native/reviewNotify';
import { db } from '../adapters/storage/db';

/**
 * 안드로이드 앱의 복습 알림 (adapters/native/reviewNotify.ts).
 * 복습 기록이 바뀔 때마다(앱에서 답함, 알림에서 답함) 바로 다시 계산해서 예약한다.
 * 앱을 내리는 신호(visibilitychange)는 앱 안의 웹 화면에서 잘 안 올 수 있어서 기다리지 않는다 (2026-10-20 "알람이 안 와").
 * 앱 화면이 보이는 동안 울릴 알림은 휴대폰 쪽(ReviewReceiver)이 띄우지 않는다.
 */
export function useReviewNotify(): void {
  useEffect(() => {
    if (!isNativeApp()) return;
    let busy = Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () =>
      (busy = busy
        .then(async () => {
          await applyAnswers();
          await scheduleAlarms();
        })
        .catch(() => undefined));
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 800);
    };
    sync();
    // 복습 기록·설정이 바뀌면 다시 예약
    const sub = liveQuery(() => Promise.all([db.reviewLogs.count(), db.settings.get('settings')])).subscribe({ next: soon, error: () => {} });
    document.addEventListener('visibilitychange', soon);
    const off = onNotifyAnswers(sync);
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
      document.removeEventListener('visibilitychange', soon);
      off();
    };
  }, []);
}
