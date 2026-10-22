import { ScreenSync } from '../components/ScreenSync';
import { useState } from 'react';
import { dayToDate, yearColumns } from '../../core/stats/heatmap';
import { Heatmap, HeatmapNumbers } from '../components/Heatmap';
import { Icon } from '../components/Icon';
import { MemoryPanel, useMemoryByDeck } from '../components/MemoryBar';
import { useDecks } from '../hooks';
import { go } from '../router';
import { useReviewStats } from '../useReviewStats';

export function Stats() {
  const data = useReviewStats();
  const decks = useDecks();
  const memory = useMemoryByDeck();
  const thisYear = data ? dayToDate(data.today).getUTCFullYear() : new Date().getFullYear();
  const [year, setYear] = useState<number>();
  if (!data) return <div className="screen" />;
  const y = year ?? thisYear;
  const firstYear = Math.min(thisYear, ...[...data.counts.keys()].map((d) => dayToDate(d).getUTCFullYear()));
  const yearTotal = [...data.counts.entries()].filter(([d]) => dayToDate(d).getUTCFullYear() === y).reduce((s, [, c]) => s + c.count, 0);

  return (
    <div className="screen">
      <ScreenSync />
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

      {decks && memory && decks.some((d) => memory.get(d.id)?.total) && (
        <>
          <span className="section-label" style={{ paddingTop: 8 }}>
            덱별 기억 상태
          </span>
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
            {decks
              .filter((d) => memory.get(d.id)?.total)
              .map((d) => (
                <MemoryPanel key={d.id} m={memory.get(d.id)!} title={d.name} />
              ))}
          </div>
          <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.6 }}>
            단계는 FSRS가 계산한 기억의 안정도(잊지 않고 버티는 기간)로 나눠요: 막 외움 1주 미만, 자라는 중 1주~1달, 탄탄함 1달~6달, 완전히 앎 6달 이상. 기억할 확률은 FSRS가 계산한, 지금 시험을 보면 맞힐 확률의 평균이에요.
          </span>
        </>
      )}
      <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.6 }}>
        지금까지 모두 {data.stats.total}장 복습했어요. 되돌린 복습은 세지 않아요.
      </span>
    </div>
  );
}
