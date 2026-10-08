import { useState } from 'react';
import { dayToDate, yearColumns } from '../../core/stats/heatmap';
import { Heatmap, HeatmapNumbers } from '../components/Heatmap';
import { Icon } from '../components/Icon';
import { go } from '../router';
import { useReviewStats } from '../useReviewStats';

export function Stats() {
  const data = useReviewStats();
  const thisYear = data ? dayToDate(data.today).getUTCFullYear() : new Date().getFullYear();
  const [year, setYear] = useState<number>();
  if (!data) return <div className="screen" />;
  const y = year ?? thisYear;
  const firstYear = Math.min(thisYear, ...[...data.counts.keys()].map((d) => dayToDate(d).getUTCFullYear()));
  const yearTotal = [...data.counts.entries()].filter(([d]) => dayToDate(d).getUTCFullYear() === y).reduce((s, [, c]) => s + c.count, 0);

  return (
    <div className="screen">
      <button type="button" className="back-btn" onClick={() => go('')}>
        <Icon name="chevronLeft" size={20} />
        오늘
      </button>
      <div className="screen-head">
        <h1 className="title">복습 기록</h1>
      </div>

      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="icon-btn" aria-label="이전 해" disabled={y <= firstYear} onClick={() => setYear(y - 1)}>
            <Icon name="chevronLeft" size={20} />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 17 }}>
            {y}년 <span className="faint" style={{ fontWeight: 400, fontSize: 14 }}>· {yearTotal}장</span>
          </span>
          <button type="button" className="icon-btn" aria-label="다음 해" disabled={y >= thisYear} onClick={() => setYear(y + 1)}>
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
        <Heatmap key={y} columns={yearColumns(y, data.today).filter((col) => col.some((d) => d !== null))} counts={data.counts} average={data.stats.dailyAverage} today={data.today} scrollToEnd={y === thisYear} />
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <HeatmapNumbers s={data.stats} />
      </div>
      <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.6 }}>
        지금까지 모두 {data.stats.total}장 복습했어요. 되돌린 복습은 세지 않아요.
      </span>
    </div>
  );
}
