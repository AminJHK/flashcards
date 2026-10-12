import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { memoryByDeck, type MemoryBreakdown } from '../../core/stats/memory';
import { db } from '../../adapters/storage/db';
import { useNow, useScheduler, useSettings } from '../hooks';

/** 기억이 약한 쪽 → 단단한 쪽 순서. 색은 한 가지 색의 진하기로만 (새 카드는 회색) */
const PARTS = [
  ['fresh', '새 카드', 'mem-0'],
  ['learning', '배우는 중', 'mem-1'],
  ['growing', '자라는 중', 'mem-2'],
  ['solid', '탄탄함', 'mem-3'],
] as const;

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function useMemoryByDeck(): Map<string, MemoryBreakdown> | undefined {
  const settings = useSettings();
  const scheduler = useScheduler(settings);
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  const now = useNow(60_000);
  return useMemo(() => (cards ? memoryByDeck(cards, scheduler, now) : undefined), [cards, scheduler, now]);
}

function summary(m: MemoryBreakdown): string {
  const parts = PARTS.map(([k, label]) => `${label} ${m[k]}장`).join(', ');
  return m.recall === undefined ? `아직 복습한 카드가 없어요. ${parts}` : `지금 기억할 확률 ${pct(m.recall)}. ${parts}`;
}

function Bar({ m, thin }: { m: MemoryBreakdown; thin?: boolean }) {
  return (
    <div className={`mem-bar${thin ? ' thin' : ''}`} role="img" aria-label={summary(m)}>
      {m.total === 0 ? (
        <span className="mem-seg mem-0" style={{ flex: 1 }} />
      ) : (
        PARTS.filter(([k]) => m[k] > 0).map(([k, label, cls]) => <span key={k} className={`mem-seg ${cls}`} style={{ flex: m[k] }} title={`${label} ${m[k]}장`} />)
      )}
    </div>
  );
}

/** 덱 목록 한 줄에 들어가는 작은 막대 */
export function MemoryMini({ m }: { m: MemoryBreakdown | undefined }) {
  if (!m || !m.total) return null;
  return (
    <span className="mem-mini">
      <Bar m={m} thin />
      <span className="faint small">
        {m.recall === undefined ? '아직 시작 전' : `기억 ${pct(m.recall)}`} · 탄탄 {m.solid}/{m.total}
      </span>
    </span>
  );
}

/** 덱 하나의 기억 상태: 큰 숫자 + 막대 + 칸별 개수 */
export function MemoryPanel({ m, title }: { m: MemoryBreakdown; title?: string }) {
  return (
    <div className="mem-panel">
      <div className="mem-head">
        {title && <span className="mem-title">{title}</span>}
        {m.recall === undefined ? (
          <span className="faint small">아직 복습한 카드가 없어요</span>
        ) : (
          <span className="mem-recall">
            <strong>{pct(m.recall)}</strong>
            <span className="faint small">지금 기억할 확률</span>
          </span>
        )}
      </div>
      <Bar m={m} />
      <ul className="mem-legend">
        {PARTS.map(([k, label, cls]) => (
          <li key={k}>
            <i className={`mem-sw ${cls}`} aria-hidden="true" />
            <span className="muted">{label}</span>
            <span className="mem-n">{m[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
