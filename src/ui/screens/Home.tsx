import { ScreenSync } from '../components/ScreenSync';
import { useMemo } from 'react';
import { getCardType } from '../../core/cardTypes/registry';
import { buildQueue } from '../../core/scheduler/queue';
import { daysSince, runBackup } from '../backup';
import { driveErrorMessage } from '../driveBackup';
import { syncWithDrive } from '../driveSync';
import { dayToDate, weekColumns } from '../../core/stats/heatmap';
import { durationLabel, Heatmap, HeatmapNumbers } from '../components/Heatmap';
import { Icon } from '../components/Icon';
import { useReviewStats } from '../useReviewStats';
import { useCards, useDecks, useNotes, useNow, useScheduler, useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';

/** 히트맵을 처음 공부한 주부터 보여 준다 (최대 26주). 기록이 없으면 이번 주만 */
function heatWeeks(counts: Map<number, unknown>, today: number): number {
  const first = counts.size ? Math.min(...counts.keys()) : today;
  const monday = (d: number) => d - ((dayToDate(d).getUTCDay() + 6) % 7);
  return Math.max(1, Math.min(26, (monday(today) - monday(first)) / 7 + 1));
}

export function Home() {
  const settings = useSettings();
  const decks = useDecks();
  const cards = useCards();
  const notes = useNotes();
  const scheduler = useScheduler(settings);
  const now = useNow(60_000);
  const toast = useToast();
  const record = useReviewStats();

  const q = useMemo(() => {
    if (!settings || !decks || !cards) return undefined;
    return buildQueue({ now, tzOffsetMin: new Date(now).getTimezoneOffset(), dayStartHour: settings.dayStartHour, cards, decks, scheduler, learnAheadMs: settings.learnAheadMin * 60_000 });
  }, [settings, decks, cards, scheduler, now]);

  if (!settings || !decks || !cards || !notes || !q) return <div className="screen" />;

  const dateLabel = new Date(now).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  const total = q.counts.review + q.counts.learning + q.counts.newc;
  const backupDays = daysSince(settings.lastBackupAt, now);
  const drive = settings.googleDrive?.clientId;
  // 파일 백업 알림은 Drive를 연결하지 않았을 때만 (Drive를 연결했으면 동기화 아이콘이 대신 알려 준다)
  const needBackup = notes.length > 0 && !drive && (backupDays === undefined || backupDays >= 7);

  if (decks.length === 0) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1 className="title title-lg">오늘</h1>
        </div>
        <div className="panel empty">
          <strong style={{ fontSize: 20 }}>환영해요</strong>
          <span className="muted" style={{ lineHeight: 1.6 }}>
            먼저 덱을 하나 만들어 보세요.
            <br />
            중국어 단어, 인도네시아어 단어, 중국어 작문 중에서 고를 수 있어요.
          </span>
          <button type="button" className="btn btn-primary" onClick={() => go('decks/new')}>
            첫 덱 만들기
          </button>
          <span className="faint small">준비된 덱(심장 병동 간호 중국어)도 있어요.</span>
        </div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 20 }}>
          <strong style={{ fontSize: 17 }}>다른 기기에서 쓰던 덱이 있나요?</strong>
          <span className="muted small" style={{ lineHeight: 1.6 }}>
            폰이나 PC에서 Google Drive를 연결해 두었다면, 여기서도 Google로 로그인해서 덱과 복습 기록을 그대로 불러올 수 있어요.
          </span>
          <button
            type="button"
            className="btn btn-plain"
            style={{ height: 52 }}
            onClick={() =>
              settings.googleDrive?.clientId
                ? void syncWithDrive({ interactive: true }).then(
                    (r) => toast(r?.hadRemote ? `불러왔어요 · 단어 ${r.notes}개` : 'Drive에 불러올 데이터가 없어요'),
                    (e) => toast(driveErrorMessage(e)),
                  )
                : go('settings/backup')
            }
          >
            Google로 불러오기
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="screen">
        <ScreenSync />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {dateLabel}
          </span>
          <h1 className="title title-lg">오늘</h1>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="big-count">
            <strong>{total}</strong>
            <span className="muted" style={{ fontSize: 18 }}>
              {total ? '장 남았어요' : q.waiting ? '장 · 잠시 뒤에 더 있어요' : '장 · 오늘은 끝'}
            </span>
          </div>
          <span className="muted" style={{ fontSize: 15 }}>
            복습 {q.counts.review + q.counts.learning} · 새 카드 {q.counts.newc}
            {total > 0 && ` · 약 ${Math.max(1, Math.round((total * 12) / 60))}분`}
          </span>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>
            덱
          </div>
          {decks.map((d) => {
            const c = q.byDeck[d.id] ?? { review: 0, learning: 0, newc: 0 };
            const rev = c.review + c.learning;
            const has = rev + c.newc > 0;
            return (
              <button key={d.id} type="button" className="deck-row" onClick={() => go(has ? `review/${d.id}` : `decks/${d.id}`)}>
                <span className="row-text">
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{d.name}</span>
                  <span className="faint small">{getCardType(d.settings.defaultTypeId).name}</span>
                </span>
                {has ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    {rev > 0 && <span className="chip chip-accent">복습 {rev}</span>}
                    {c.newc > 0 && <span className="chip">새 {c.newc}</span>}
                  </span>
                ) : (
                  <span className="faint small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="check" size={16} strokeWidth={2} />
                    오늘 끝
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {notes.length === 0 && (
          <div className="panel empty" style={{ padding: 24 }}>
            <span className="muted">아직 단어가 없어요.</span>
            <button type="button" className="btn btn-primary" onClick={() => go('add')}>
              단어 추가하기
            </button>
          </div>
        )}

        {needBackup && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', fontSize: 14 }} className="faint">
            <span style={{ flex: 1 }}>{backupDays === undefined ? '아직 백업하지 않았어요' : `마지막 백업 ${backupDays}일 전`}</span>
            <button type="button" className="link-btn" onClick={() => runBackup(toast)}>
              지금 백업
            </button>
          </div>
        )}
        {record && (
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>
                {record.todayCount ? `오늘 ${record.todayCount.count}장${record.todayCount.ms ? ` · ${durationLabel(record.todayCount.ms)}` : ''} 공부했어요` : '오늘은 아직 복습하지 않았어요'}
              </span>
              <button type="button" className="link-btn" style={{ padding: '4px 0' }} onClick={() => go('stats')}>
                전체 보기
              </button>
            </div>
            <Heatmap columns={weekColumns(record.today, heatWeeks(record.counts, record.today))} counts={record.counts} average={record.stats.dailyAverage} today={record.today} scrollToEnd />
            <HeatmapNumbers s={record.stats} />
          </div>
        )}

      </div>
    </>
  );
}
