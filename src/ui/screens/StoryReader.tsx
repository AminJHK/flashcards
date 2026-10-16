import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { play, setPlaybackRate, stopAll, type PlayResult } from '../../adapters/speech/speech';
import { GEMINI_VOICES } from '../../adapters/gemini/tts';
import { db } from '../../adapters/storage/db';
import { addNote, saveSettings } from '../../adapters/storage/repo';
import { getProgress, saveProgress } from '../../adapters/storage/stories';
import { chunkSegments } from '../../core/stories/chunks';
import { nameSet } from '../../core/stories/plan';
import { NARRATOR, roleOf, storyVoice } from '../../core/stories/voices';
import type { StoryBlock, StoryLine, StoryProgress, StoryQuestion, Story } from '../../core/stories/types';
import { analyzeText, findGloss, glossFor, type Lexicon, type Span } from '../../core/stories/vocab';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Controls';
import { useNotes, useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';
import { storyDeckId, useLexicon } from '../useLexicon';

const STATUS_TEXT = { known: '아는 단어', learning: '배우는 중', deckNew: '덱에 있어요 · 아직 안 배움' } as const;

/** 이야기마다 늘 같은 순서로 섞는다 (다시 열어도 선택지 순서가 같게) */
function shuffled<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Picked {
  span: Span;
  line: StoryLine;
}

export function StoryReader({ id }: { id: string }) {
  const story = useLiveQuery(() => db.stories.get(id), [id]);
  const [progress, setProgress] = useState<StoryProgress>();
  const [result, setResult] = useState(false);
  const [listening, setListening] = useState(false);
  const [playingAll, setPlayingAll] = useState(false);
  const [replayLine, setReplayLine] = useState<number>();
  const replayToken = useRef(0);
  const [picked, setPicked] = useState<Picked>();
  /** 단어·의미 단위를 눌렀을 때의 짧은 뜻 말풍선 */
  const [tip, setTip] = useState<Tip>();
  /** 재생 버튼이 가리키는 줄 (블록 번호). 없으면 지금 보이는 마지막 줄 */
  const [cursor, setCursor] = useState<number>();
  const [audioStatus, setAudioStatus] = useState('');
  const [audioOpen, setAudioOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState<number>();
  const [voiceDraft, setVoiceDraft] = useState<Record<string, Record<string, string>>>({});
  const lex = useLexicon();
  const settings = useSettings();
  const end = useRef<HTMLDivElement>(null);
  const autoplay = settings?.storyAutoplay !== false;
  const autoModelSwitch = settings?.storyAutoModelSwitch !== false;
  const playbackRate = rateDraft ?? settings?.storyPlaybackRate ?? 0.85;
  const voiceAssignments = useMemo(
    () => ({ ...(settings?.storyVoices?.[id] ?? {}), ...(voiceDraft[id] ?? {}) }),
    [settings?.storyVoices, voiceDraft, id],
  );
  // A short debounce avoids writing the whole settings record on every slider tick.
  useEffect(() => {
    if (rateDraft === undefined) return;
    const timer = setTimeout(() => { void saveSettings({ storyPlaybackRate: rateDraft }); }, 350);
    return () => clearTimeout(timer);
  }, [rateDraft]);
  // Leave the story: cancel sequential listening as well as current audio.
  useEffect(() => () => {
    replayToken.current++;
    stopAll();
  }, []);

  useEffect(() => {
    void getProgress(id).then((p) => {
      setProgress(p);
      if (p.completedAt) setResult(true);
    });
  }, [id]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progress?.position]);

  // Free TTS quotas can be very small. Don't synthesize upcoming lines in the background:
  // generate only when the user actually reaches/plays the line; audio is still cached.

  if (story === undefined || !progress || !lex) return <div className="screen" />;
  if (!story) {
    return (
      <div className="screen">
        <span className="muted">이야기를 찾을 수 없어요.</span>
        <button type="button" className="btn btn-plain" onClick={() => go('read')}>
          목록으로
        </button>
      </div>
    );
  }

  const names = nameSet(story.characters, story.properNouns);
  const shown = story.blocks.slice(0, progress.position);
  const current = story.blocks[progress.position - 1]!;
  const waiting = current.kind !== 'line' && progress.answers[progress.position - 1] === undefined;
  const last = progress.position >= story.blocks.length;
  const update = (p: StoryProgress) => {
    setProgress(p);
    void saveProgress(p);
  };
  const speakLine = (line: StoryLine, requestedVoice?: string, cachedOnly = false) => {
    const voice = requestedVoice ?? storyVoice(story, roleOf(story, line), voiceAssignments);
    setAudioStatus(settings?.gemini?.useTts && settings.gemini.apiKey ? 'Gemini 음성 준비 중…' : '기기 음성 준비 중…');
    return play([{ text: line.text, lang: 'id-ID', style: 'story' }], settings, {
      timeoutMs: 30_000,
      voice,
      rate: playbackRate,
      storyAutoModel: autoModelSwitch,
      cachedOnly,
      awaitDevice: cachedOnly,
      onSource: (source: PlayResult) => {
        if (source.via === 'gemini') {
          const switched = source.model !== settings?.gemini?.ttsModel;
          setAudioStatus(`Gemini AI · ${source.model}${switched ? ' (자동 전환)' : ''} · ${voice} · ${source.cached ? '저장된 음성' : '새 음성'} · ${playbackRate.toFixed(2)}배속`);
        }
        else if (source.via === 'device') setAudioStatus(source.error ? `기기 음성으로 대체됨 · Gemini 오류: ${source.error}` : '기기 음성으로 읽는 중 · 역할별 목소리는 Gemini에서 지원');
        else setAudioStatus(source.error ? `음성 오류: ${source.error}` : '사용할 수 있는 음성이 없어요');
      },
    });
  };
  const stopReplay = () => {
    replayToken.current++;
    stopAll();
    setPlayingAll(false);
    setReplayLine(undefined);
  };
  const replayLines = story.blocks.filter((block): block is StoryLine => block.kind === 'line');
  const replayAll = async () => {
    stopReplay();
    const run = replayToken.current;
    setPlayingAll(true);
    try {
      for (let i = 0; i < replayLines.length; i++) {
        if (run !== replayToken.current) break;
        setReplayLine(i);
        // Saved Gemini clips only. Missing clips use phone TTS, without new API costs.
        await speakLine(replayLines[i]!, undefined, true);
      }
    } finally {
      if (run === replayToken.current) {
        setPlayingAll(false);
        setReplayLine(undefined);
      }
    }
  };
  const replayOne = (i: number) => {
    stopReplay();
    const run = replayToken.current;
    setReplayLine(i);
    void speakLine(replayLines[i]!, undefined, true).finally(() => {
      if (run === replayToken.current) setReplayLine(undefined);
    });
  };
  const changeVoice = (role: string, voice: string) => {
    const updated = { ...voiceAssignments, [role]: voice };
    setVoiceDraft((prev) => ({ ...prev, [id]: updated }));
    void saveSettings({ storyVoices: { ...(settings?.storyVoices ?? {}), [id]: updated } });
  };
  const changeRate = (rate: number) => {
    setRateDraft(rate);
    setPlaybackRate(rate);
  };

    const isLine = (i: number) => story.blocks[i]?.kind === 'line';
  // 재생 버튼: 이전 줄 / 지금 줄 다시 / 다음 줄 (보이는 줄 안에서 움직이고, 맨 끝에서 다음 줄이 이야기 줄이면 이어서 펼친다)
  let at = cursor !== undefined && cursor < shown.length && isLine(cursor) ? cursor : -1;
  for (let i = shown.length - 1; at < 0 && i >= 0; i--) if (isLine(i)) at = i;
  const prevAt = (() => {
    for (let i = at - 1; i >= 0; i--) if (isLine(i)) return i;
    return -1;
  })();
  const nextShown = (() => {
    for (let i = at + 1; i < shown.length; i++) if (isLine(i)) return i;
    return -1;
  })();
  // 보이는 다음 줄이 없고 마지막 블록이면, 오른쪽 버튼이 "다 읽었어요"가 된다
  const finish = nextShown < 0 && !waiting && last;
  const playAt = (i: number) => {
    setCursor(i);
    void speakLine(story.blocks[i] as StoryLine);
  };
  const next = (forcePlay = false) => {
    setCursor(undefined);
    if (last) {
      stopAll();
      update({ ...progress, completedAt: Date.now(), readCount: progress.readCount + 1 });
      setResult(true);
      return;
    }
    const position = progress.position + 1;
    update({ ...progress, position });
    const b = story.blocks[position - 1]!;
    if (b.kind === 'line' && (autoplay || forcePlay)) void speakLine(b);
    else {
      stopAll();
      setAudioStatus('');
    }
  };
  const toggleAutoplay = () => {
    const enabled = !autoplay;
    void saveSettings({ storyAutoplay: enabled });
    if (!enabled) {
      stopAll();
      setAudioStatus('');
    } else if (!result && current.kind === 'line') void speakLine(current);
  };
  const answer = (index: number, correct: boolean) => {
    if (progress.answers[index] !== undefined) return;
    update({ ...progress, answers: { ...progress.answers, [index]: correct } });
  };
  const pct = Math.round((progress.position / story.blocks.length) * 100);

  return (
    <>
      <div className="review-top">
        <button type="button" className="icon-btn" aria-label="이야기 닫기" onClick={() => go('read')}>
          <Icon name="close" />
        </button>
        <div className="progress">
          <div className="progress-track" role="progressbar" aria-valuenow={result ? 100 : pct} aria-valuemin={0} aria-valuemax={100} aria-label="이야기 진행률">
            <div className="progress-fill" style={{ width: `${result ? 100 : pct}%` }} />
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="음성 속도와 목소리 설정" aria-expanded={audioOpen} onClick={() => setAudioOpen(true)}>
          <Icon name="settings" size={22} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="줄이 나올 때 자동으로 읽기"
          aria-pressed={autoplay}
          style={autoplay ? { color: 'var(--accent)' } : undefined}
          onClick={toggleAutoplay}
        >
          <Icon name="speaker" size={22} />
        </button>
      </div>
      {!!audioStatus && (!result || listening) && <div className="story-playback-status" role="status" aria-live="polite">{audioStatus}</div>}
      {listening ? (
        <StoryListening
          story={story}
          activeLine={replayLine}
          playingAll={playingAll}
          onPlayAll={() => { void replayAll(); }}
          onStop={stopReplay}
          onPlayLine={replayOne}
          onBack={() => {
            stopReplay();
            setAudioStatus('');
            setListening(false);
          }}
        />
      ) : result ? (
        <StoryResult story={story} progress={progress} lex={lex}
          onListen={() => {
            setAudioStatus('');
            setListening(true);
          }}
          onRestart={() => {
            stopReplay();
            setCursor(undefined);
            update({ ...progress, position: 1, answers: {}, completedAt: undefined });
            setResult(false);
          }} />
      ) : (
        <>
          <div className="screen story-body">
            <div className="story-title">
              <h1>{story.title}</h1>
              {story.titleKo && <span className="faint small">{story.titleKo}</span>}
              <span className="faint small story-hint">단어를 누르면 뜻 · 문장을 길게 누르면 전체 뜻</span>
            </div>
            {shown.map((b, i) =>
              b.kind === 'line' ? (
                <LineView key={i} line={b} active={i === at} story={story} lex={lex} names={names} tipKey={tip?.line === b ? tip.key : undefined} onTip={(t) => setTip((cur) => (cur?.line === b && cur.key === t.key ? undefined : { ...t, line: b }))} onSay={() => {
                    setCursor(i);
                    void speakLine(b);
                  }} />
              ) : i === shown.length - 1 ? (
                <QuestionView key={i} q={b} seed={`${story.id}:${i}`} result={progress.answers[i]} onAnswer={(c) => answer(i, c)} />
              ) : (
                <AnsweredQuestion key={i} q={b} correct={progress.answers[i]} />
              ),
            )}
            <div ref={end} />
          </div>
          {at >= 0 && (
            <div className="story-player" role="group" aria-label="소리 듣기">
              <button type="button" className="story-play-btn" aria-label="이전 문장 읽기" disabled={prevAt < 0} onClick={() => playAt(prevAt)}>
                <Icon name="prevLine" size={24} />
              </button>
              <button type="button" className="story-play-btn story-play-main" aria-label="현재 문장 다시 읽기" onClick={() => playAt(at)}>
                <Icon name="replay" size={26} />
              </button>
              <button
                type="button"
                className={`story-play-btn${finish ? ' story-play-main' : ''}`}
                aria-label={finish ? '다 읽었어요' : '다음 문장 읽기'}
                disabled={nextShown < 0 && waiting}
                onClick={() => (nextShown >= 0 ? playAt(nextShown) : next(true))}
              >
                <Icon name={finish ? 'check' : 'nextLine'} size={finish ? 28 : 24} strokeWidth={finish ? 2.4 : undefined} />
              </button>
            </div>
          )}
          {waiting && <div className="story-player-hint" role="status">답을 골라 주세요</div>}
        </>
      )}
      {tip && (
        <WordTip
          tip={tip}
          onClose={() => setTip(undefined)}
          onMore={
            tip.span
              ? () => {
                  setPicked({ span: tip.span!, line: tip.line });
                  setTip(undefined);
                }
              : undefined
          }
        />
      )}
      {picked && <WordSheet picked={picked} story={story} lex={lex} onClose={() => setPicked(undefined)} />}
      {audioOpen && (
        <StoryAudioSheet
          story={story}
          rate={playbackRate}
          voices={voiceAssignments}
          onRate={changeRate}
          onVoice={changeVoice}
          onPreview={(line, voice) => speakLine(line, voice)}
          onClose={() => {
            if (rateDraft !== undefined) void saveSettings({ storyPlaybackRate: playbackRate });
            setAudioOpen(false);
          }}
          hasGemini={!!(settings?.gemini?.apiKey && settings.gemini.useTts)}
          autoModelSwitch={autoModelSwitch}
          onAutoModelSwitch={(enabled) => void saveSettings({ storyAutoModelSwitch: enabled })}
        />
      )}
    </>
  );
}

/** Reading-only audio controls. Every line is synthesized separately, so the cast may have >2 voices. */
function StoryAudioSheet({ story, rate, voices, onRate, onVoice, onPreview, onClose, hasGemini, autoModelSwitch, onAutoModelSwitch }: {
  story: Story;
  rate: number;
  voices: Record<string, string>;
  onRate: (v: number) => void;
  onVoice: (role: string, voice: string) => void;
  onPreview: (line: StoryLine, voice: string) => void;
  onClose: () => void;
  hasGemini: boolean;
  autoModelSwitch: boolean;
  onAutoModelSwitch: (enabled: boolean) => void;
}) {
  const cast = [{ id: NARRATOR, name: '나레이션' }, ...story.characters.map((c) => ({ id: c.id, name: c.name }))];
  return (
    <div className="dialog-backdrop story-word-backdrop" onClick={onClose}>
      <div className="dialog story-audio-sheet" role="dialog" aria-modal="true" aria-label="이야기 음성 설정" onClick={(e) => e.stopPropagation()}>
        <div className="story-sheet-handle" aria-hidden="true" />
        <div className="story-audio-header">
          <h2>이야기 음성</h2>
          <button type="button" className="icon-btn" aria-label="음성 설정 닫기" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <section className="story-audio-section">
          <div className="story-audio-title"><strong>읽기 속도</strong><strong className="story-audio-rate">{rate.toFixed(2)}×</strong></div>
          <input type="range" className="story-audio-slider" aria-label="이야기 읽기 속도" min="0.6" max="1.2" step="0.05" value={rate}
            onChange={(e) => onRate(Number(e.target.value))} />
          <div className="story-audio-range"><span>천천히 · 0.6×</span><span>빠르게 · 1.2×</span></div>
          <span className="story-audio-hint">재생 중에도 바뀌고, 저장된 음성을 다시 만들지 않아요.</span>
        </section>
        <section className="story-audio-section">
          <div className="story-audio-title">
            <strong>무료 TTS 모델 자동 전환</strong>
            <Switch checked={autoModelSwitch} onChange={onAutoModelSwitch} label="무료 TTS 모델 자동 전환" />
          </div>
          <p className="story-audio-hint">선택한 모델이 사용량 제한에 걸리면 다른 무료 TTS 모델로 바꿔요. 이미 저장된 음성은 먼저 재사용하고, 모델에 따라 목소리 느낌이 조금 달라질 수 있어요.</p>
        </section>
        <section className="story-audio-section">
          <div className="story-audio-title"><strong>역할별 목소리</strong><span className="story-audio-hint">Gemini TTS</span></div>
          {!hasGemini && <p className="story-audio-hint">현재 기기 음성이에요. 역할별 목소리를 들으려면 설정에서 Gemini 음성을 켜 주세요.</p>}
          <div className="story-audio-cast">
            {cast.map((person) => {
              const voice = storyVoice(story, person.id, voices);
              const sample = story.blocks.find((block): block is StoryLine => block.kind === 'line' && roleOf(story, block) === person.id);
              return (
                <div className="story-audio-person" key={person.id}>
                  <span className="story-audio-person-name">{person.name}</span>
                  <select className="select" aria-label={`${person.name} 목소리`} value={voice} onChange={(e) => onVoice(person.id, e.target.value)}>
                    {GEMINI_VOICES.map(([name, description]) => <option key={name} value={name}>{name} · {description}</option>)}
                  </select>
                  <button type="button" className="icon-btn story-audio-preview" disabled={!sample} aria-label={`${person.name} 목소리 미리 듣기`}
                    onClick={() => { if (sample) onPreview(sample, voice); }}>
                    <Icon name="speaker" size={19} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <button type="button" className="btn btn-primary story-audio-done" onClick={onClose}>완료</button>
      </div>
    </div>
  );
}

function Avatar({ story, speaker }: { story: Story; speaker: string }) {
  const c = story.characters.find((x) => x.id === speaker);
  if (!c) return null;
  return (
    <span className={`story-avatar av-${c.color}`} aria-hidden="true">
      {c.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface Tip {
  /** 같은 줄에서 무엇을 눌렀는지 (다시 누르면 닫는다) */
  key: string;
  text: string;
  ko?: string;
  rect: DOMRect;
  /** 자세히 보기(덱에 추가 등)로 열 단어 */
  span?: Span;
  line: StoryLine;
}

const WORSE: Record<string, number> = { known: 0, learning: 1, deckNew: 2, outside: 3, name: -1 };

/**
 * 한 줄의 글. 듀오링고처럼 의미 단위(없으면 단어)를 누르면 뜻이 말풍선으로 짧게 나온다.
 * 모르는 단어(덱의 새 단어·덱 밖 단어)가 든 묶음은 색 밑줄.
 */
function Tokens({ line, story, lex, names, tipKey, onTip }: { line: StoryLine; story: Story; lex: Lexicon; names: Set<string>; tipKey?: string; onTip: (t: Omit<Tip, 'line'>) => void }) {
  const text = line.text;
  const spans = useMemo(() => analyzeText(text, lex, names), [text, lex, names]);
  const segs = useMemo(() => (line.chunks?.length ? chunkSegments(text, line.chunks) : []), [text, line.chunks]);
  const out: React.ReactNode[] = [];
  const press = (key: string, label: string, ko: string | undefined, span: Span | undefined) => (e: React.MouseEvent<HTMLButtonElement>) =>
    onTip({ key, text: label, ko, rect: e.currentTarget.getBoundingClientRect(), span });
  const wordButton = (sp: Span, i: number) =>
    sp.cls === 'name' ? (
      <span key={`w${i}`}>{sp.text}</span>
    ) : (
      <button key={`w${i}`} type="button" className={`w w-${sp.cls}${tipKey === `w${sp.start}` ? ' w-on' : ''}`} onClick={press(`w${sp.start}`, sp.text, glossFor(sp, story.glossary).ko, sp)}>
        {sp.text}
      </button>
    );
  // 의미 단위가 덮지 않는 곳은 단어 단위로
  const words = (from: number, to: number) => {
    let at = from;
    spans.forEach((sp, i) => {
      if (sp.start < from || sp.end > to) return;
      if (sp.start > at) out.push(text.slice(at, sp.start));
      out.push(wordButton(sp, i));
      at = sp.end;
    });
    if (at < to) out.push(text.slice(at, to));
  };
  let at = 0;
  for (const seg of segs) {
    words(at, seg.start);
    const inside = spans.filter((sp) => sp.start >= seg.start && sp.end <= seg.end);
    const worst = inside.reduce<Span | undefined>((w, sp) => (!w || WORSE[sp.cls]! > WORSE[w.cls]! ? sp : w), undefined);
    const label = text.slice(seg.start, seg.end);
    const key = `c${seg.start}`;
    out.push(
      <button key={key} type="button" className={`w w-${worst && worst.cls !== 'name' ? worst.cls : 'known'}${tipKey === key ? ' w-on' : ''}`} onClick={press(key, label, seg.ko, worst?.cls === 'name' ? undefined : worst)}>
        {label}
      </button>,
    );
    at = seg.end;
  }
  words(at, text.length);
  return <>{out}</>;
}

/** 길게 누르면 (0.45초) 문장 전체의 뜻을 보여 준다. 길게 누른 뒤의 클릭은 단어 뜻을 열지 않게 막는다 */
function useLongPress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number }>(undefined);
  const fired = useRef(false);
  const clear = () => clearTimeout(timer.current);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLong();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  };
}

function LineView({ line, active, story, lex, names, tipKey, onTip, onSay }: { line: StoryLine; active: boolean; story: Story; lex: Lexicon; names: Set<string>; tipKey?: string; onTip: (t: Omit<Tip, 'line'>) => void; onSay: () => void }) {
  const [showKo, setShowKo] = useState(false);
  const long = useLongPress(() => setShowKo(true));
  const speakerName = story.characters.find((c) => c.id === line.speaker)?.name;
  const body = (
    <div className="story-text">
      <p className="story-p" {...long}>
        <Tokens line={line} story={story} lex={lex} names={names} tipKey={tipKey} onTip={onTip} />
      </p>
      {showKo && line.ko && (
        <button type="button" className="story-ko" aria-label="전체 뜻 닫기" onClick={() => setShowKo(false)}>
          {line.ko}
        </button>
      )}
    </div>
  );
  const say = (
    <button type="button" className="icon-btn story-say" aria-label="이 문장 듣기" onClick={onSay}>
      <Icon name="speaker" size={20} />
    </button>
  );
  if (!speakerName) {
    return (
      <div className={`story-narration${active ? ' story-active' : ''}`}>
        {say}
        {body}
      </div>
    );
  }
  return (
    <div className={`story-line${active ? ' story-active' : ''}`}>
      <Avatar story={story} speaker={line.speaker} />
      <div className="story-bubble">
        <span className="story-name">{speakerName}</span>
        <div className="story-bubble-row">
          {say}
          {body}
        </div>
      </div>
    </div>
  );
}

/** 누른 곳 바로 아래(공간이 없으면 위)에 뜨는 짧은 뜻. 바깥을 누르거나 화면이 움직이면 닫힌다 */
function WordTip({ tip, onClose, onMore }: { tip: Tip; onClose: () => void; onMore?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; above: boolean }>();
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const cx = tip.rect.left + tip.rect.width / 2;
    const left = Math.min(Math.max(12, cx - w / 2), vw - w - 12);
    const above = tip.rect.bottom + 12 + h > window.innerHeight - 140;
    setPos({ left, top: above ? tip.rect.top - h - 10 : tip.rect.bottom + 10, arrow: Math.min(Math.max(16, cx - left), w - 16), above });
  }, [tip]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (box.current?.contains(t) || t?.closest?.('.w')) return;
      onClose();
    };
    const scroll = () => onClose();
    document.addEventListener('pointerdown', down);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [onClose]);
  return (
    <div
      ref={box}
      className={`word-tip${pos?.above ? ' above' : ''}`}
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top, ['--arrow' as string]: `${pos.arrow}px` } : { left: -9999, top: 0 }}
    >
      <span className="word-tip-ko">{tip.ko || '뜻 정보가 없어요'}</span>
      {onMore && (
        <button type="button" className="word-tip-more" aria-label={`${tip.text} 자세히 보기`} onClick={onMore}>
          <Icon name="chevronRight" size={18} />
        </button>
      )}
    </div>
  );
}

