import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareAnswer, type AnswerComparison } from '../../core/answer/compare';
import { getCardType } from '../../core/cardTypes/registry';
import type { Rating } from '../../core/model/types';
import { formatInterval } from '../../core/scheduler/format';
import { assumeAnswered, buildQueue, hasUnsavedAnswers, stateOf } from '../../core/scheduler/queue';
import { recordReview, undoReview } from '../../adapters/storage/repo';
import { play, stopAll } from '../../adapters/speech/speech';
import { CardFace } from '../components/CardFace';
import { WordFamilyPanel } from '../components/WordFamilyPanel';
import { RegisterPairs } from '../components/RegisterPairs';
import { Icon } from '../components/Icon';
import { VoiceMeter } from '../components/VoiceMeter';
import { useCards, useDecks, useNotes, useNow, useScheduler, useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';
import { syncWithDrive } from '../driveSync';
import { SyncBadge } from '../components/SyncBadge';
import { useVoiceAnswer } from '../useVoiceAnswer';
import { NoteEditor } from './NoteEditor';
import { withTimeout } from '../../adapters/net';
import { noVoiceMessage } from '../langs';

const warned = new Set<string>();

const LABELS: Record<Rating, string> = { 1: '다시', 2: '어려움', 3: '알았음', 4: '쉬움' };

interface Done {
  /** 저장이 끝나기 전에는 없다 (되돌리기는 저장이 끝난 뒤에) */
  logId?: string;
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
  /**
   * 방금 답한 카드 → 답한 시각. 저장소 목록이 갱신되기 전(폰이 느릴 때)에도 같은 카드를 다시 고르지 않게
   * 대기열을 만들 때 "답한 것"으로 간주한다 (assumeAnswered).
   */
  const [answered, setAnswered] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<AnswerComparison>();
  // 저장 중 두 번 눌리지 않게. 혹시 저장이 끝나지 않아도 몇 초 뒤엔 다시 누를 수 있다.
  const busySince = useRef(0);
  const isBusy = () => Date.now() - busySince.current < 4000;

  const deck = deckId ? decks?.find((d) => d.id === deckId) : undefined;

  const q = useMemo(() => {
    if (!settings || !decks || !cards) return undefined;
    return buildQueue({
      now,
      tzOffsetMin: new Date(now).getTimezoneOffset(),
      dayStartHour: settings.dayStartHour,
      cards: assumeAnswered(cards, answered),
      decks,
      scheduler,
      deckId,
      learnAheadMs: settings.learnAheadMin * 60_000,
    });
  }, [settings, decks, cards, answered, scheduler, now, deckId]);
  const unsaved = !!cards && hasUnsavedAnswers(cards, answered);

  const show = useCallback((id: string | undefined, side = false) => {
    setCurrentId(id);
    setFlipped(side);
    setShownAt(Date.now());
    setAnswer('');
    setChecked(undefined);
  }, []);

  // 다음 카드 고르기 (방금 답한 카드는 목록 갱신 전이라도 고르지 않는다)
  useEffect(() => {
    if (!q || currentId) return;
    if (q.next) show(q.next.id);
  }, [q, currentId, show]);

  // 목록에 반영된 답은 기억에서 지운다. 아주 오래(10초) 반영되지 않으면 그냥 놓아준다 (저장 실패는 따로 알림이 뜬다)
  useEffect(() => {
    if (!cards) return;
    const done = Object.entries(answered).filter(([id, at]) => {
      const c = cards.find((x) => x.id === id);
      return !c || (c.lastReviewAt ?? 0) >= at || (!saving.current.has(id) && Date.now() - at > 10_000);
    });
    if (done.length) {
      setAnswered((a) => {
        const next = { ...a };
        for (const [id] of done) delete next[id];
        return next;
      });
    }
    if (done.length === Object.keys(answered).length) return;
    const t = setTimeout(() => setAnswered((a) => ({ ...a })), 10_500);
    return () => clearTimeout(t);
  }, [cards, answered]);

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
            ? noVoiceMessage(r.missing)
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

  /** 저장이 끝나지 않은 답 (카드 id) */
  const saving = useRef(new Set<string>());

  /**
   * 답하기. 누르는 즉시 다음 카드로 넘어가고, 저장은 뒤에서 한다.
   * (저장을 기다리는 동안 같은 카드가 화면에 남아 있으면, 저장이 끝나는 순간 버튼 간격이 바뀌어
   *  "같은 카드가 또 나온 것"처럼 보이고 한 번 더 누르게 된다.)
   * 저장에 실패하면 알리고, 그 카드는 다시 대기열로 돌아간다.
   */
  const rate = useCallback(
    (r: Rating) => {
      if (!card || saving.current.has(card.id)) return;
      const id = card.id;
      const at = Date.now();
      // 소리·마이크 정리는 실패해도 답하기를 막지 않게 따로 한다
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
      saving.current.add(id);
      setAnswered((a) => ({ ...a, [id]: at }));
      setHistory((h) => [...h, { cardId: id, rating: r }]);
      show(undefined);
      withTimeout(recordReview(id, r, Math.min(at - shownAt, 120_000)), 30_000, '저장이 너무 오래 걸려요. 앱을 완전히 닫았다가 다시 열어 주세요')
        .then((logId) => setHistory((h) => h.map((d) => (d.cardId === id && !d.logId ? { ...d, logId } : d))))
        .catch((e: unknown) => {
          setHistory((h) => h.filter((d) => !(d.cardId === id && !d.logId)));
          setAnswered((a) => {
            const next = { ...a };
            delete next[id];
            return next;
          });
          toast(`저장하지 못했어요 · 이 카드는 다시 나와요 · ${e instanceof Error ? e.message : String(e)}`);
        })
        .finally(() => saving.current.delete(id));
    },
    [card, shownAt, show, toast, voice],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || isBusy()) {
      toast('되돌릴 복습이 없어요');
      return;
    }
    if (!last.logId) {
      toast('방금 답한 것을 저장하는 중이에요. 잠깐 뒤에 다시 눌러 주세요');
      return;
    }
    const logId = last.logId;
    busySince.current = Date.now();
    try {
      await withTimeout(undoReview(logId), 6000, '되돌리기가 너무 오래 걸려요');
      setHistory((h) => h.slice(0, -1));
      setAnswered((a) => {
        const next = { ...a };
        delete next[last.cardId];
        return next;
      });
      show(last.cardId, true);
    } catch (e) {
      toast(`되돌리지 못했어요 · ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busySince.current = 0;
    }
  }, [history, show, toast]);

  const buttons = settings?.buttons === 4 ? ([1, 2, 3, 4] as Rating[]) : ([1, 3] as Rating[]);

  // PC 키보드: 스페이스/엔터 = 뒤집기, 1~4 = 답, R = 발음 듣기
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editing || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'r' || e.key === 'R') {
        say(flipped ? 'back' : 'front');
      } else if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
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
  }, [flipped, flip, rate, editing, settings?.buttons, say]);

  // 복습을 다 끝내면 Google Drive와 바로 맞춘다 (로그인 창 없이, 받아 둔 토큰이 있을 때만)
  const finished = !!q && !card && !q.waiting && !unsaved && history.length > 0;
  useEffect(() => {
    if (finished) void syncWithDrive({ interactive: false }).catch(() => {});
  }, [finished]);

  if (!settings || !decks || !cards || !notes || !q) return <div className="screen" />;

  if (editing && note) {
    return <NoteEditor mode="edit" noteId={note.id} onDone={() => setEditing(false)} />;
  }

  const close = () => {
    // 나갈 때도 창 없이 맞춘다 (받아 둔 로그인이 없으면 조용히 건너뛴다. 못 올린 건 동기화 아이콘이 알려 준다)
    if (history.length) void syncWithDrive({ interactive: false }).catch(() => {});
    go(''); // 복습을 닫으면(끝났든 중간이든) 메인 화면으로
  };
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
      <button type="button" className="icon-btn" aria-label="발음 듣기" title="발음 듣기 (R)" onClick={() => say(flipped ? 'back' : 'front')} disabled={!view}>
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
              방금 배운 카드 {q.waiting.count}장이 {at}쯤 ({formatInterval(Math.max(0, q.waiting.nextDue - now))} 뒤) 다시 나와요.
              <br />
              이 화면을 켜 두면 때가 되면 바로 보여줘요. 앱을 닫았다가 그때 다시 열어도 돼요.
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
    if (unsaved) return <>{topBar}</>; // 방금 답한 것이 저장소에 반영되는 중
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
          <SyncBadge inline />
        </div>
        <div className="answer-bar">
          <button type="button" className="btn btn-primary" onClick={() => go('')}>
            홈으로
          </button>
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
      <CardFace blocks={faceBlocks} side={flipped ? 'back' : 'front'} onSpeak={() => say(flipped ? 'back' : 'front')} />
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
      {flipped && note.typeId === 'id-spoken' && <RegisterPairs current={note} notes={notes} cards={cards} />}
      {flipped && note.typeId === 'id-spoken' && <WordFamilyPanel key={note.id} current={note} notes={notes} cards={cards} />}
      {!flipped && !produce && !hasControls && <div className="flip-hint">아무 곳이나 탭해서 정답 보기</div>}
      <div className="answer-bar">
        {!flipped ? (
          produce ? (
            <button type="button" className="reveal" onClick={flip} style={answer.trim() ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}>
              {answer.trim() ? '확인' : '모르겠어요 · 정답 보기'}
            </button>
          ) : (
            <button type="button" className="reveal" onClick={flip}>
              정답 보기<kbd className="key-hint">Space</kbd>
            </button>
          )
        ) : (
          buttons.map((r) => (
            <button key={r} type="button" className={`grade grade-${r}`} onClick={() => rate(r)}>
              <span className="grade-label">
                {LABELS[r]}
                <kbd className="key-hint">{settings.buttons === 4 ? r : r === 1 ? 1 : 2}</kbd>
              </span>
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
