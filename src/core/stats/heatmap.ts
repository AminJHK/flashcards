import { studyDay } from '../model/day';
import type { ReviewLog } from '../model/types';

/** 학습일별 복습 수와 걸린 시간. 되돌린(void) 복습은 세지 않는다. */
export interface DayCount {
  count: number;
  ms: number;
}

export function countsByDay(logs: readonly ReviewLog[], tzOffsetMin: number, dayStartHour: number): Map<number, DayCount> {
  const voided = new Set<string>();
  for (const l of logs) if (l.kind === 'void') voided.add(l.voidsId);
  const out = new Map<number, DayCount>();
  for (const l of logs) {
    if (l.kind !== 'review' || voided.has(l.id)) continue;
    const d = studyDay(l.at, tzOffsetMin, dayStartHour);
    const c = out.get(d) ?? { count: 0, ms: 0 };
    c.count++;
    c.ms += Math.min(l.durationMs ?? 0, 120_000);
    out.set(d, c);
  }
  return out;
}

export interface HeatmapStats {
  total: number;
  /** 첫 복습일부터 오늘까지 하루 평균 복습 수 */
  dailyAverage: number;
  /** 첫 복습일부터 오늘까지 공부한 날 비율 (0~100) */
  daysLearnedPct: number;
  longestStreak: number;
  /** 오늘(오늘 안 했으면 어제)까지 이어진 연속 일수 */
  currentStreak: number;
}

export function heatmapStats(counts: Map<number, DayCount>, today: number): HeatmapStats {
  const days = [...counts.keys()].filter((d) => d <= today && counts.get(d)!.count > 0).sort((a, b) => a - b);
  if (!days.length) return { total: 0, dailyAverage: 0, daysLearnedPct: 0, longestStreak: 0, currentStreak: 0 };
  const total = days.reduce((s, d) => s + counts.get(d)!.count, 0);
  const span = today - days[0]! + 1;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const has = (d: number) => (counts.get(d)?.count ?? 0) > 0;
  let current = 0;
  for (let d = has(today) ? today : today - 1; has(d); d--) current++;
  return {
    total,
    dailyAverage: Math.round(total / span),
    daysLearnedPct: Math.round((days.length / span) * 100),
    longestStreak: longest,
    currentStreak: current,
  };
}

/** 색 진하기 0~4. 하루 평균을 기준으로 나눈다 (Anki 히트맵과 비슷하게). */
export function level(count: number, average: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  const a = Math.max(1, average);
  if (count < a * 0.5) return 1;
  if (count < a) return 2;
  if (count < a * 1.5) return 3;
  return 4;
}

/** 학습일 번호 → 그날의 달력 날짜 (UTC 기준 Date, getUTC*로 읽는다) */
export function dayToDate(day: number): Date {
  return new Date(day * 86_400_000);
}

/**
 * 히트맵 칸 배치: 월요일 시작 주 단위 열. weeks개 열, 마지막 열이 today가 든 주.
 * null은 오늘 이후의 빈칸.
 */
export function weekColumns(today: number, weeks: number): (number | null)[][] {
  const mondayIndex = (dayToDate(today).getUTCDay() + 6) % 7; // 월=0 … 일=6
  const lastMonday = today - mondayIndex;
  const cols: (number | null)[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = lastMonday - w * 7;
    cols.push(Array.from({ length: 7 }, (_, i) => (start + i <= today ? start + i : null)));
  }
  return cols;
}

/** 한 해의 열 (그해 1월 1일이 든 주 ~ 12월 31일이 든 주) */
export function yearColumns(year: number, today: number): (number | null)[][] {
  const first = Math.floor(Date.UTC(year, 0, 1) / 86_400_000);
  const last = Math.floor(Date.UTC(year, 11, 31) / 86_400_000);
  const start = first - ((dayToDate(first).getUTCDay() + 6) % 7);
  const cols: (number | null)[][] = [];
  for (let s = start; s <= last; s += 7) {
    cols.push(Array.from({ length: 7 }, (_, i) => {
      const d = s + i;
      return d < first || d > last || d > today ? null : d;
    }));
  }
  return cols;
}
