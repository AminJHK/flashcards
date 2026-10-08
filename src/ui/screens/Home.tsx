import { useMemo } from 'react';
import { getCardType } from '../../core/cardTypes/registry';
import { buildQueue } from '../../core/scheduler/queue';
import { daysSince, runBackup } from '../backup';
import { Icon } from '../components/Icon';
import { useCards, useDecks, useNotes, useNow, useScheduler, useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';

export function Home() {
  const settings = useSettings();
  const decks = useDecks();
  const cards = useCards();
  const notes = useNotes();
  const scheduler = useScheduler(settings);
  const now = useNow(60_000);
  const toast = useToast();

  const q = useMemo(() => {
    if (!settings || !decks || !cards) return undefined;
    return buildQueue({ now, tzOffsetMin: new Date(now).getTimezoneOffset(), dayStartHour: settings.dayStartHour, cards, decks, scheduler });
  }, [settings, decks, cards, scheduler, now]);

  if (!settings || !decks || !cards || !notes || !q) return <div className="screen" />;

  const dateLabel = new Date(now).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  const total = q.counts.review + q.counts.learning + q.counts.newc;
  const backupDays = daysSince(settings.lastBackupAt, now);
  const needBackup = notes.length > 0 && (backupDays === undefined || backupDays >= 7);

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
      </div>
    );
  }

  return (
    <>
      <div className="screen">
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
      </div>
      <div className="bottom-bar">
        <button
          type="button"
          className="btn btn-primary"
          aria-disabled={total === 0}
          onClick={() => (total ? go('review') : toast(q.waiting ? '남은 카드는 잠시 뒤에 다시 나와요' : '오늘 복습은 모두 끝났어요'))}
        >
          {total ? '복습 시작' : '오늘 복습 끝'}
        </button>
      </div>
    </>
  );
}
