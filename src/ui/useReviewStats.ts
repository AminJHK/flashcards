import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { studyDay } from '../core/model/day';
import { countsByDay, heatmapStats } from '../core/stats/heatmap';
import { db } from '../adapters/storage/db';
import { useNow, useSettings } from './hooks';

/** 복습 로그로 학습일별 개수와 통계를 만든다 (이 기기의 현재 시간대·하루 시작 시각 기준). */
export function useReviewStats() {
  const settings = useSettings();
  const logs = useLiveQuery(() => db.reviewLogs.toArray(), []);
  const now = useNow(60_000);
  return useMemo(() => {
    if (!settings || !logs) return undefined;
    const tz = new Date(now).getTimezoneOffset();
    const counts = countsByDay(logs, tz, settings.dayStartHour);
    const today = studyDay(now, tz, settings.dayStartHour);
    return { counts, today, stats: heatmapStats(counts, today), todayCount: counts.get(today) };
  }, [settings, logs, now]);
}
