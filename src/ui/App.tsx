import { useEffect, useState } from 'react';
import type { Settings as SettingsData } from '../core/model/types';
import { requestPersistence } from '../adapters/files/share';
import { dropStaleClips } from '../adapters/speech/speech';
import { enterFullscreen, exitFullscreen } from '../adapters/display/fullscreen';
import { TabBar } from './components/TabBar';
import { useSettings } from './hooks';
import { go, useRoute } from './router';
import { DeckDetail, DeckList, DeckNew, NoteList } from './screens/Decks';
import { Home } from './screens/Home';
import { NoteEditor } from './screens/NoteEditor';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { applyTheme } from './theme';
import { ConfirmHost, ErrorBoundary } from './confirm';
import { StartSync } from './StartSync';
import { FirstTapSync } from './FirstTapSync';
import { useSyncStatus } from './useSyncStatus';
import { syncWithDrive } from './driveSync';
import { ToastProvider, useToast } from './toast';

/** 시작 화면을 보여 줄지: Drive를 연결했고, 설정에서 켠 경우만 */
const wantsGate = (s: SettingsData | undefined) => !!s?.googleDrive?.clientId && s.googleDrive.startScreen === true;

export function App() {
  const route = useRoute();
  const settings = useSettings();

  // 테마: 설정이 바뀌거나, "시스템"일 때 기기 테마가 바뀌면 다시 적용
  useEffect(() => {
    if (!settings) return;
    applyTheme(settings);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => applyTheme(settings);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [settings]);

  // 시작 화면("Google로 로그인하고 시작")은 설정에서 켠 경우에만. 기본은 바로 열고, 처음 누를 때 뒤에서 동기화한다 (FirstTapSync)
  // (앱을 연 순간의 설정으로 한 번만 정한다. 쓰는 중에 Drive를 연결해도 시작 화면이 다시 뜨지 않게)
  const [gate, setGate] = useState<boolean>();
  useEffect(() => {
    if (settings && gate === undefined) setGate(wantsGate(settings));
  }, [settings, gate]);
  const askSync = gate ?? wantsGate(settings);
  const tapSync = settings?.googleDrive?.clientId && settings.googleDrive.syncOnStart !== false ? settings.googleDrive.clientId : undefined;

  // 쓰는 동안 자동 동기화: 5분마다, 그리고 앱이 뒤로 갈 때. 로그인 창은 띄우지 않는다 (받아 둔 토큰이 있을 때만)
  const driveOn = !!settings?.googleDrive?.clientId;
  useEffect(() => {
    if (!driveOn) return;
    const quiet = () => void syncWithDrive({ interactive: false }).catch(() => {});
    const t = setInterval(quiet, 5 * 60_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') quiet();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [driveOn]);

  // 아직 Drive에 못 올린 기록이 있는데 창을 닫으려 하면 브라우저가 한 번 물어본다
  const unsynced = (useSyncStatus()?.pending ?? 0) > 0;
  useEffect(() => {
    if (!unsynced) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsynced]);

  // 전체 화면: 브라우저는 탭할 때만 허락하므로, 켜져 있으면 탭할 때마다 확인한다
  const full = settings?.immersive;
  useEffect(() => {
    if (full === undefined) return;
    if (!full) {
      exitFullscreen();
      return;
    }
    // 버튼이 할 일(파일 고르기, 로그인 창 등)을 먼저 하도록, 클릭이 다 처리된 뒤(버블 단계 끝)에 요청한다.
    // 전체 화면 요청이 먼저 가면 브라우저가 "사용자가 누름" 허가를 써 버려서 파일 고르기 창이 안 뜬다.
    const h = () => setTimeout(enterFullscreen, 0);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [full]);

  useEffect(() => {
    void requestPersistence();
    void dropStaleClips().catch(() => {});
  }, []);

  const [a, b, c, ...rest] = route;
  const inReview = a === 'review';
  const editingNote = a === 'notes' && c === 'edit';
  const tab = a === 'add' ? 'add' : a === 'decks' ? 'decks' : a === 'settings' ? 'settings' : a === undefined || a === 'stats' ? '' : null;

  if (settings && askSync) {
    return (
      <div className="app">
        <ToastProvider high>
          <StartSync s={settings} onDone={() => setGate(false)} />
          <ConfirmHost />
        </ToastProvider>
      </div>
    );
  }

  let screen;
  if (inReview) screen = <Review key={b ?? 'all'} deckId={b} />;
  else if (editingNote && b) screen = <NoteEditor mode="edit" noteId={b} onDone={() => go(rest.join('/') || 'decks')} />;
  else if (a === 'add') screen = <NoteEditor mode="add" />;
  else if (a === 'decks' && b === 'new') screen = <DeckNew />;
  else if (a === 'decks' && b && c === 'notes') screen = <NoteList deckId={b} />;
  else if (a === 'decks' && b) screen = <DeckDetail key={b} id={b} />;
  else if (a === 'decks') screen = <DeckList />;
  else if (a === 'settings') screen = <Settings />;
  else if (a === 'stats') screen = <Stats />;
  else screen = <Home />;

  const showTabs = !inReview && !editingNote;

  return (
    <div className="app">
      <ToastProvider high={!showTabs}>
        <ErrorBoundary resetKey={route.join('/')}>{screen}</ErrorBoundary>
        {showTabs && <TabBar current={tab ?? ''} />}
        {tapSync && <FirstTapSync clientId={tapSync} />}
        <GlobalErrors />
        <ConfirmHost />
      </ToastProvider>
    </div>
  );
}

/** 처리하지 못한 오류가 나도 조용히 굳지 않고 알림으로 알려준다. */
function GlobalErrors() {
  const toast = useToast();
  useEffect(() => {
    const say = (e: unknown) => {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
      if (!msg || /ResizeObserver|AbortError|NotAllowedError/.test(msg)) return;
      toast(`문제가 생겼어요 · ${msg}`);
    };
    const onErr = (ev: ErrorEvent) => say(ev.error ?? ev.message);
    const onRej = (ev: PromiseRejectionEvent) => say(ev.reason);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, [toast]);
  return null;
}
