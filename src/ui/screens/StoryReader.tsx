import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { play, preparedStoryLines, setPlaybackRate, stopAll, storyAudioDiagnostics, type PlayResult } from '../../adapters/speech/speech';
import { GEMINI_VOICES } from '../../adapters/gemini/tts';
import { db } from '../../adapters/storage/db';
import { addNote, saveSettings } from '../../adapters/storage/repo';
import { getProgress, saveProgress } from '../../adapters/storage/stories';
import { nameSet } from '../../core/stories/plan';
import { NARRATOR, roleOf, storyVoice } from '../../core/stories/voices';
import type { DictationResult, StoryBlock, StoryLine, StoryProgress, StoryQuestion, Story } from '../../core/stories/types';
import { markWords, normalizeWord, pickBlanks, sameWord, type BlankCandidate } from '../../core/stories/dictation';
import { analyzeText, findGloss, glossFor, type Lexicon, type Span } from '../../core/stories/vocab';
import { Icon } from '../components/Icon';
import { Segmented, Switch } from '../components/Controls';
import { useNotes, useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';
import { setKnownWord, storyDeckId, useLexicon } from '../useLexicon';
import { startStoryAudio, useStoryAudioJob } from '../storyJob';
import type { Settings } from '../../core/model/types';

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
  /**
   * 듣고 읽기: 이 번호 이후의 이야기 줄은 글자를 가린다 (눌러서 연 줄은 revealed).
   * 다음 줄로 넘어가면 앞 줄들은 보이고, 질문이 나오면 답할 때까지 앞 줄도 가린 채로 둔다 (들은 것만으로 풀게).
   */
  const [hideFrom, setHideFrom] = useState(0);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [audioStatus, setAudioStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(statusTimer.current), []);
  const [audioOpen, setAudioOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState<number>();
  const [voiceDraft, setVoiceDraft] = useState<Record<string, Record<string, string>>>({});
  const lex = useLexicon();
  const settings = useSettings();
  const end = useRef<HTMLDivElement>(null);
  const autoplay = settings?.storyAutoplay !== false;
  const listenFirst = settings?.storyListenFirst === true;
  const dictOn = settings?.storyDictation === true;
  const dictStyle = settings?.storyDictationStyle ?? 'blank';
  const autoModelSwitch = settings?.storyAutoModelSwitch !== false;
  const hasGemini = !!(settings?.gemini?.apiKey && settings.gemini.useTts);
  // 기기 음성으로 읽기: Gemini 음성을 끈 설정으로 재생한다 (만들지도 않음)
  const deviceOnly = hasGemini && settings?.storyDeviceVoice === true;
  const voiceSettings = deviceOnly ? { ...settings!, gemini: { ...settings!.gemini!, useTts: false } } : settings;
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
      setHideFrom(p.position - 1);
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
  // 받아쓰기: 지금 줄을 받아쓰고 확인해야 다음으로
  const dictPending = dictOn && current.kind === 'line' && !progress.dictation?.[progress.position - 1];
  const waiting = (current.kind !== 'line' && progress.answers[progress.position - 1] === undefined) || dictPending;
  const last = progress.position >= story.blocks.length;
  const update = (p: StoryProgress) => {
    setProgress(p);
    void saveProgress(p);
  };
  const speakLine = (line: StoryLine, requestedVoice?: string, cachedOnly = false) => {
    const voice = requestedVoice ?? storyVoice(story, roleOf(story, line), voiceAssignments);
    // 평소엔 아무것도 띄우지 않는다: 새 음성을 만드느라 늦을 때만 "준비 중", 기기 음성으로 바뀌었을 때만 그 이유
    clearTimeout(statusTimer.current);
    setAudioStatus('');
    statusTimer.current = setTimeout(() => setAudioStatus('음성 준비 중…'), 1200);
    return play([{ text: line.text, lang: 'id-ID', style: 'story' }], voiceSettings, {
      timeoutMs: 30_000,
      voice,
      rate: playbackRate,
      storyAutoModel: autoModelSwitch,
      cachedOnly,
      awaitDevice: cachedOnly,
      // 목소리를 따로 고르지 않은 역할이면 예전에 다른 목소리로 만든 음성도 쓴다
      anyVoice: !requestedVoice && !voiceAssignments[roleOf(story, line)],
      onSource: (source: PlayResult) => {
        clearTimeout(statusTimer.current);
        if (source.via === 'gemini') setAudioStatus('');
        else if (source.via === 'device') setAudioStatus(source.error && voiceSettings?.gemini?.useTts ? `기기 음성으로 읽어요 · ${source.error}` : '');
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
    // 다음 줄로 넘어가면 앞 줄들은 글자를 보여 준다 (질문이 나올 때는 가린 채로)
    if (b.kind === 'line') setHideFrom(position - 1);
    if (b.kind === 'line' && (autoplay || forcePlay || listenFirst || dictOn)) void speakLine(b);
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
    // 답했으면 앞 줄들의 글자를 보여 준다
    setHideFrom((h) => Math.max(h, index));
  };
  const toggleListenFirst = () => {
    const enabled = !listenFirst;
    void saveSettings({ storyListenFirst: enabled });
    setHideFrom(progress.position - 1);
    setRevealed(new Set());
    if (enabled && !result && current.kind === 'line') void speakLine(current);
  };
  const isHidden = (i: number) => listenFirst && !result && i >= hideFrom && !revealed.has(i) && !progress.dictation?.[i];
  const toggleDictation = () => {
    const enabled = !dictOn;
    void saveSettings({ storyDictation: enabled });
    if (enabled && !result && current.kind === 'line') void speakLine(current);
  };
  const checkDictation = (i: number, r: DictationResult) => update({ ...progress, dictation: { ...progress.dictation, [i]: r } });
  const blanksFor = (i: number, line: StoryLine): BlankCandidate[] => {
    const rank = { learning: 0, deckNew: 1, outside: 2, known: 3 } as const;
    const spans = analyzeText(line.text, lex, names).filter((sp) => sp.cls !== 'name');
    const cands = spans.map((sp) => ({ start: sp.start, end: sp.end, text: sp.text, rank: rank[sp.cls as keyof typeof rank] ?? 3 }));
    return pickBlanks(cands, `${story.id}:${i}`, line.text.split(/\s+/).length);
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
        <button
          type="button"
          className="icon-btn"
          aria-label="받아쓰기"
          aria-pressed={dictOn}
          style={dictOn ? { color: 'var(--accent)' } : undefined}
          onClick={toggleDictation}
        >
          <Icon name="edit" size={21} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="듣고 읽기 (글자 가리기)"
          aria-pressed={listenFirst}
          style={listenFirst ? { color: 'var(--accent)' } : undefined}
          onClick={toggleListenFirst}
        >
          <Icon name="headphones" size={22} />
        </button>
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
      {!deviceOnly && <StoryAudioBar story={story} settings={settings} />}
      {listening ? (
        <StoryListening
          story={story}
          lex={lex}
          names={names}
          tipKey={tip?.key}
          tipLine={tip?.line}
          onTip={(line, t) => setTip((cur) => (cur?.line === line && cur.key === t.key ? undefined : { ...t, line }))}
          showKo={settings?.storyReplayKo !== false}
          onShowKo={(v) => void saveSettings({ storyReplayKo: v })}
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
        <StoryResult story={story} progress={progress} lex={lex} onPick={setPicked}
          onListen={() => {
            setAudioStatus('');
            setListening(true);
          }}
          onRestart={() => {
            stopReplay();
            setCursor(undefined);
            update({ ...progress, position: 1, answers: {}, dictation: undefined, completedAt: undefined });
            setHideFrom(0);
            setRevealed(new Set());
            setResult(false);
          }} />
      ) : (
        <>
          <div className="screen story-body">
            <div className="story-title">
              <h1>{story.title}</h1>
              {story.titleKo && <span className="faint small">{story.titleKo}</span>}
              <span className="faint small story-hint">
                {dictOn ? '받아쓰기 · 듣고 쓴 뒤 확인을 눌러요' : listenFirst ? '듣고 읽기 · 먼저 듣고, 모르겠으면 가린 문장을 눌러 글자 보기' : '단어를 누르면 뜻 · 문장을 길게 누르면 전체 뜻'}
              </span>
              {dictOn && (
                <Segmented
                  label="받아쓰기 방식"
                  options={[
                    ['blank', '빈칸 (1~2단어)'],
                    ['full', '문장 전체'],
                  ]}
                  value={dictStyle}
                  onChange={(v) => void saveSettings({ storyDictationStyle: v })}
                />
              )}
            </div>
            {shown.map((b, i) =>
              b.kind === 'line' ? (
                <Fragment key={i}>
                <LineView line={b} active={i === at} hidden={isHidden(i)}
                  dictation={dictPending && i === progress.position - 1 ? <Dictation key={`${dictStyle}${i}`} line={b} style={dictStyle} blanks={blanksFor(i, b)} onCheck={(r) => checkDictation(i, r)} /> : undefined} onReveal={() => setRevealed((r) => new Set(r).add(i))} story={story} lex={lex} names={names} tipKey={tip?.line === b ? tip.key : undefined} onTip={(t) => setTip((cur) => (cur?.line === b && cur.key === t.key ? undefined : { ...t, line: b }))} onSay={() => {
                    setCursor(i);
                    void speakLine(b);
                  }} />
                {progress.dictation?.[i] && <DictationMark r={progress.dictation[i]} />}
                </Fragment>
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
          {waiting && <div className="story-player-hint" role="status">{dictPending ? '받아쓰고 확인을 눌러 주세요' : '답을 골라 주세요'}</div>}
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
          hasGemini={hasGemini}
          deviceOnly={deviceOnly}
          onDeviceOnly={(on) => {
            stopAll();
            void saveSettings({ storyDeviceVoice: on });
          }}
          autoModelSwitch={autoModelSwitch}
          onAutoModelSwitch={(enabled) => void saveSettings({ storyAutoModelSwitch: enabled })}
        />
      )}
    </>
  );
}

/**
 * AI 음성이 다 준비되지 않은 이야기 (한도·앱 닫기로 중간에 멈춤): 몇 문장이 준비됐는지와 "나머지 한 번에 만들기".
 * 누르지 않으면 예전처럼 줄에 다다를 때 하나씩 만든다. 다 준비됐거나 Gemini 음성이 꺼져 있으면 안 보인다.
 */
function StoryAudioBar({ story, settings }: { story: Story; settings: Settings | undefined }) {
  const job = useStoryAudioJob();
  const mine = job.storyId === story.id;
  const running = mine && job.running;
  // 저장된 음성 표(db.audio)를 읽으므로 새 음성이 저장될 때마다 다시 센다
  const ready = useLiveQuery(() => preparedStoryLines(story, settings), [story, settings]);
  const total = story.blocks.filter((b) => b.kind === 'line').length;
  if (ready === undefined || (!running && ready >= total)) return null;
  return (
    <div className="story-audio-bar">
      <div className="story-audio-bar-line" role="status" aria-live="polite">
        <span>{running ? `AI 음성 만드는 중… ${ready}/${total}문장` : `AI 음성 ${ready}/${total}문장 준비됨`}</span>
        {!running && (
          <button type="button" className="btn btn-plain story-audio-make" disabled={job.running} onClick={() => startStoryAudio(story)}>
            {job.running ? '다른 이야기 음성을 만드는 중' : '나머지 한 번에 만들기'}
          </button>
        )}
      </div>
      <div className="job-track" aria-hidden="true">
        <div className="job-fill" style={{ width: `${total ? (ready / total) * 100 : 0}%` }} />
      </div>
      {running ? <span className="faint small">다른 화면으로 가도 계속 만들어요</span> : mine && job.note ? <span className="faint small">{job.note}</span> : null}
    </div>
  );
}

/** Reading-only audio controls. Every line is synthesized separately, so the cast may have >2 voices. */
function StoryAudioSheet({ story, rate, voices, onRate, onVoice, onPreview, onClose, hasGemini, deviceOnly, onDeviceOnly, autoModelSwitch, onAutoModelSwitch }: {
  story: Story;
  rate: number;
  voices: Record<string, string>;
  onRate: (v: number) => void;
  onVoice: (role: string, voice: string) => void;
  onPreview: (line: StoryLine, voice: string) => void;
  onClose: () => void;
  hasGemini: boolean;
  deviceOnly: boolean;
  onDeviceOnly: (on: boolean) => void;
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
        {hasGemini && (
          <section className="story-audio-section">
            <div className="story-audio-title">
              <strong>기기 음성으로 읽기</strong>
              <Switch checked={deviceOnly} onChange={onDeviceOnly} label="기기 음성으로 읽기" />
            </div>
            <p className="story-audio-hint">AI 음성 대신 휴대폰 음성으로 읽어요. 기다림 없이 바로 읽고 Gemini 무료 한도도 쓰지 않아요. 빠르기는 아래 읽기 속도로 맞춰요.</p>
          </section>
        )}
        <section className="story-audio-section">
          <div className="story-audio-title"><strong>읽기 속도</strong><strong className="story-audio-rate">{rate.toFixed(2)}×</strong></div>
          <input type="range" className="story-audio-slider" aria-label="이야기 읽기 속도" min="0.6" max="1.2" step="0.05" value={rate}
            onChange={(e) => onRate(Number(e.target.value))} />
          <div className="story-audio-range"><span>천천히 · 0.6×</span><span>빠르게 · 1.2×</span></div>
          <span className="story-audio-hint">{deviceOnly || !hasGemini ? '다음 문장부터 이 빠르기로 읽어요.' : '재생 중에도 바뀌고, 저장된 음성을 다시 만들지 않아요.'}</span>
        </section>
        {!deviceOnly && (<>
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
        </>)}
        <AudioDiagnostics story={story} />
        <button type="button" className="btn btn-primary story-audio-done" onClick={onClose}>완료</button>
      </div>
    </div>
  );
}

/** 음성 확인용 정보 (작은 글씨). 음성이 없어졌다고 할 때 화면을 찍어 보내 달라고 한다 */
function AudioDiagnostics({ story }: { story: Story }) {
  const d = useLiveQuery(() => storyAudioDiagnostics(story), [story]);
  if (!d) return null;
  const day = (t: number) => new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  return (
    <p className="story-audio-hint" style={{ overflowWrap: 'anywhere' }}>
      확인용 · 이 폰의 AI 음성 {d.total}개{d.oldest ? ` (${day(d.oldest)}부터)` : ''} · 이 이야기 문장 음성 {d.matching}개{d.sample ? ` · ${d.sample}` : ''} · 이야기 만든 날 {day(story.createdAt)}
    </p>
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

/**
 * 한 줄의 글. 듀오링고처럼 단어를 누르면 뜻이 말풍선으로 짧게 나온다. 모르는 단어(덱의 새 단어·덱 밖 단어)는 색 밑줄.
 * 의미 단위로 묶어 누르던 방식은 원하는 단어 하나만 보기 어려워서 없앴다 (사용자 요청).
 * 예전 이야기에 남은 한 단어짜리 의미 단위 뜻은, 덱·glossary에 뜻이 없을 때만 쓴다.
 */
function Tokens({ line, story, lex, names, tipKey, onTip }: { line: StoryLine; story: Story; lex: Lexicon; names: Set<string>; tipKey?: string; onTip: (t: Omit<Tip, 'line'>) => void }) {
  const text = line.text;
  const spans = useMemo(() => analyzeText(text, lex, names), [text, lex, names]);
  const out: React.ReactNode[] = [];
  const oldChunkKo = (word: string) => line.chunks?.find((c) => c.text.trim().toLowerCase() === word.toLowerCase())?.ko;
  let at = 0;
  spans.forEach((sp, i) => {
    if (sp.start > at) out.push(text.slice(at, sp.start));
    at = sp.end;
    if (sp.cls === 'name') {
      out.push(<span key={`w${i}`}>{sp.text}</span>);
      return;
    }
    const key = `w${sp.start}`;
    const ko = glossFor(sp, story.glossary).ko ?? oldChunkKo(sp.text);
    out.push(
      <button key={key} type="button" className={`w w-${sp.cls}${tipKey === key ? ' w-on' : ''}`} onClick={(e) => onTip({ key, text: sp.text, ko, rect: e.currentTarget.getBoundingClientRect(), span: sp })}>
        {sp.text}
      </button>,
    );
  });
  if (at < text.length) out.push(text.slice(at));
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

function LineView({ line, active, hidden = false, dictation, onReveal, story, lex, names, tipKey, onTip, onSay }: { line: StoryLine; active: boolean; hidden?: boolean; dictation?: ReactNode; onReveal?: () => void; story: Story; lex: Lexicon; names: Set<string>; tipKey?: string; onTip: (t: Omit<Tip, 'line'>) => void; onSay: () => void }) {
  const [showKo, setShowKo] = useState(false);
  const long = useLongPress(() => setShowKo(true));
  const speakerName = story.characters.find((c) => c.id === line.speaker)?.name;
  // 듣고 읽기: 글자는 흐리게 가리고(문장 길이만 보이게) 누르면 보여 준다
  const body = dictation ? (
    <div className="story-text">{dictation}</div>
  ) : hidden ? (
    <div className="story-text">
      <button type="button" className="story-hidden" aria-label="글자 보기" onClick={onReveal}>
        <span className="story-hidden-text" aria-hidden="true">
          {line.text}
        </span>
        <span className="story-hidden-label">글자 보기</span>
      </button>
    </div>
  ) : (
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
        {entry?.kind === 'mine' ? (
          <>
            <div className="story-sheet-known">
              <Icon name="check" size={18} />
              <span>이미 아는 단어로 표시했어요 · 복습 카드 없음</span>
            </div>
            <button type="button" className="btn btn-plain story-sheet-add" onClick={() => settings && void setKnownWord(settings, entry.word, false).then(() => toast('아는 단어에서 뺐어요'))}>
              아는 단어에서 빼기
            </button>
          </>
        ) : entry ? (
          <div className="story-sheet-known">
            <Icon name="check" size={18} />
            <span>{entry.kind === 'basic' ? '기본 단어 · 아는 단어로 쳐요 (복습 카드 없이)' : STATUS_TEXT[entry.status]}</span>
          </div>
        ) : (
          <div className="story-sheet-actions">
            <button type="button" className="btn btn-primary story-sheet-add" onClick={add} disabled={busy}>
              {busy ? '추가하는 중…' : '내 덱에 추가'}
            </button>
            <button type="button" className="btn btn-plain story-sheet-add" onClick={() => settings && void setKnownWord(settings, span.text, true).then(() => toast('아는 단어로 표시했어요. 복습 카드는 만들지 않아요'))}>
              이미 알아요
            </button>
          </div>
        )}
        <button type="button" className="story-sheet-close" onClick={onClose}>읽기 계속하기</button>
      </div>
    </div>
  );
}

/** Completed stories can be replayed without resetting answers or generating new Gemini clips. */
/** 다시 듣기: 문장마다 듣기, 단어를 누르면 뜻 (읽을 때와 같은 말풍선), 해석 보이기/숨기기 */
function StoryListening({ story, lex, names, tipKey, tipLine, onTip, showKo, onShowKo, activeLine, playingAll, onPlayAll, onStop, onPlayLine, onBack }: {
  story: Story;
  lex: Lexicon;
  names: Set<string>;
  tipKey?: string;
  tipLine?: StoryLine;
  onTip: (line: StoryLine, t: Omit<Tip, 'line'>) => void;
  showKo: boolean;
  onShowKo: (v: boolean) => void;
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
      <div className="story-listening-ko">
        <span>해석 보기</span>
        <Switch label="해석 보기" checked={showKo} onChange={onShowKo} />
      </div>
      <div className="story-listening-lines">
        {lines.map((line, i) => {
          const actor = story.characters.find((c) => c.id === line.speaker);
          return (
            <div className={`story-listening-line${activeLine === i ? ' active' : ''}`} key={i}>
              <div className="story-listening-line-body">
                <span className="story-sheet-eyebrow">{actor?.name ?? '나레이션'}</span>
                <p>
                  <Tokens line={line} story={story} lex={lex} names={names} tipKey={tipLine === line ? tipKey : undefined} onTip={(t) => onTip(line, t)} />
                </p>
                {showKo && line.ko && <span className="story-listening-translation">{line.ko}</span>}
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

function StoryResult({ story, progress, lex, onRestart, onListen, onPick }: { story: Story; progress: StoryProgress; lex: Lexicon; onRestart: () => void; onListen: () => void; onPick: (p: Picked) => void }) {
  const qs = story.blocks.map((b, i) => [b, i] as const).filter(([b]) => b.kind !== 'line');
  const right = qs.filter(([, i]) => progress.answers[i]).length;
  const names = nameSet(story.characters, story.properNouns);
  const fresh = useMemo(() => {
    const seen = new Map<string, Span>();
    for (const b of story.blocks as StoryBlock[]) if (b.kind === 'line') for (const s of analyzeText(b.text, lex, names)) if ((s.cls === 'outside' || s.cls === 'deckNew') && !seen.has(s.text.toLowerCase())) seen.set(s.text.toLowerCase(), s);
    return [...seen.values()];
  }, [story, lex, names]);
  // 받아쓰기에서 놓친 단어: 누르면 단어 창(뜻·덱에 추가)
  const missed = useMemo(
    () =>
      missedWords(progress).flatMap(({ word, line }) => {
        const b = story.blocks[line];
        if (b?.kind !== 'line') return [];
        const span = analyzeText(b.text, lex, names).find((sp) => normalizeWord(sp.text) === normalizeWord(word));
        return span ? [{ span, line: b }] : [];
      }),
    [progress, story, lex, names],
  );
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
      {missed.length > 0 && (
        <>
          <span className="section-label">받아쓰기에서 놓친 단어 {missed.length}개</span>
          <div className="group">
            {missed.map((m) => {
              const g = glossFor(m.span, story.glossary);
              return (
                <button key={m.span.text} type="button" className="row row-btn" aria-label={`${m.span.text} 자세히 보기`} onClick={() => onPick(m)}>
                  <span className="row-text">
                    <span className="row-title">{m.span.text}</span>
                    <span className="row-desc">{[g.ko, g.en].filter(Boolean).join(' · ') || '뜻 정보 없음'}</span>
                  </span>
                  <span className="chip">{g.inDeck ? '덱에 있음' : '덱에 넣기'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
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

const inputProps = { autoCapitalize: 'off', autoCorrect: 'off', autoComplete: 'off', spellCheck: false, lang: 'id' } as const;

/** 스크롤되는 가장 가까운 부모 */
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * 받아쓰기 칸을 누르면 키보드가 문장을 가리지 않게: 키보드가 올라온 뒤 보이는 화면(visualViewport) 안으로
 * 받아쓰기 칸 전체(문장·입력칸·확인)를 올린다. 쓰는 동안은 아래 재생 버튼을 숨기고 아래에 여백을 둬서 올릴 자리를 만든다.
 */
function useKeepAboveKeyboard() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => () => document.documentElement.classList.remove('dict-typing'), []);
  const keep = () => {
    const el = box.current;
    if (!el) return;
    const vv = window.visualViewport;
    const top = (vv?.offsetTop ?? 0) + 12;
    const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
    const r = el.getBoundingClientRect();
    // 칸 전체가 들어가면 아래를 키보드 바로 위에, 너무 크면 위를 맞춘다
    const delta = r.height > bottom - top ? r.top - top : r.bottom > bottom ? r.bottom - bottom : r.top < top ? r.top - top : 0;
    if (Math.abs(delta) > 2) scrollParent(el).scrollBy({ top: delta, behavior: 'smooth' });
  };
  return {
    ref: box,
    onFocus: () => {
      document.documentElement.classList.add('dict-typing');
      // 키보드가 올라오는 동안 화면 크기가 바뀐다: 바로, 조금 뒤, 크기가 바뀔 때 한 번씩
      requestAnimationFrame(keep);
      setTimeout(keep, 350);
      window.visualViewport?.addEventListener('resize', keep, { once: true });
    },
    onBlur: (e: React.FocusEvent) => {
      if (box.current?.contains(e.relatedTarget as Node | null)) return;
      document.documentElement.classList.remove('dict-typing');
    },
  };
}

/** 받아쓰기 칸. 빈칸: 문장 속 1~2단어 자리에 입력칸 / 전체: 글자를 가리고 문장 전체를 쓴다 */
function Dictation({ line, style, blanks, onCheck }: { line: StoryLine; style: 'blank' | 'full'; blanks: readonly BlankCandidate[]; onCheck: (r: DictationResult) => void }) {
  const blankMode = style === 'blank' && blanks.length > 0;
  const [vals, setVals] = useState<string[]>(() => blanks.map(() => ''));
  const [full, setFull] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const keep = useKeepAboveKeyboard();
  const check = () => {
    if (blankMode) onCheck({ mode: 'blank', items: blanks.map((b, k) => ({ word: b.text, typed: vals[k] ?? '', ok: sameWord(b.text, vals[k] ?? '') })) });
    else onCheck({ mode: 'full', items: markWords(line.text, full) });
  };
  if (!blankMode) {
    return (
      <div className="dict" ref={keep.ref} onFocus={keep.onFocus} onBlur={keep.onBlur}>
        <span className="story-hidden-text" aria-hidden="true">
          {line.text}
        </span>
        <input
          {...inputProps}
          className="input dict-full"
          aria-label="들은 문장 쓰기"
          placeholder="들은 문장을 써 보세요"
          value={full}
          onChange={(e) => setFull(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
        />
        <button type="button" className="btn btn-primary dict-check" onClick={check}>
          확인
        </button>
      </div>
    );
  }
  const parts: ReactNode[] = [];
  let at = 0;
  blanks.forEach((b, k) => {
    if (b.start > at) parts.push(line.text.slice(at, b.start));
    parts.push(
      <input
        key={k}
        {...inputProps}
        ref={(el) => {
          refs.current[k] = el;
        }}
        className="dict-blank"
        aria-label={`빈칸 ${k + 1}`}
        style={{ width: `${Math.max(3, b.text.length + 1)}ch` }}
        value={vals[k] ?? ''}
        onChange={(e) => setVals((v) => v.map((x, j) => (j === k ? e.target.value : x)))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (k < blanks.length - 1) refs.current[k + 1]?.focus();
          else check();
        }}
      />,
    );
    at = b.end;
  });
  if (at < line.text.length) parts.push(line.text.slice(at));
  return (
    <div className="dict" ref={keep.ref} onFocus={keep.onFocus} onBlur={keep.onBlur}>
      <p className="story-p dict-sentence">{parts}</p>
      <button type="button" className="btn btn-primary dict-check" onClick={check}>
        확인
      </button>
    </div>
  );
}

/** 확인한 줄 아래: 맞았는지와 놓친 단어 */
function DictationMark({ r }: { r: DictationResult }) {
  const missed = r.items.filter((x) => !x.ok);
  if (!missed.length) return <div className="dict-result dict-good">받아쓰기 ✓ 다 맞았어요</div>;
  if (r.mode === 'full') {
    return (
      <div className="dict-result" aria-label={`받아쓰기 ${r.items.length - missed.length}/${r.items.length}`}>
        {r.items.map((x, k) => (
          <span key={k} className={x.ok ? 'dict-ok' : 'dict-miss'}>
            {x.word}{' '}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="dict-result">
      {missed.map((x, k) => (
        <span key={k}>
          <span className="dict-miss">{x.word}</span>
          {x.typed ? <span className="faint"> (쓴 것: {x.typed})</span> : <span className="faint"> (안 씀)</span>}
          {k < missed.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </div>
  );
}

/** 이야기 전체에서 받아쓰기로 놓친 단어 (중복 없이) */
function missedWords(progress: StoryProgress): { word: string; line: number }[] {
  const seen = new Set<string>();
  const out: { word: string; line: number }[] = [];
  for (const [i, r] of Object.entries(progress.dictation ?? {})) {
    for (const x of r.items) {
      const key = normalizeWord(x.word);
      if (x.ok || !key || seen.has(key)) continue;
      seen.add(key);
      out.push({ word: x.word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''), line: Number(i) });
    }
  }
  return out;
}
