import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { play, prefetchSpeech, setPlaybackRate, stopAll, type PlayResult } from '../../adapters/speech/speech';
import { GEMINI_VOICES } from '../../adapters/gemini/tts';
import { db } from '../../adapters/storage/db';
import { addNote, saveSettings } from '../../adapters/storage/repo';
import { getProgress, saveProgress } from '../../adapters/storage/stories';
import { nameSet } from '../../core/stories/plan';
import { NARRATOR, roleOf, storyVoice } from '../../core/stories/voices';
import type { StoryBlock, StoryLine, StoryProgress, StoryQuestion, Story } from '../../core/stories/types';
import { analyzeText, findGloss, glossFor, type Lexicon, type Span } from '../../core/stories/vocab';
import { Icon } from '../components/Icon';
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
  const [picked, setPicked] = useState<Picked>();
  const [audioStatus, setAudioStatus] = useState('');
  const [audioOpen, setAudioOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState<number>();
  const [voiceDraft, setVoiceDraft] = useState<Record<string, Record<string, string>>>({});
  const lex = useLexicon();
  const settings = useSettings();
  const end = useRef<HTMLDivElement>(null);
  const autoplay = settings?.storyAutoplay !== false;
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
  // Leave the story: stop a voice that would otherwise continue on the next screen.
  useEffect(() => () => stopAll(), []);

  useEffect(() => {
    void getProgress(id).then((p) => {
      setProgress(p);
      if (p.completedAt) setResult(true);
    });
  }, [id]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progress?.position]);

  // Prepare one upcoming sentence. Never preload the entire story (free API limits).
  useEffect(() => {
    if (!story || !progress || !autoplay) return;
    const upcoming = story.blocks.slice(progress.position).find((block) => block.kind === 'line');
    if (upcoming?.kind === 'line') {
      const voice = storyVoice(story, roleOf(story, upcoming), voiceAssignments);
      void prefetchSpeech({ text: upcoming.text, lang: 'id-ID', style: 'story' }, settings, voice);
    }
  }, [story, progress, autoplay, settings, voiceAssignments]);

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
  const speakLine = (line: StoryLine, requestedVoice?: string) => {
    const voice = requestedVoice ?? storyVoice(story, roleOf(story, line), voiceAssignments);
    setAudioStatus(settings?.gemini?.useTts && settings.gemini.apiKey ? 'Gemini 음성 준비 중…' : '기기 음성 준비 중…');
    void play([{ text: line.text, lang: 'id-ID', style: 'story' }], settings, {
      timeoutMs: 30_000,
      voice,
      rate: playbackRate,
      onSource: (source: PlayResult) => {
        if (source.via === 'gemini') setAudioStatus(`Gemini AI · ${voice} · ${source.cached ? '저장된 음성' : '새 음성'} · ${playbackRate.toFixed(2)}배속`);
        else if (source.via === 'device') setAudioStatus(source.error ? `기기 음성으로 대체됨 · Gemini 오류: ${source.error}` : '기기 음성으로 읽는 중 · 역할별 목소리는 Gemini에서 지원');
        else setAudioStatus(source.error ? `음성 오류: ${source.error}` : '사용할 수 있는 음성이 없어요');
      },
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
  const next = () => {
    if (last) {
      update({ ...progress, completedAt: Date.now(), readCount: progress.readCount + 1 });
      setResult(true);
      return;
    }
    const position = progress.position + 1;
    update({ ...progress, position });
    const b = story.blocks[position - 1]!;
    if (b.kind === 'line' && autoplay) speakLine(b);
    else setAudioStatus('');
  };
  const toggleAutoplay = () => {
    const enabled = !autoplay;
    void saveSettings({ storyAutoplay: enabled });
    if (!enabled) {
      stopAll();
      setAudioStatus('');
    } else if (current.kind === 'line') speakLine(current);
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
      {!!audioStatus && !result && <div className="story-playback-status" role="status" aria-live="polite">{audioStatus}</div>}
      {result ? (
        <StoryResult story={story} progress={progress} lex={lex} onRestart={() => {
          update({ ...progress, position: 1, answers: {}, completedAt: undefined });
          setResult(false);
        }} />
      ) : (
        <>
          <div className="screen story-body">
            <div className="story-title">
              <h1>{story.title}</h1>
              {story.titleKo && <span className="faint small">{story.titleKo}</span>}
            </div>
            {shown.map((b, i) =>
              b.kind === 'line' ? (
                <LineView key={i} line={b} story={story} lex={lex} names={names} onSay={() => speakLine(b)} onPick={(span) => setPicked({ span, line: b })} />
              ) : i === shown.length - 1 ? (
                <QuestionView key={i} q={b} seed={`${story.id}:${i}`} result={progress.answers[i]} onAnswer={(c) => answer(i, c)} />
              ) : (
                <AnsweredQuestion key={i} q={b} correct={progress.answers[i]} />
              ),
            )}
            <div ref={end} />
          </div>
          <div className="answer-bar">
            <button type="button" className="btn btn-primary" onClick={next} aria-disabled={waiting} disabled={waiting}>
              {waiting ? '답을 골라 주세요' : last ? '다 읽었어요' : '계속'}
            </button>
          </div>
        </>
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
        />
      )}
    </>
  );
}

/** Reading-only audio controls. Every line is synthesized separately, so the cast may have >2 voices. */
function StoryAudioSheet({ story, rate, voices, onRate, onVoice, onPreview, onClose, hasGemini }: {
  story: Story;
  rate: number;
  voices: Record<string, string>;
  onRate: (v: number) => void;
  onVoice: (role: string, voice: string) => void;
  onPreview: (line: StoryLine, voice: string) => void;
  onClose: () => void;
  hasGemini: boolean;
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

/** 한 줄: 단어마다 누를 수 있다. 모르는 단어(덱의 새 단어·덱 밖 단어)는 밑줄 */
function Tokens({ text, lex, names, onPick }: { text: string; lex: Lexicon; names: Set<string>; onPick: (s: Span) => void }) {
  const spans = useMemo(() => analyzeText(text, lex, names), [text, lex, names]);
  const out: React.ReactNode[] = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start > at) out.push(text.slice(at, s.start));
    out.push(
      s.cls === 'name' ? (
        <span key={i}>{s.text}</span>
      ) : (
        <button key={i} type="button" className={`w w-${s.cls}`} onClick={() => onPick(s)}>
          {s.text}
        </button>
      ),
    );
    at = s.end;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

function LineView({ line, story, lex, names, onPick, onSay }: { line: StoryLine; story: Story; lex: Lexicon; names: Set<string>; onPick: (s: Span) => void; onSay: () => void }) {
  const speakerName = story.characters.find((c) => c.id === line.speaker)?.name;
  if (!speakerName) {
    return (
      <div className="story-narration">
        <button type="button" className="icon-btn story-say" aria-label="이 문장 듣기" onClick={onSay}>
          <Icon name="speaker" size={20} />
        </button>
        <p>
          <Tokens text={line.text} lex={lex} names={names} onPick={onPick} />
        </p>
      </div>
    );
  }
  return (
    <div className="story-line">
      <Avatar story={story} speaker={line.speaker} />
      <div className="story-bubble">
        <span className="story-name">{speakerName}</span>
        <div className="story-bubble-row">
          <button type="button" className="icon-btn story-say" aria-label="이 문장 듣기" onClick={onSay}>
            <Icon name="speaker" size={20} />
          </button>
          <p>
            <Tokens text={line.text} lex={lex} names={names} onPick={onPick} />
          </p>
        </div>
      </div>
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

function StoryResult({ story, progress, lex, onRestart }: { story: Story; progress: StoryProgress; lex: Lexicon; onRestart: () => void }) {
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
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-plain" onClick={onRestart}>
          처음부터 다시
        </button>
        <button type="button" className="btn btn-primary" onClick={() => go('read')}>
          목록으로
        </button>
      </div>
    </div>
  );
}
