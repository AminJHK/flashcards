import { useEffect } from 'react';
import { requestPersistence } from '../adapters/files/share';
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
import { ToastProvider, useToast } from './toast';

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

  useEffect(() => {
    void requestPersistence();
  }, []);

  const [a, b, c, ...rest] = route;
  const inReview = a === 'review';
  const editingNote = a === 'notes' && c === 'edit';
  const tab = a === 'add' ? 'add' : a === 'decks' ? 'decks' : a === 'settings' ? 'settings' : a === undefined || a === 'stats' ? '' : null;

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
