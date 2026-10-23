import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { StoryStep } from '../../adapters/gemini/story';
import { db } from '../../adapters/storage/db';
import { deleteStory, restartStory } from '../../adapters/storage/stories';
import { STORY_TOPICS } from '../../core/stories/plan';
import { DIFFICULTIES, type Story, type StoryDifficulty } from '../../core/stories/types';
import { FALLBACK_MIN_FAMILIAR } from '../../core/stories/vocab';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { ScreenSync } from '../components/ScreenSync';
import { ask } from '../confirm';
import { useSettings } from '../hooks';
import { go } from '../router';
import { markStorySeen, startStoryJob, useStoryAudioJob, useStoryJob } from '../storyJob';
import { setKnownWord, useLexicon } from '../useLexicon';
import { isExtraWord, lookupForm } from '../../core/stories/vocab';
import { BASIC_WORDS } from '../../core/stories/basicWords';
import { isNativeApp } from '../../adapters/native/platform';

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

/** 읽기 탭: 위에는 짧은 "새 이야기" 카드, 아래가 주인공인 이야기 목록 */
export function Stories() {
  const settings = useSettings();
  const lex = useLexicon();
  const stories = useLiveQuery(() => db.stories.orderBy('createdAt').reverse().toArray(), []);
  const progress = useLiveQuery(() => db.storyProgress.toArray(), []);
  const [difficulty, setDifficulty] = useState<StoryDifficulty>('normal');
  const [topic, setTopic] = useState('free');
  const [menu, setMenu] = useState<Story>();
  const [mineOpen, setMineOpen] = useState(false);
  const job = useStoryJob();
  const audioJob = useStoryAudioJob();
  const step = job.status === 'running' ? job.step : undefined;
  const error = job.status === 'error' ? job.error : undefined;
  useEffect(() => markStorySeen(), [job.unseen]);

  if (!settings || !lex || !stories || !progress) return <div className="screen" />;
  const key = settings.gemini?.apiKey;
  // 덱의 단어만 센다 (기본 단어·복습 없이 아는 단어는 빼고)
  const count = (s: string) => lex.entries.filter((e) => e.status === s && !isExtraWord(e)).length;
  const familiar = count('known') + count('learning');
  // 기본 단어 전부: 덱에서 이미 배우는 단어는 덱 기록을 따르므로 그 상태를 같이 보여 준다
  const basic = BASIC_WORDS.map(([w, meaning]) => ({ w, meaning, e: lookupForm(lex, w) }));
  const DECK_STATUS = { known: '덱 · 아는 단어', learning: '덱 · 배우는 중', deckNew: '덱 · 아직 안 배움' } as const;
  const byId = new Map(progress.map((p) => [p.storyId, p]));
  // 기기 음성으로 읽기를 켰으면 AI 음성 준비 상태는 보여 주지 않는다
  const audio = job.status === 'done' && audioJob.storyId === job.storyId && !settings.storyDeviceVoice ? audioJob : undefined;
  // 방금 만든 이야기 알림: 그 이야기를 읽기 시작하면 사라진다
  const freshStory = job.status === 'done' && job.storyId ? stories.find((x) => x.id === job.storyId) : undefined;
  const freshP = freshStory ? byId.get(freshStory.id) : undefined;
  const fresh = freshStory && !freshP?.completedAt && (freshP?.position ?? 1) <= 1 && !(freshP?.readCount ?? 0) ? freshStory : undefined;

  const generate = () => {
    if (key) startStoryJob({ lex, difficulty, topicKey: topic, key });
  };

  return (
    <div className="screen">
      <ScreenSync />
      <div className="screen-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <h1 className="title">읽기</h1>
        <span className="muted small">
          인도네시아어 · 아는 단어 {count('known')} · 배우는 중 {count('learning')} · 아직 안 배운 덱 단어 {count('deckNew')}
        </span>
        <button type="button" className="link-btn small" onClick={() => setMineOpen(true)}>
          기본 단어 {basic.length}개 · 내가 아는 단어 {settings.knownWords?.length ?? 0}개 보기
        </button>
      </div>

      <div className="panel story-make">
        {!key ? (
          <>
            <span className="story-make-title">내 단어로 이야기 만들기</span>
            <span className="muted small" style={{ lineHeight: 1.6 }}>
              이야기는 Gemini가 만들어요. 설정에서 무료 Gemini 키를 먼저 연결해 주세요.
            </span>
            <button type="button" className="btn btn-plain" style={{ height: 48 }} onClick={() => go('settings/voice')}>
              설정에서 연결하기
            </button>
          </>
        ) : step ? (
          <>
            <StoryProgress step={step} />
            <span className="faint small">{isNativeApp() ? '앱을 닫거나 다른 앱을 써도 계속 만들어요. 다 되면 알림으로 알려 드려요.' : '다른 화면으로 가도 뒤에서 계속 만들어요. 다 되면 알려 드려요. (앱을 닫으면 멈춰요)'}</span>
          </>
        ) : (
          <>
            <span className="story-make-title">새 이야기</span>
            <div className="story-make-row">
              <span className="story-make-label">난이도</span>
              <Segmented label="난이도" options={DIFF_OPTIONS} value={difficulty} onChange={setDifficulty} />
            </div>
            <div className="story-make-row">
              <span className="story-make-label">주제</span>
              <div className="chip-row" role="group" aria-label="주제">
                {STORY_TOPICS.map((t) => (
                  <button key={t.key} type="button" className="chip-btn" aria-pressed={topic === t.key} onClick={() => setTopic(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {familiar < FALLBACK_MIN_FAMILIAR && <span className="faint small">아는 단어가 아직 적어서, 꼭 필요하면 덱의 다음 단어도 섞어요.</span>}
            <button type="button" className="btn btn-primary" style={{ height: 52 }} onClick={generate}>
              이야기 만들기
            </button>
            {error && (
              <span role="alert" className="story-error">
                {error}
              </span>
            )}
          </>
        )}
      </div>

      {fresh && (
        <button type="button" className="story-fresh" onClick={() => go(`read/${fresh.id}`)}>
          <span className="row-text">
            <span className="story-fresh-eyebrow">이야기 「{fresh.title}」가 완성됐어요</span>
            <span className="small muted">
              {audio
                ? audio.running
                  ? `음성 준비 중 ${audio.done}/${audio.total}문장 · 지금 읽어도 돼요`
                  : audio.done === audio.total
                    ? '음성 준비 완료'
                    : `음성 ${audio.done}/${audio.total}문장 준비 · 나머지는 기기 음성`
                : '눌러서 읽기'}
            </span>
            {audio && (
              <span className="job-track" aria-hidden="true">
                <span className="job-fill" style={{ display: 'block', width: `${audio.total ? (audio.done / audio.total) * 100 : 0}%` }} />
              </span>
            )}
            {audio?.note && !audio.running && <span className="faint small">{audio.note}</span>}
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
      )}

      {stories.length > 0 && (
        <>
          <span className="section-label">만든 이야기 {stories.length}</span>
          <div className="group">
            {stories.map((s) => {
              const p = byId.get(s.id);
              const started = (p?.position ?? 1) > 1 && !p?.completedAt;
              const read = !!p?.completedAt || (p?.readCount ?? 0) > 0;
              const status = p?.completedAt || (read && !started) ? '다 읽음' : started ? `${Math.round(((p!.position) / s.blocks.length) * 100)}%` : '새 이야기';
              return (
                <div key={s.id} className="row story-item">
                  <button type="button" className="row-text story-row" onClick={() => go(`read/${s.id}`)}>
                    <span className="row-title">{s.title}</span>
                    <span className="row-desc">
                      {s.titleKo && `${s.titleKo} · `}
                      {DIFFICULTIES[s.difficulty].label} · {new Date(s.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                    </span>
                  </button>
                  <span className={`chip${status === '다 읽음' ? ' chip-accent' : status === '새 이야기' ? ' chip-new' : ''}`}>{status}</span>
                  <button type="button" className="icon-btn" aria-label={`${s.title} 메뉴`} onClick={() => setMenu(s)}>
                    <Icon name="more" size={20} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {mineOpen && (
        <div className="dialog-backdrop story-word-backdrop" onClick={() => setMineOpen(false)}>
          <div className="dialog story-sheet" role="dialog" aria-modal="true" aria-label="복습 없이 아는 단어" onClick={(e) => e.stopPropagation()}>
            <div className="story-sheet-handle" aria-hidden="true" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontSize: 18 }}>복습 없이 아는 단어</strong>
              <span className="muted small" style={{ lineHeight: 1.6 }}>
                복습 카드 없이 이야기에서 아는 단어로 치는 말이에요.
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '55vh', overflowY: 'auto' }}>
              <span className="section-label">내가 고른 단어 {settings.knownWords?.length ?? 0}개</span>
              {!settings.knownWords?.length && <span className="faint small">읽다가 덱에 없는 단어를 누르고 "이미 알아요"를 고르면 여기에 들어와요.</span>}
              <div className="group" style={{ padding: '0 16px' }}>
              {(settings.knownWords ?? []).map((w) => (
                <div key={w} className="row">
                  <span className="row-title" style={{ flex: 1 }}>{w}</span>
                  <button type="button" className="btn btn-plain" style={{ height: 36, padding: '0 14px' }} aria-label={`${w} 빼기`} onClick={() => void setKnownWord(settings, w, false)}>
                    빼기
                  </button>
                </div>
              ))}
              </div>
              <span className="section-label">기본 단어 {basic.length}개 (앱에 들어 있음)</span>
              <span className="faint small" style={{ lineHeight: 1.6 }}>모두 아는 단어로 쳐요. 덱에서 이미 배우고 있는 단어는 덱의 복습 기록을 따라요.</span>
              <div className="group" style={{ padding: '0 16px' }}>
                {basic.map(({ w, meaning, e }) => (
                  <div key={w} className="row">
                    <span className="row-text" style={{ flex: 1 }}>
                      <span className="row-title">{w}</span>
                      <span className="row-desc">{meaning}</span>
                    </span>
                    <span className="faint small">{!e || isExtraWord(e) ? '복습 없이 앎' : DECK_STATUS[e.status]}</span>
                  </div>
                ))}
              </div>
            </div>
            <button type="button" className="story-sheet-close" onClick={() => setMineOpen(false)}>닫기</button>
          </div>
        </div>
      )}
      {menu && (
        <div className="dialog-backdrop story-word-backdrop" onClick={() => setMenu(undefined)}>
          <div className="dialog story-sheet" role="dialog" aria-modal="true" aria-label={`${menu.title} 메뉴`} onClick={(e) => e.stopPropagation()}>
            <div className="story-sheet-handle" aria-hidden="true" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontSize: 18 }}>{menu.title}</strong>
              <span className="muted small">
                {menu.titleKo && `${menu.titleKo} · `}
                {DIFFICULTIES[menu.difficulty].label} · 아는 단어 {Math.round(menu.coverage.familiar * 100)}%
              </span>
            </div>
            <div className="group" style={{ padding: '0 16px' }}>
              <button type="button" className="row nav-row" onClick={() => (go(`read/${menu.id}`), setMenu(undefined))}>
                <span className="row-title" style={{ flex: 1 }}>읽기</span>
              </button>
              <button
                type="button"
                className="row nav-row"
                onClick={() => {
                  void restartStory(menu.id);
                  setMenu(undefined);
                }}
              >
                <span className="row-title" style={{ flex: 1 }}>처음부터 다시 읽기</span>
              </button>
              <button
                type="button"
                className="row nav-row"
                onClick={async () => {
                  const target = menu;
                  setMenu(undefined);
                  if (await ask(`"${target.title}" 이야기를 지울까요?`, '지우기')) await deleteStory(target.id);
                }}
              >
                <span className="row-title" style={{ flex: 1, color: 'var(--again)' }}>
                  지우기
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