function questionTitle(q: StoryQuestion): string {
  return q.kind === 'choice' ? q.prompt : q.kind === 'truefalse' ? q.statement : q.kind === 'gap' ? '빈칸에 들어갈 말은?' : '짝을 맞춰 보세요';
}

function AnsweredQuestion({ q, correct }: { q: StoryQuestion; correct?: boolean }) {
  return (
    <div className={`story-answered ${correct ? 'ok' : 'miss'}`}>
      <Icon name={correct ? 'check' : 'close'} size={16} strokeWidth={2.4} />
      <span>{questionTitle(q)}</span>
    </div>
  );
}

function QuestionView({ q, seed, result, onAnswer }: { q: StoryQuestion; seed: string; result?: boolean; onAnswer: (correct: boolean) => void }) {
  const [chosen, setChosen] = useState<number | boolean>();
  const done = result !== undefined;
  const feedback = done && (
    <div className={`story-feedback ${result ? 'ok' : 'miss'}`} role="status">
      <strong>{result ? '맞았어요!' : '아쉬워요'}</strong>
      {q.kind !== 'match' && (
        <span>
          {!result && q.kind === 'truefalse' && `정답: ${q.answer ? '맞아요' : '틀려요'}. `}
          {!result && (q.kind === 'choice' || q.kind === 'gap') && `정답: ${q.options[q.answer]}. `}
          {q.explain}
        </span>
      )}
    </div>
  );
  if (q.kind === 'match') return <MatchView q={q} seed={seed} done={done} onDone={onAnswer} feedback={feedback} />;
  if (q.kind === 'truefalse') {
    return (
      <div className="story-question">
        <span className="story-q-kind">맞을까요, 틀릴까요?</span>
        <p className="story-q-title">{q.statement}</p>
        <div className="story-tf">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-label={v ? '맞아요' : '틀려요'}
              className={`story-option${done && v === q.answer ? ' right' : ''}${done && chosen === v && v !== q.answer ? ' wrong' : ''}`}
              disabled={done}
              onClick={() => {
                setChosen(v);
                onAnswer(v === q.answer);
              }}
            >
              <Icon name={v ? 'check' : 'close'} size={30} strokeWidth={2.4} />
            </button>
          ))}
        </div>
        {feedback}
      </div>
    );
  }
  const order = shuffled(
    q.options.map((_, i) => i),
    seed,
  );
  return (
    <div className="story-question">
      <span className="story-q-kind">{q.kind === 'gap' ? '빈칸 채우기' : '내용 확인'}</span>
      {q.kind === 'gap' ? (
        <p className="story-q-title story-gap">
          {q.sentence.split('___')[0]}
          <span className="story-blank">{done ? q.options[q.answer] : '　　　'}</span>
          {q.sentence.split('___')[1]}
        </p>
      ) : (
        <p className="story-q-title">{q.prompt}</p>
      )}
      <div className="story-options">
        {order.map((i) => (
          <button
            key={i}
            type="button"
            className={`story-option${done && i === q.answer ? ' right' : ''}${done && chosen === i && i !== q.answer ? ' wrong' : ''}`}
            disabled={done}
            onClick={() => {
              setChosen(i);
              onAnswer(i === q.answer);
            }}
          >
            {q.options[i]}
          </button>
        ))}
      </div>
      {feedback}
    </div>
  );
}

