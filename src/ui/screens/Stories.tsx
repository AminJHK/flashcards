import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { createStory, type StoryStep } from '../../adapters/gemini/story';
import { db } from '../../adapters/storage/db';
import { deleteStory, restartStory, saveStory } from '../../adapters/storage/stories';
import { planStory, STORY_TOPICS, StoryPlanError } from '../../core/stories/plan';
import { DIFFICULTIES, type StoryDifficulty } from '../../core/stories/types';
import { FALLBACK_MIN_FAMILIAR } from '../../core/stories/vocab';
import { Segmented } from '../components/Controls';
import { ScreenSync } from '../components/ScreenSync';
import { ask } from '../confirm';
import { useSettings } from '../hooks';
import { go } from '../router';
import { useToast } from '../toast';
import { useLexicon } from '../useLexicon';

const DIFF_OPTIONS = (Object.keys(DIFFICULTIES) as StoryDifficulty[]).map((k) => [k, `${DIFFICULTIES[k].label} ${Math.round(DIFFICULTIES[k].known * 100)}%`] as const);
const STEP_TEXT: Record<StoryStep['stage'], string> = { writing: '이야기를 쓰는 중…', checking: '아는 단어 비율을 확인하는 중…', revising: '모르는 단어를 줄여 다시 쓰는 중…' };

/** 읽기 탭: 이야기 만들기 + 만든 이야기 목록 */
export function Stories() {
  const settings = useSettings();
  const lex = useLexicon();
  const toast = useToast();
  const stories = useLiveQuery(() => db.stories.orderBy('createdAt').reverse().toArray(), []);
  const progress = useLiveQuery(() => db.storyProgress.toArray(), []);
  const [difficulty, setDifficulty] = useState<StoryDifficulty>('normal');
  const [topic, setTopic] = useState('free');
  const [step, setStep] = useState<StoryStep>();
  const [error, setError] = useState<string>();

  if (!settings || !lex || !stories || !progress) return <div className="screen" />;
  const key = settings.gemini?.apiKey;
  const count = (s: string) => lex.entries.filter((e) => e.status === s).length;
  const familiar = count('known') + count('learning');
  const byId = new Map(progress.map((p) => [p.storyId, p]));

  const generate = async () => {
    if (!key) return;
    setError(undefined);
    try {
      const plan = planStory(lex, difficulty);
      setStep({ attempt: 1, stage: 'writing' });
      const story = await createStory({ lex, plan, topicKey: topic, key, onStep: setStep });
      await saveStory(story);
      if (story.warning) toast(story.warning);
      go(`read/${story.id}`);
    } catch (e) {
      setError(e instanceof StoryPlanError || e instanceof Error ? e.message : String(e));
    } finally {
      setStep(undefined);
    }
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
            <button type="button" className="btn btn-primary" style={{ height: 52 }} onClick={generate} disabled={!!step}>
              {step ? `${STEP_TEXT[step.stage]}${step.attempt > 1 ? ` (${step.attempt}번째)` : ''}` : '이야기 만들기'}
            </button>
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
