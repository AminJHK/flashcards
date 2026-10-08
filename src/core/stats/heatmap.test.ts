import { describe, expect, it } from 'vitest';
import type { ReviewLog } from '../model/types';
import { KST, review } from '../testUtil';
import { countsByDay, dayToDate, heatmapStats, level, weekColumns, yearColumns } from './heatmap';

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h) + KST * 60_000; // 현지 h시

describe('히트맵', () => {
  it('되돌린 복습은 세지 않고, 새벽 4시 전은 전날로 센다', () => {
    const a = review('c', 3, at(2026, 10, 8));
    const b = review('c', 1, at(2026, 10, 8, 13));
    const v: ReviewLog = { id: 'v', cardId: 'c', kind: 'void', voidsId: b.id, at: at(2026, 10, 8, 13), tzOffsetMin: KST };
    const late = review('c', 3, at(2026, 10, 9, 2)); // 10/9 새벽 2시 → 10/8로
    const m = countsByDay([a, b, v, late], KST, 4);
    expect([...m.values()].map((c) => c.count)).toEqual([2]);
    const day = [...m.keys()][0]!;
    expect(dayToDate(day).toISOString().slice(0, 10)).toBe('2026-10-08');
  });

  it('하루 평균·공부한 날·연속 일수', () => {
    const c = (n: number) => ({ count: n, ms: 0 });
    // 1~3일 공부, 4일 쉼, 5~6일 공부, 오늘(7일)은 아직
    const m = new Map([[1, c(10)], [2, c(20)], [3, c(30)], [5, c(5)], [6, c(5)]]);
    const s = heatmapStats(m, 7);
    expect(s.total).toBe(70);
    expect(s.dailyAverage).toBe(10); // 70 / 7일
    expect(s.daysLearnedPct).toBe(71);
    expect(s.longestStreak).toBe(3);
    expect(s.currentStreak).toBe(2); // 오늘 안 했으면 어제까지
    m.set(7, c(1));
    expect(heatmapStats(m, 7).currentStreak).toBe(3);
    expect(heatmapStats(new Map(), 7)).toMatchObject({ total: 0, currentStreak: 0 });
  });

  it('색 진하기는 하루 평균 기준', () => {
    expect([0, 3, 8, 12, 30].map((n) => level(n, 10))).toEqual([0, 1, 2, 3, 4]);
  });

  it('주 단위 열: 월요일 시작, 마지막 열에 오늘', () => {
    const today = Math.floor(Date.UTC(2026, 9, 8) / 86_400_000); // 2026-10-08 목요일
    const cols = weekColumns(today, 3);
    expect(cols).toHaveLength(3);
    const last = cols[2]!;
    expect(dayToDate(last[0]!).toISOString().slice(0, 10)).toBe('2026-10-05'); // 월요일
    expect(last[3]).toBe(today);
    expect(last.slice(4)).toEqual([null, null, null]);
  });

  it('한 해의 열은 1월 1일 ~ 12월 31일만 칸이 있다', () => {
    const today = Math.floor(Date.UTC(2030, 0, 1) / 86_400_000);
    const cols = yearColumns(2026, today);
    expect(cols.length).toBeGreaterThanOrEqual(53);
    const filled = cols.flat().filter((d) => d !== null);
    expect(filled).toHaveLength(365);
  });
});