function MatchView({ q, seed, done, onDone, feedback }: { q: Extract<StoryQuestion, { kind: 'match' }>; seed: string; done: boolean; onDone: (correct: boolean) => void; feedback: React.ReactNode }) {
  const left = useMemo(() => shuffled(q.pairs.map((p) => p.id), seed + 'L'), [q, seed]);
  const right = useMemo(() => shuffled(q.pairs.map((p) => p.ko), seed + 'R'), [q, seed]);
  const [sel, setSel] = useState<string>();
  const [matched, setMatched] = useState<Set<string>>(() => new Set(done ? q.pairs.map((p) => p.id) : []));
  const [wrong, setWrong] = useState<string>();
  const [mistakes, setMistakes] = useState(0);
  const pick = (ko: string) => {
    if (!sel) return;
    const pair = q.pairs.find((p) => p.id === sel)!;
    if (pair.ko === ko) {
      const m = new Set(matched).add(sel);
      setMatched(m);
      setSel(undefined);
      if (m.size === q.pairs.length) onDone(mistakes === 0);
    } else {
      setMistakes((n) => n + 1);
      setWrong(ko);
      setTimeout(() => setWrong(undefined), 500);
    }
  };
  const koDone = (ko: string) => q.pairs.some((p) => p.ko === ko && matched.has(p.id));
  return (
    <div className="story-question">
      <span className="story-q-kind">짝 맞추기</span>
      <div className="story-match">
        <div>
          {left.map((id) => (
            <button key={id} type="button" className={`story-option${matched.has(id) ? ' right' : ''}${sel === id ? ' sel' : ''}`} disabled={matched.has(id)} onClick={() => setSel(id)}>
              {id}
            </button>
          ))}
        </div>
        <div>
          {right.map((ko) => (
            <button key={ko} type="button" className={`story-option${koDone(ko) ? ' right' : ''}${wrong === ko ? ' wrong' : ''}`} disabled={koDone(ko) || !sel} onClick={() => pick(ko)}>
              {ko}
            </button>
          ))}
        </div>
      </div>
      {feedback}
    </div>
  );
}

