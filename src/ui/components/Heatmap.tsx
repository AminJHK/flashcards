import { useLayoutEffect, useRef, useState } from 'react';
import { dayToDate, level, type DayCount } from '../../core/stats/heatmap';

const WEEKDAYS = ['월', '', '수', '', '금', '', '일'];

export function dayLabel(day: number): string {
  const d = dayToDate(day);
  return d.toLocaleDateString('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });
}

export function durationLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return `${Math.max(1, Math.round(ms / 1000))}초`;
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

/**
 * 복습 히트맵. 열 = 주(월요일 시작), 행 = 요일. 칸을 누르면 그날 기록을 보여준다.
 * scrollToEnd면 가로로 넘칠 때 맨 오른쪽(최근)부터 보여준다.
 */
export function Heatmap({
  columns,
  counts,
  average,
  today,
  scrollToEnd,
}: {
  columns: (number | null)[][];
  counts: Map<number, DayCount>;
  average: number;
  today: number;
  scrollToEnd?: boolean;
}) {
  const [picked, setPicked] = useState<number>();
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollToEnd && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [scrollToEnd, columns]);

  // 달이 바뀌는 열에 "N월" 표시
  const months = columns.map((col, i) => {
    const first = col.find((d) => d !== null);
    if (first === undefined || first === null) return '';
    const m = dayToDate(first).getUTCMonth();
    const prev = columns[i - 1]?.find((d) => d !== null);
    const pm = prev === undefined || prev === null ? -1 : dayToDate(prev).getUTCMonth();
    return m !== pm ? `${m + 1}월` : '';
  });

  const pickedCount = picked !== undefined ? counts.get(picked) : undefined;

  return (
    <div className="hm">
      <div className="hm-scroll" ref={scroller}>
        <div className="hm-grid" style={{ gridTemplateColumns: `16px repeat(${columns.length}, var(--hm-cell))` }}>
          <span />
          {months.map((m, i) => (
            <span key={`m${i}`} className="hm-month">
              {m}
            </span>
          ))}
          {WEEKDAYS.map((w, row) => (
            <Row key={row} label={w} row={row} columns={columns} counts={counts} average={average} today={today} picked={picked} onPick={setPicked} />
          ))}
        </div>
      </div>
      <div className="hm-foot">
        <span className="hm-picked" aria-live="polite">
          {picked !== undefined ? `${dayLabel(picked)} · ${pickedCount ? `${pickedCount.count}장${pickedCount.ms ? ` · ${durationLabel(pickedCount.ms)}` : ''}` : '쉰 날'}` : '칸을 누르면 그날 기록이 보여요'}
        </span>
        <span className="hm-legend" aria-hidden="true">
          적음
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`hm-c hm-${l}`} />
          ))}
          많음
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  row,
  columns,
  counts,
  average,
  today,
  picked,
  onPick,
}: {
  label: string;
  row: number;
  columns: (number | null)[][];
  counts: Map<number, DayCount>;
  average: number;
  today: number;
  picked?: number;
  onPick: (d: number) => void;
}) {
  return (
    <>
      <span className="hm-wd">{label}</span>
      {columns.map((col, i) => {
        const d = col[row];
        if (d === null || d === undefined) return <span key={i} />;
        const c = counts.get(d)?.count ?? 0;
        return (
          <button
            key={i}
            type="button"
            className={`hm-c hm-${level(c, average)}${d === today ? ' hm-today' : ''}${d === picked ? ' hm-picked-cell' : ''}`}
            aria-label={`${dayLabel(d)} ${c}장`}
            onClick={() => onPick(d)}
          />
        );
      })}
    </>
  );
}

export function HeatmapNumbers({ s }: { s: { dailyAverage: number; daysLearnedPct: number; longestStreak: number; currentStreak: number } }) {
  const items: [string, string][] = [
    ['하루 평균', `${s.dailyAverage}장`],
    ['공부한 날', `${s.daysLearnedPct}%`],
    ['최장 연속', `${s.longestStreak}일`],
    ['현재 연속', `${s.currentStreak}일`],
  ];
  return (
    <div className="hm-numbers">
      {items.map(([k, v]) => (
        <div key={k}>
          <strong>{v}</strong>
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}
