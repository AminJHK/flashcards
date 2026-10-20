/// <reference lib="webworker" />
/**
 * 서비스 워커: 오프라인용 파일 저장(예전 generateSW 설정과 같음) + 이야기·음성 만들기.
 * 이야기 만들기를 여기서 하면 웹앱을 내려도 한동안 계속되고, 다 되면 휴대폰 알림을 띄운다 (사용자 요청 2026-10-20).
 * 브라우저가 서비스 워커를 오래(보통 몇 분) 살려 두지는 않으므로, 너무 오래 걸리면 중간에 멈출 수 있다 → 화면이 다시 켜지면 맞춘다 (ui/storyJob.ts).
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';
import { db } from './adapters/storage/db';
import { runAudio, runStory, type AudioState, type JobEvent, type StoryJobArgs } from './adapters/stories/jobs';
import type { StoryStep } from './adapters/gemini/story';
import type { Story } from './core/stories/types';

declare const self: ServiceWorkerGlobalScope;

// 새 버전은 바로 쓰기 시작한다 (registerType: autoUpdate)
void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
// 한자 폰트는 글자 범위별로 수백 개 파일로 나뉘어 있다. 전부 미리 받지 않고, 쓰는 것만 받아서 저장한다.
registerRoute(({ url }) => /\.(woff2?|ttf)$/.test(url.pathname), new CacheFirst({ cacheName: 'fonts', plugins: [new ExpirationPlugin({ maxEntries: 400 })] }));

const channel = new BroadcastChannel('story-jobs');
const emit = (e: JobEvent) => channel.postMessage(e);

let running: { id: string; step?: StoryStep } | undefined;
let audio: AudioState | undefined;

const ICON = 'icon-192.png';

/** 화면이 안 보일 때만 알린다 (보고 있으면 화면 안 알림으로 충분) */
async function notify(title: string, body: string, path: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((c) => c.visibilityState === 'visible')) return;
    await self.registration.showNotification(title, { body, tag: 'story', icon: ICON, badge: ICON, data: { url: `${self.registration.scope}#/${path}` } });
  } catch {
    /* 알림을 못 띄워도 이야기는 저장돼 있다 */
  }
}

async function makeAudio(story: Story, replace: boolean): Promise<void> {
  if (audio?.running && !replace) return;
  audio = { storyId: story.id, done: 0, total: 0, running: true };
  await runAudio(
    story,
    (a) => {
      audio = a;
      emit({ kind: 'audio', audio: a });
    },
    () => audio?.storyId !== story.id,
  );
  const a = audio as AudioState | undefined;
  if (a?.storyId === story.id && !a.running) {
    if (a.total && a.done >= a.total) await notify(`「${story.title}」 음성까지 준비됐어요`, '눌러서 읽기', `read/${story.id}`);
    else if (a.note && a.note !== '기기 음성으로 읽어요') await notify(`「${story.title}」 음성은 ${a.done}/${a.total}문장만 준비됐어요`, a.note, `read/${story.id}`);
  }
}

async function makeStory(args: StoryJobArgs): Promise<void> {
  running = { id: args.id };
  const story = await runStory(args, (e) => {
    if (e.kind === 'step' && running?.id === e.id) running = { id: e.id, step: e.step };
    emit(e);
  });
  running = undefined;
  if (!story) {
    await notify('이야기를 만들지 못했어요', '앱을 열어 이유를 확인해 주세요', 'read');
    return;
  }
  await notify(`이야기 「${story.title}」가 완성됐어요`, '눌러서 읽기 · 음성은 이어서 만들어요', `read/${story.id}`);
  await makeAudio(story, true);
}

type Message = { type: 'story:start'; args: StoryJobArgs } | { type: 'story:audio'; storyId: string; replace: boolean; id: string } | { type: 'story:status' };

self.addEventListener('message', (event) => {
  const m = event.data as Message;
  if (m?.type === 'story:status') {
    emit({ kind: 'status', running, audio });
    return;
  }
  if (m?.type === 'story:start') {
    emit({ kind: 'ack', id: m.args.id });
    if (running) {
      emit({ kind: 'error', id: m.args.id, message: '이미 다른 이야기를 만들고 있어요. 끝난 뒤에 다시 해 주세요' });
      return;
    }
    // waitUntil: 이 일이 끝날 때까지 서비스 워커를 살려 둬 달라고 브라우저에 알린다
    event.waitUntil(makeStory(m.args));
    return;
  }
  if (m?.type === 'story:audio') {
    emit({ kind: 'ack', id: m.id });
    event.waitUntil(
      db.stories.get(m.storyId).then((story) => {
        if (story) return makeAudio(story, m.replace);
      }),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
