import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { play, stopAll } from '../../adapters/speech/speech';
import { db } from '../../adapters/storage/db';
import { saveSettings } from '../../adapters/storage/repo';
import { getProgress, saveProgress } from '../../adapters/storage/stories';
import { listened, listenOrder } from '../../core/stories/listenOrder';
import type { Story, StoryLine } from '../../core/stories/types';
import { roleOf, storyVoice } from '../../core/stories/voices';
import type { Settings } from '../../core/model/types';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Controls';
import { useSettings } from '../hooks';
import { go } from '../router';

/**
 * 운전 모드: 끝까지 읽은 이야기를 오래 안 들은 순서로 이어서 듣는다 (사용자 요청 2026-10-23).
 * 문장마다 인도네시아어 → (켜 두면) 한국어 해석. 저장된 Gemini 음성만 쓰고 없으면 기기 음성 (새로 만들지 않음),
 * 한국어 해석과 제목 안내는 항상 기기 음성. 복습 기록(FSRS)은 바꾸지 않고, 이야기마다 마지막으로 들은 시각만 적는다.
 * 차 핸들·블루투스 버튼: 이전 = 이 문장 다시 (빨리 두 번 = 앞 문장), 다음 = 다음 이야기 (Media Session).
 */
const GAP_MS = 700;
const DOUBLE_MS = 1500;

const linesOf = (s: Story) => s.blocks.filter((b): b is StoryLine => b.kind === 'line');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type WakeLock = { release: () => Promise<void> };

