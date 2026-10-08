import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareAnswer, type AnswerComparison } from '../../core/answer/compare';
import { getCardType } from '../../core/cardTypes/registry';
import type { Rating } from '../../core/model/types';
import { formatInterval } from '../../core/scheduler/format';
import { buildQueue, stateOf } from '../../core/scheduler/queue';
import { recordReview, undoReview } from '../../adapters/storage/repo';
import { play, stopAll } from '../../adapters/speech/speech';
import { CardFace } from '../components/CardFace';
import { Icon } from '../components/Icon';
import { VoiceMeter } from '../components/VoiceMeter';
import { useCards, useDecks, useNotes, useNow, useScheduler, useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';
import { backupToDrive, driveBackupDue, driveErrorMessage } from '../driveBackup';
import { useVoiceAnswer } from '../useVoiceAnswer';
import { NoteEditor } from './NoteEditor';
import { withTimeout } from '../../adapters/net';

const warned = new Set<string>();

const LABELS: Record<Rating, string> = { 1: '다시', 2: '어려움', 3: '알았음', 4: '쉬움' };

interface Done {
  logId: string;
  cardId: string;
  rating: Rating;
}

export function Review({ deckId }: { deckId?: string }) {
  const settings = useSettings();
  const decks = useDecks();
  const cards = useCards();
  const notes = useNotes();
  const scheduler = useScheduler(settings);
  const now = useNow(15_000);
  const toast = useToast();

  const [currentId, setCurrentId] = useState<string>();
  const [flipped, setFlipped] = useState(false);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [history, setHistory] = useState<Done[]>([]);
  /** 방금 답한 카드. 저장소가 갱신되기 전의 낡은 대기열에서 같은 카드를 다시 고르지 않으려고 */
  const [pending, setPending] = useState<{ cardId: string; at: number }>();
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<AnswerComparison>();
  // 저장 중 두 번 눌리지 않게. 혹시 저장이 끝나지 않아도 몇 초 뒤엔 다시 누를 수 있다.
  const busySince = useRef(0);
  const isBusy = () => Date.now() - busySince.current < 4000;

  const deck = deckId ? decks?.find((d) => d.id === deckId) : undefined;

  const q = useMemo(() => {
    if (!settings || !decks || !cards) return undefined;
    return buildQueue({ now, tzOffsetMin: new Date(now).getTimezoneOffset(), dayStartHour: settings.dayStartHour, cards, decks, scheduler, deckId });
  }, [settings, decks, cards, scheduler, now, deckId]);

  const show = useCallback((id: string | undefined, side = false) => {
    setCurrentId(id);
    setFlipped(side);
    setShownAt(Date.now());
    setAnswer('');
    setChecked(undefined);
  }, []);

  // 다음 카드 고르기
  useEffect(() => {
    if (!q || !cards || currentId) return;
    if (pending) {
      const c = cards.find((x) => x.id === pending.cardId);
      if (c && (c.lastReviewAt ?? 0) < pending.at) return; // 아직 저장소 갱신 전
      setPending(undefined);
    }
    if (q.next) show(q.next.id);
  }, [q, cards, currentId, pending, show]);

  // 저장소 갱신 소식이 늦거나 오지 않아도 빈 화면에 멈춰 있지 않게
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(undefined), 1500);
    return () => clearTimeout(t);
  }, [pending]);

  const card = currentId ? cards?.find((c) => c.id === currentId) : undefined;
  const note = card ? notes?.find((n) => n.id === card.noteId) : undefined;
  const cardDeck = card ? decks?.find((d) => d.id === card.deckId) : undefined;

  // 보던 카드가 지워졌으면 다음으로
  useEffect(() => {
    if (currentId && cards && notes && (!card || !note)) show(undefined);
  }, [currentId, card, note, cards, notes, show]);

  const type = note ? getCardType(note.typeId) : undefined;
  const template = type && card ? type.templates.find((t) => t.id === card.templateId) : undefined;
  const view = type && card && note && cardDeck ? type.view(card.templateId, { fields: note.fields, deck: cardDeck, ttsOverride: note.ttsOverride }) : undefined;
  const produce = template?.answer === 'produce';

  const say = useCallback(
    (side: 'front' | 'back') => {
      if (!view) return;
      const items = side === 'back' ? view.tts.back : view.tts.front.length ? view.tts.front : view.tts.back;
      if (!items.length) return;
      void play(items, settings).then((r) => {
        // 안내는 같은 내용이면 한 번만
        const msg = r.error
          ? `Gemini 음성을 못 써서 기기 음성으로 읽었어요 · ${r.error}`
          : r.via === 'none'
            ? '이 기기에 이 언어의 음성이 없을 수 있어요. 설정에서 자연스러운 음성을 연결해 보세요'
            : undefined;
        if (msg && !warned.has(msg)) {
          warned.add(msg);
          toast(msg);
        }
      });
    },
    [view, settings, toast],
  );

  // 자동 재생
  const autoplay = view?.autoplay ?? cardDeck?.settings.autoplay ?? 'off';
  useEffect(() => {
    if (!view || editing) return;
    if (autoplay === 'front' && !flipped && view.tts.front.length) say('front');
    if (autoplay === 'back' && flipped) say('back');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, flipped, editing]);

  useEffect(() => () => stopAll(), []);

  const voice = useVoiceAnswer(
    settings,
    useCallback((t: string) => setAnswer((a) => (a ? `${a} ${t}` : t)), []),
    useCallback((m: string) => toast(m), [toast]),
  );

  const flip = useCallback(() => {
    if (flipped || !view) return;
    if (produce && view.expected) setChecked(compareAnswer(view.expected.text, answer));
    setFlipped(true);
  }, [flipped, view, produce, answer]);

  const previews = useMemo(() => {
    if (!card) return undefined;
    const t = Date.now();
    const p = scheduler.preview(stateOf(card), t);
    return { 1: formatInterval(p[1] - t), 2: formatInterval(p[2] - t), 3: formatInterval(p[3] - t), 4: formatInterval(p[4] - t) } as Record<Rating, string>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, card?.due, card?.reps, scheduler]);

  const rate = useCallback(
    async (r: Rating) => {
      if (!card) return;
      if (isBusy()) {
        toast('저장하는 중이에요. 잠깐만요');
        return;
      }
      busySince.current = Date.now();
      const at = Date.now();
      // 소리·마이크 정리는 실패해도 저장을 막지 않게 따로 한다
      try {
        stopAll();
      } catch {
        /* 무시 */
      }
      try {
        voice.cancel();
      } catch {
        /* 무시 */
      }
      try {
        const logId = await withTimeout(
          recordReview(card.id, r, Math.min(at - shownAt, 120_000)),
          6000,
          '저장이 너무 오래 걸려요. 앱을 완전히 닫았다가 다시 열어 주세요',
        );
        setHistory((h) => [...h, { logId, cardId: card.id, rating: r }]);
        setPending({ cardId: card.id, at });
        show(undefined);
      } catch (e) {
        toast(`저장하지 못했어요 · ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        busySince.current = 0;
      }
    },
    [card, shownAt, show, toast, voice],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || isBusy()) {
      toast('되돌릴 복습이 없어요');
      return;
    }
    busySince.current = Date.now();
    try {
      await withTimeout(undoReview(last.logId), 6000, '되돌리기가 너무 오래 걸려요');
      setHistory((h) => h.slice(0, -1));
      setPending(undefined);
      show(last.cardId, true);
    } catch (e) {
      toast(`되돌리지 못했어요 · ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busySince.current = 0;
    }
  }, [history, show, toast]);

  const buttons = settings?.buttons === 4 ? ([1, 2, 3, 4] as Rating[]) : ([1, 3] as Rating[]);

  // PC 키보드: 스페이스/엔터 = 뒤집기, 1~4 = 답
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        flip();
      } else if (flipped) {
        if (e.key === ' ' || e.key === 'Enter') rate(3);
        else if (['1', '2', '3', '4'].includes(e.key)) {
          const n = Number(e.key) as Rating;
          const r = settings?.buttons === 4 ? n : n === 1 ? 1 : n === 2 ? 3 : undefined;
          if (r) rate(r);
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [flipped, flip, rate, editing, settings?.buttons]);

  if (!settings || !decks || !cards || !notes || !q) return <div className="screen" />;

  if (editing && note) {
    return <NoteEditor mode="edit" noteId={note.id} onDone={() => setEditing(false)} />;
  }

  const close = () => go(deckId ? `decks/${deckId}` : '');
  const remaining = q.counts.review + q.counts.learning + q.counts.newc;
  const doneCount = history.length;
  const pct = doneCount + remaining ? Math.round((doneCount / (doneCount + remaining)) * 100) : 100;
  const againCount = history.filter((h) => h.rating === 1).length;

  const topBar = (
    <div className="review-top">
      <button type="button" className="icon-btn" aria-label="복습 닫기" onClick={close}>
        <Icon name="close" />
      </button>
      <div className="progress">
        <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="오늘 진행률">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="faint small" style={{ minWidth: 32, textAlign: 'right' }}>
          {remaining}
        </span>
      </div>
      <button type="button" className="icon-btn" aria-label="되돌리기" onClick={undo} disabled={!history.length}>
        <Icon name="undo" size={22} />
      </button>
      <button type="button" className="icon-btn" aria-label="카드 편집" onClick={() => setEditing(true)} disabled={!note}>
        <Icon name="edit" size={22} />
      </button>
      <button type="button" className="icon-btn" aria-label="발음 듣기" onClick={() => say(flipped ? 'back' : 'front')} disabled={!view}>
        <Icon name="speaker" size={22} />
      </button>
    </div>
  );

  if (!card || !view || !note) {
    if (q.waiting) {
      const at = new Date(q.waiting.nextDue).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
      return (
        <>
          {topBar}
          <div className="center-fill">
            <span className="done-icon">
              <Icon name="clock" size={36} strokeWidth={2} />
            </span>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>잠깐 쉬어도 돼요</h2>
            <span className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>
              방금 배운 카드 {q.waiting.count}장이 {at}쯤 다시 나와요.
              <br />
              이 화면을 켜 두면 때가 되면 바로 보여줘요.
            </span>
          </div>
          <div className="answer-bar" style={{ flexDirection: 'column', gap: 4 }}>
            <button type="button" className="btn btn-primary" onClick={() => show(q.waiting!.cardId)}>
              지금 바로 보기
            </button>
            <button type="button" className="btn btn-quiet" onClick={close}>
              나중에 하기
            </button>
          </div>
        </>
      );
    }
    if (pending) return <>{topBar}</>;
    return (
      <>
        {topBar}
        <div className="center-fill">
          <span className="done-icon">
            <Icon name="check" size={36} strokeWidth={2} />
          </span>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{deck ? `${deck.name} 끝` : '오늘 복습 끝'}</h2>
          <span className="muted" style={{ fontSize: 15 }}>
            {doneCount ? `${doneCount}장 복습 · 다시 ${againCount}번` : '지금은 볼 카드가 없어요'}
          </span>
        </div>
        <div className="answer-bar">
          {doneCount > 0 && driveBackupDue(settings) ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                backupToDrive().then(
                  () => {
                    toast('Google Drive에 백업했어요');
                    go('');
                  },
                  (e) => toast(driveErrorMessage(e)),
                )
              }
            >
              Drive에 백업하고 홈으로
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => go('')}>
              홈으로
            </button>
          )}
        </div>
      </>
    );
  }

  const deckLine = [cardDeck?.name, card.isNew ? '새 카드' : undefined, template?.optional ? '역방향' : undefined].filter(Boolean).join(' · ');
  const faceBlocks = flipped ? view.back : view.front;
  // 앞면에 버튼이 있는 카드(듣기)는 카드 전체를 탭 버튼으로 만들 수 없다
  const hasControls = view.front.some((b) => b.kind === 'listen');

  const cardInner = (
    <>
      <CardFace blocks={faceBlocks} onSpeak={() => say(flipped ? 'back' : 'front')} />
      {flipped && checked && <AnswerDiff c={checked} given={answer} />}
    </>
  );

  return (
    <>
      {topBar}
      <div className="deck-line">{deckLine}</div>
      {(produce || hasControls) && !flipped ? (
        <div className="card-area" data-flipped="false" style={{ cursor: 'default' }}>
          {cardInner}
          {produce && (
          <div className="produce">
            <textarea
              className="input input-sentence"
              lang={view.expected?.lang}
              rows={2}
              value={answer}
              placeholder="여기에 써보세요"
              aria-label="내 답"
              onChange={(e) => setAnswer(e.target.value)}
              style={{ fontFamily: 'var(--font-hanzi)' }}
            />
            {voice.supported && (
              <button
                type="button"
                className="icon-btn"
                aria-label={voice.state === 'listening' ? '말하기 끝내기' : '말해서 답하기'}
                aria-pressed={voice.state === 'listening'}
                disabled={voice.state === 'transcribing' || voice.state === 'starting'}
                onClick={() => view.expected && voice.toggle(view.expected.lang)}
                style={{
                  height: 'auto',
                  background: voice.state === 'listening' ? 'var(--accent)' : 'var(--surface)',
                  color: voice.state === 'listening' ? 'var(--on-accent)' : 'var(--text2)',
                  borderRadius: 14,
                }}
              >
                <Icon name={voice.state === 'listening' ? 'stop' : 'mic'} />
              </button>
            )}
          </div>
          )}
          {voice.state === 'listening' && <VoiceMeter level={voice.level} startedAt={voice.startedAt} maxMs={voice.maxMs} partial={voice.viaGemini ? undefined : voice.partial} />}
          {(voice.state === 'starting' || voice.state === 'transcribing') && (
            <span className="faint small" role="status">
              {voice.state === 'starting' ? '마이크 준비 중…' : '알아듣는 중…'}
            </span>
          )}
        </div>
      ) : (
        <button type="button" className="card-area" data-flipped={flipped} onClick={flip} aria-label={flipped ? '정답' : '정답 보기'}>
          {cardInner}
        </button>
      )}
      {!flipped && !produce && !hasControls && <div className="flip-hint">아무 곳이나 탭해서 정답 보기</div>}
      <div className="answer-bar">
        {!flipped ? (
          produce ? (
            <button type="button" className="reveal" onClick={flip} style={answer.trim() ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}>
              {answer.trim() ? '확인' : '모르겠어요 · 정답 보기'}
            </button>
          ) : (
            <button type="button" className="reveal" onClick={flip}>
              정답 보기
            </button>
          )
        ) : (
          buttons.map((r) => (
            <button key={r} type="button" className={`grade grade-${r}`} onClick={() => rate(r)}>
              <span className="grade-label">{LABELS[r]}</span>
              <span className="grade-iv">{previews?.[r]}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function AnswerDiff({ c, given }: { c: AnswerComparison; given: string }) {
  if (!given.trim()) return null;
  const verdict = c.exact ? '완벽해요' : `${Math.round(c.score * 100)}% 맞았어요`;
  return (
    <div className="diff" aria-label="내 답과 정답 비교">
      <span>내 답 · {verdict}</span>
      <span className="diff-line">
        {c.given.map((p, i) => (
          <span key={i} className={p.op === 'extra' ? 'diff-extra' : undefined}>
            {p.text}
          </span>
        ))}
      </span>
      {!c.exact && (
        <>
          <span>정답에서 빠진 부분</span>
          <span className="diff-line">
            {c.expected.map((p, i) => (
              <span key={i} className={p.op === 'missing' ? 'diff-missing' : undefined}>
                {p.text}
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
