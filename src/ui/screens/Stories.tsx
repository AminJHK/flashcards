import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { StoryStep } from '../../adapters/gemini/story';
import { db } from '../../adapters/storage/db';
import { deleteStory, restartStory } from '../../adapters/storage/stories';
import { STORY_TOPICS } from '../../core/stories/plan';
import { DIFFICULTIES, type StoryDifficulty } from '../../core/stories/types';
import { FALLBACK_MIN_FAMILIAR } from '../../core/stories/vocab';
import { Segmented } from '../components/Controls';
import { ScreenSync } from '../components/ScreenSync';
import { ask } from '../confirm';
import { useSettings } from '../hooks';
import { go } from '../router';
import { markStorySeen, startStoryJob, useStoryJob } from '../storyJob';
import { useLexicon } from '../useLexicon';

const DIFF_OPTIONS = (Object.keys(DIFFICULTIES) as StoryDifficulty[]).map((k) => [k, `${DIFFICULTIES[k].label} ${Math.round(DIFFICULTIES[k].known * 100)}%`] as const);
const STEP_TEXT: Record<StoryStep['stage'], string> = { writing: '이야기를 쓰는 중…', checking: '아는 단어 비율을 확인하는 중…', revising: '모르는 단어를 줄여 다시 쓰는 중…', retrying: '답이 제대로 안 와서 다시 쓰는 중…', waiting: 'Gemini 서버가 붐벼서 잠시 기다리는 중…' };

/** 만드는 중: 진행 막대와 퍼센트 (쓰는 중에는 받은 글자 수로 어림한 값) */
export function StoryProgress({ step }: { step: StoryStep }) {
  const pct = Math.round((step.pct ?? 0) * 100);
  // 첫 글자가 오기 전(0%)에는 퍼센트 대신 움직이는 막대 (멈춘 것처럼 보이지 않게)
  const known = step.stage === 'checking' || ((step.stage === 'writing' || step.stage === 'revising' || step.stage === 'retrying') && (step.pct ?? 0) > 0);
  return (
    <div className="job-card" role="status" aria-live="polite">
      <div className="job-line">
        <span>
          {STEP_TEXT[step.stage]}
          {step.attempt > 1 ? ` (${step.attempt}번째)` : ''}
        </span>
        {known && <strong>{pct}%</strong>}
      </div>
      <div className="job-track" role="progressbar" aria-valuenow={known ? pct : undefined} aria-valuemin={0} aria-valuemax={100} aria-label="이야기 만드는 중">
        <div className={`job-fill${known ? '' : ' job-wait'}`} style={known ? { width: `${Math.max(pct, 3)}%` } : undefined} />
      </div>
    </div>
  );
}

/** 읽기 탭: 이야기 만들기 + 만든 이야기 목록 */
export function Stories() {
  const settings = useSettings();
  const lex = useLexicon();
  const stories = useLiveQuery(() => db.stories.orderBy('createdAt').reverse().toArray(), []);
  const progress = useLiveQuery(() => db.storyProgress.toArray(), []);
  const [difficulty, setDifficulty] = useState<StoryDifficulty>('normal');
  const [topic, setTopic] = useState('free');
  const job = useStoryJob();
  const step = job.status === 'running' ? job.step : undefined;
  const error = job.status === 'error' ? job.error : undefined;
  useEffect(() => markStorySeen(), [job.unseen]);

  if (!settings || !lex || !stories || !progress) return <div className="screen" />;
  const key = settings.gemini?.apiKey;
  const count = (s: string) => lex.entries.filter((e) => e.status === s).length;
  const familiar = count('known') + count('learning');
  const byId = new Map(progress.map((p) => [p.storyId, p]));

  const generate = () => {
    if (key) startStoryJob({ lex, difficulty, topicKey: topic, key });
  };

  return (
    <div className="screen">
      <ScreenSync />
      <div className="screen-head">
        <h1 className="title">읽기</h1>
      </div>

      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>내 단어로 만드는 인도네시아어 이야기</span>
        <span className="muted small" style={{ lineHeight: 1.6 }}>
          아는 단어 {count('known')} · 배우는 중 {count('learning')} · 아직 안 배운 덱 단어 {count('deckNew')}
          {familiar < FALLBACK_MIN_FAMILIAR && (
            <>
              <br />
              아직 아는 단어가 적어서, 꼭 필요하면 덱의 다음 단어도 섞어요 (누르면 뜻이 나와요).
            </>
          )}
        </span>
        {!key ? (
          <>
            <span className="muted small" style={{ lineHeight: 1.6 }}>
              이야기는 Gemini가 만들어요. 설정에서 무료 Gemini 키를 먼저 연결해 주세요.
            </span>
            <button type="button" className="btn btn-plain" style={{ height: 48 }} onClick={() => go('settings')}>
              설정에서 연결하기
            </button>
          </>
        ) : (
          <>
            <Segmented label="난이도" options={DIFF_OPTIONS} value={difficulty} onChange={setDifficulty} />
            <span className="faint small">숫자는 이야기 속 아는 단어 비율이에요. 실제 비율은 만든 뒤 앱이 직접 세서 보여 줘요.</span>
            <Segmented label="주제" wrap options={STORY_TOPICS.map((t) => [t.key, t.label] as const)} value={topic} onChange={setTopic} />
            {step ? (
              <StoryProgress step={step} />
            ) : (
              <button type="button" className="btn btn-primary" style={{ height: 52 }} onClick={generate}>
                이야기 만들기
              </button>
            )}
            {step && <span className="faint small">다른 화면으로 가도 뒤에서 계속 만들어요. 다 되면 알려 드려요. (앱을 닫으면 멈춰요)</span>}
            {job.status === 'done' && job.title && !step && <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>「{job.title}」가 완성됐어요. 아래 목록에 있어요.</span>}
            {error && (
              <span role="alert" style={{ color: 'var(--again)', fontSize: 14, lineHeight: 1.5 }}>
                {error}
              </span>
            )}
          </>
        )}
      </div>

      {stories.length > 0 && (
        <>
          <span className="section-label">만든 이야기</span>
          <div className="group">
            {stories.map((s) => {
              const p = byId.get(s.id);
              const done = !!p?.completedAt || (p?.readCount ?? 0) > 0;
              const started = (p?.position ?? 1) > 1 && !p?.completedAt;
              const status = p?.completedAt ? '다 읽음' : started ? `${p!.position}/${s.blocks.length}` : done ? '다 읽음' : '새 이야기';
              return (
                <div key={s.id} className="row" style={{ alignItems: 'center' }}>
                  <button type="button" className="row-text story-row" onClick={() => go(`read/${s.id}`)}>
                    <span className="row-title">{s.title}</span>
                    <span className="row-desc">
                      {s.titleKo && `${s.titleKo} · `}
                      {DIFFICULTIES[s.difficulty].label} · 아는 단어 {Math.round(s.coverage.familiar * 100)}% · {new Date(s.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                    </span>
                  </button>
                  <span className={`chip${p?.completedAt ? ' chip-accent' : ''}`}>{status}</span>
                  {(started || p?.completedAt) && (
                    <button type="button" className="btn-plain" style={{ border: 'none', height: 36 }} aria-label={`${s.title} 처음부터`} onClick={() => void restartStory(s.id)}>
                      처음부터
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-plain"
                    style={{ border: 'none', height: 36 }}
                    aria-label={`${s.title} 지우기`}
                    onClick={async () => {
                      if (await ask(`"${s.title}" 이야기를 지울까요?`, '지우기')) await deleteStory(s.id);
                    }}
                  >
                    지우기
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