/** 단어를 누르면: 뜻(덱 → 생성할 때 받은 뜻), 영어 뜻, 어근, 이 문장의 뜻, 덱에 추가 */
function WordSheet({ picked, story, lex, onClose }: { picked: Picked; story: Story; lex: Lexicon; onClose: () => void }) {
  const settings = useSettings();
  const notes = useNotes();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { span, line } = picked;
  const g = glossFor(span, story.glossary);
  // 덱에 넣은 뒤 바로 반영되도록 지금 어휘로 다시 찾는다
  const now = analyzeText(span.text, lex, new Set())[0];
  const entry = now?.entry ?? span.entry;
  const deckId = notes ? storyDeckId(lex, notes) : undefined;
  const add = async () => {
    if (!deckId) return toast('인도네시아어 덱이 없어요');
    setBusy(true);
    try {
      const gl = findGloss(span.text, story.glossary);
      await addNote(deckId, 'id-spoken', {
        word: span.text.toLowerCase(),
        meaning: [gl?.ko, gl?.en && `(${gl.en})`].filter(Boolean).join(' ') || '?',
        standard: '',
        root: gl?.root ?? '',
        example: line.text,
        exampleKo: line.ko,
        register: '구어',
        note: `이야기 "${story.title}"에서 추가`,
      });
      toast('덱에 넣었어요. 새 카드로 나와요');
    } catch (e) {
      toast(`넣지 못했어요 · ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop story-word-backdrop" onClick={onClose}>
      <div className="dialog story-sheet" role="dialog" aria-modal="true" aria-label={`${span.text} 뜻`} onClick={(e) => e.stopPropagation()}>
        <div className="story-sheet-handle" aria-hidden="true" />
        <div className="story-sheet-head">
          <div className="story-sheet-word">
            <span className="story-sheet-eyebrow">인도네시아어 · 단어 살펴보기</span>
            <strong>{span.text}</strong>
          </div>
          <button type="button" className="story-sheet-audio" aria-label="단어 듣기" onClick={() => void play([{ text: span.text, lang: 'id-ID' }], settings)}>
            <Icon name="speaker" size={23} />
          </button>
        </div>
        <div className="story-sheet-meaning">
          <span className="story-sheet-eyebrow">뜻 · MEANING</span>
          <span className="story-sheet-ko">{g.ko || '뜻 정보가 없어요'}</span>
          {g.en && <span className="story-sheet-en">{g.en}</span>}
        </div>
        {g.root && (
          <div className="story-sheet-meta">
            <span className="story-sheet-eyebrow">어근 · 표준형</span>
            <span>{g.root}</span>
          </div>
        )}
        {line.ko && (
          <div className="story-sheet-example">
            <span className="story-sheet-eyebrow">이야기 속 문장</span>
            <p>{line.text}</p>
            <span>{line.ko}</span>
          </div>
        )}
        {entry ? (
          <div className="story-sheet-known">
            <Icon name="check" size={18} />
            <span>{STATUS_TEXT[entry.status]}</span>
          </div>
        ) : (
          <button type="button" className="btn btn-primary story-sheet-add" onClick={add} disabled={busy}>
            {busy ? '추가하는 중…' : '내 덱에 추가'}
          </button>
        )}
        <button type="button" className="story-sheet-close" onClick={onClose}>읽기 계속하기</button>
      </div>
    </div>
  );
}

/** Completed stories can be replayed without resetting answers or generating new Gemini clips. */
function StoryListening({ story, activeLine, playingAll, onPlayAll, onStop, onPlayLine, onBack }: {
  story: Story;
  activeLine?: number;
  playingAll: boolean;
  onPlayAll: () => void;
  onStop: () => void;
  onPlayLine: (index: number) => void;
  onBack: () => void;
}) {
  const lines = story.blocks.filter((block): block is StoryLine => block.kind === 'line');
  return (
    <div className="screen story-body story-listening">
      <div className="story-listening-heading">
        <span className="story-sheet-eyebrow">듣기 복습 · 문제 없이 다시 듣기</span>
        <h1>{story.title}</h1>
        {story.titleKo && <span className="faint small">{story.titleKo}</span>}
        <span className="story-audio-hint">저장된 AI 음성만 재사용해요. 저장되지 않은 문장은 기기 음성으로 읽어서 Gemini 무료 한도를 쓰지 않아요.</span>
      </div>
      <div className="story-listening-actions">
        <button type="button" className="btn btn-primary" onClick={playingAll ? onStop : onPlayAll}>
          <Icon name={playingAll ? 'stop' : 'speaker'} size={19} />
          {playingAll ? '듣기 중지' : '전체 다시 듣기'}
        </button>
        <button type="button" className="btn btn-plain" onClick={onBack}>결과로</button>
      </div>
      <div className="story-listening-lines">
        {lines.map((line, i) => {
          const actor = story.characters.find((c) => c.id === line.speaker);
          return (
            <div className={`story-listening-line${activeLine === i ? ' active' : ''}`} key={i}>
              <div className="story-listening-line-body">
                <span className="story-sheet-eyebrow">{actor?.name ?? '나레이션'}</span>
                <p>{line.text}</p>
                {line.ko && <span className="story-listening-translation">{line.ko}</span>}
              </div>
              <button type="button" className="story-sheet-audio story-listening-play" onClick={() => onPlayLine(i)} aria-label={`${i + 1}번째 문장 다시 듣기`}>
                <Icon name="speaker" size={20} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StoryResult({ story, progress, lex, onRestart, onListen }: { story: Story; progress: StoryProgress; lex: Lexicon; onRestart: () => void; onListen: () => void }) {
  const qs = story.blocks.map((b, i) => [b, i] as const).filter(([b]) => b.kind !== 'line');
  const right = qs.filter(([, i]) => progress.answers[i]).length;
  const names = nameSet(story.characters, story.properNouns);
  const fresh = useMemo(() => {
    const seen = new Map<string, Span>();
    for (const b of story.blocks as StoryBlock[]) if (b.kind === 'line') for (const s of analyzeText(b.text, lex, names)) if ((s.cls === 'outside' || s.cls === 'deckNew') && !seen.has(s.text.toLowerCase())) seen.set(s.text.toLowerCase(), s);
    return [...seen.values()];
  }, [story, lex, names]);
  return (
    <div className="screen story-body">
      <div className="center-fill" style={{ flex: 'none', paddingTop: 12 }}>
        <span className="done-icon">
          <Icon name="check" size={36} strokeWidth={2} />
        </span>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{story.title} 끝</h2>
        <span className="muted" style={{ fontSize: 15 }}>
          질문 {qs.length}개 중 {right}개 맞힘 · 아는 단어 {Math.round(story.coverage.familiar * 100)}%
        </span>
        {story.usedDeckFallback && <span className="faint small">아는 단어가 아직 적어서 덱의 다음 단어를 섞었어요.</span>}
        {story.warning && <span className="faint small" style={{ lineHeight: 1.5 }}>{story.warning}</span>}
      </div>
      {fresh.length > 0 && (
        <>
          <span className="section-label">이 이야기의 새 단어</span>
          <div className="group">
            {fresh.map((s) => {
              const g = glossFor(s, story.glossary);
              return (
                <div key={s.text} className="row">
                  <span className="row-text">
                    <span className="row-title">{s.text}</span>
                    <span className="row-desc">{[g.ko, g.en].filter(Boolean).join(' · ') || '뜻 정보 없음'}</span>
                  </span>
                  <span className="chip">{s.cls === 'deckNew' ? '덱에 있음' : '덱에 없음'}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="story-result-actions">
        <button type="button" className="btn btn-primary" onClick={onListen}>
          <Icon name="speaker" size={20} />
          이야기 다시 듣기
        </button>
        <button type="button" className="btn btn-plain" onClick={onRestart}>
          처음부터 다시 (문제 풀기)
        </button>
        <button type="button" className="btn btn-plain" onClick={() => go('read')}>
          목록으로
        </button>
      </div>
    </div>
  );
}