export function DriveListen() {
  const settings = useSettings();
  const stories = useLiveQuery(() => db.stories.orderBy('createdAt').toArray(), []);
  const progress = useLiveQuery(() => db.storyProgress.toArray(), []);
  // 순서는 화면에 들어올 때 한 번만 정한다 (듣는 중에 기록이 바뀌어도 순서가 흔들리지 않게)
  const [order, setOrder] = useState<string[]>();
  useEffect(() => {
    if (order || !stories || !progress) return;
    setOrder(listenOrder(stories, progress));
  }, [order, stories, progress]);
  const byId = useMemo(() => new Map((stories ?? []).map((s) => [s.id, s])), [stories]);
  const [pos, setPos] = useState({ s: 0, l: 0 });
  const [playing, setPlaying] = useState(false);
  const token = useRef(0);
  const posRef = useRef(pos);
  posRef.current = pos;
  const lastPrev = useRef(0);
  const withKo = settings?.listenKo !== false;
  const live = useRef({ settings, withKo, order, byId });
  live.current = { settings, withKo, order, byId };

  const sayKo = (text: string, s: Settings | undefined) => play([{ text, lang: 'ko-KR' }], s ? { ...s, gemini: undefined } : s, { awaitDevice: true });
  const sayId = (story: Story, line: StoryLine, s: Settings | undefined) => {
    const deviceOnly = s?.storyDeviceVoice === true;
    const vs = s && deviceOnly && s.gemini ? { ...s, gemini: { ...s.gemini, useTts: false } } : s;
    const assigned = s?.storyVoices?.[story.id] ?? {};
    const role = roleOf(story, line);
    return play([{ text: line.text, lang: 'id-ID', style: 'story' }], vs, {
      voice: storyVoice(story, role, assigned),
      rate: s?.storyPlaybackRate ?? 0.85,
      cachedOnly: true,
      awaitDevice: true,
      anyVoice: !assigned[role],
      timeoutMs: 15_000,
    });
  };

  const run = async (si: number, li: number) => {
    const my = ++token.current;
    stopAll();
    setPlaying(true);
    let s = si;
    let l = li;
    try {
      for (;;) {
        const { order: ids, byId: map } = live.current;
        if (!ids?.length) return;
        const story = map.get(ids[s % ids.length]!);
        if (!story) return;
        const lines = linesOf(story);
        if (l === 0) {
          setPos({ s, l });
          await sayKo(`${s + 1}번째 이야기. ${story.titleKo || story.title}`, live.current.settings);
          if (my !== token.current) return;
          await wait(GAP_MS);
        }
        for (; l < lines.length; l++) {
          if (my !== token.current) return;
          setPos({ s, l });
          await sayId(story, lines[l]!, live.current.settings);
          if (my !== token.current) return;
          await wait(GAP_MS);
          if (live.current.withKo && lines[l]!.ko) {
            if (my !== token.current) return;
            await sayKo(lines[l]!.ko, live.current.settings);
            if (my !== token.current) return;
            await wait(GAP_MS + 300);
          }
        }
        if (my !== token.current) return;
        void getProgress(story.id).then((p) => saveProgress(listened(p, Date.now())));
        s = (s + 1) % ids.length;
        l = 0;
      }
    } finally {
      if (my === token.current) setPlaying(false);
    }
  };
  const stop = () => {
    token.current++;
    stopAll();
    setPlaying(false);
  };
  const again = () => {
    const now = Date.now();
    const { s, l } = posRef.current;
    const back = now - lastPrev.current < DOUBLE_MS;
    lastPrev.current = now;
    void run(s, back ? Math.max(0, l - 1) : l);
  };
  const fromStart = () => void run(posRef.current.s, 0);
  const next = () => void run(posRef.current.s + 1, 0);
  const toggle = () => (playing ? stop() : void run(posRef.current.s, posRef.current.l));
  const actions = useRef({ again, next, toggle, stop });
  actions.current = { again, next, toggle, stop };

  // 들어오면 바로 시작 (읽기 탭의 버튼을 누르고 들어오므로 소리를 낼 수 있다)
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !order?.length || !settings) return;
    started.current = true;
    void run(0, 0);
  });

  // 화면이 꺼지지 않게 (지원하는 브라우저만). 다시 보이면 다시 요청한다
  useEffect(() => {
    let lock: WakeLock | undefined;
    const ask = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock?.request('screen');
      } catch {
        /* 못 쓰는 곳 */
      }
    };
    void ask();
    const onVis = () => document.visibilityState === 'visible' && void ask();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  // 차 핸들·블루투스·잠금 화면 버튼
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    const set = (a: MediaSessionAction, h: (() => void) | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* 지원하지 않는 버튼 */
      }
    };
    set('play', () => actions.current.toggle());
    set('pause', () => actions.current.toggle());
    set('previoustrack', () => actions.current.again());
    set('nexttrack', () => actions.current.next());
    return () => {
      for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) set(a, null);
    };
  }, []);

  // 화면을 떠나면 멈춘다
  useEffect(() => () => {
    token.current++;
    stopAll();
  }, []);

  const ids = order ?? [];
  const story = ids.length ? byId.get(ids[pos.s % ids.length]!) : undefined;
  const line = story ? linesOf(story)[pos.l] : undefined;
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms || !story || typeof MediaMetadata === 'undefined') return;
    try {
      ms.metadata = new MediaMetadata({ title: story.title, artist: story.titleKo || '이야기 듣기', album: '운전 모드' });
      ms.playbackState = playing ? 'playing' : 'paused';
    } catch {
      /* 무시 */
    }
  }, [story, playing]);

  if (!stories || !progress || !settings || !order) return <div className="screen" />;
  return (
    <div className="screen drive">
      <div className="drive-head">
        <button type="button" className="icon-btn" aria-label="운전 모드 닫기" onClick={() => go('read')}>
          <Icon name="close" size={24} />
        </button>
        <span className="drive-title">운전 모드</span>
      </div>
      {!ids.length ? (
        <div className="panel" style={{ padding: 20, lineHeight: 1.6 }}>
          끝까지 읽은 이야기가 아직 없어요. 이야기를 하나 끝까지 읽으면 여기서 이어 들을 수 있어요.
        </div>
      ) : (
        <>
          <div className="drive-now" aria-live="polite">
            <span className="drive-count">
              {(pos.s % ids.length) + 1} / {ids.length} · {story?.titleKo || story?.title}
            </span>
            <p className="drive-line" lang="id">{line?.text ?? story?.title}</p>
            {withKo && line?.ko && <p className="drive-ko">{line.ko}</p>}
          </div>
          <div className="drive-controls">
            <button type="button" className="drive-btn" onClick={again}>
              <Icon name="speaker" size={28} />
              이 문장 다시
            </button>
            <button type="button" className="drive-btn drive-main" onClick={toggle} aria-label={playing ? '멈춤' : '이어서 듣기'}>
              {playing ? '멈춤' : '이어서 듣기'}
            </button>
            <button type="button" className="drive-btn" onClick={fromStart}>
              이야기 처음부터
            </button>
            <button type="button" className="drive-btn" onClick={next}>
              다음 이야기
            </button>
          </div>
          <div className="group" style={{ padding: '0 16px' }}>
            <div className="row">
              <span className="row-text" style={{ flex: 1 }}>
                <span className="row-title">해석도 같이 듣기</span>
                <span className="row-desc">문장마다 인도네시아어 다음에 한국어 해석을 읽어요.</span>
              </span>
              <Switch label="해석도 같이 듣기" checked={withKo} onChange={(v) => void saveSettings({ listenKo: v })} />
            </div>
          </div>
          <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.6 }}>
            차나 이어폰의 ⏮ 버튼: 이 문장 다시 (빨리 두 번 누르면 앞 문장) · ⏭ 버튼: 다음 이야기. 만들어 둔 음성만 쓰고, 없으면 기기 음성으로 읽어요. 복습 기록은 바뀌지 않아요.
          </span>
        </>
      )}
    </div>
  );
}
