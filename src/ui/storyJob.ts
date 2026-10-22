import { useSyncExternalStore } from 'react';
import type { StoryStep } from '../adapters/gemini/story';
import { db } from '../adapters/storage/db';
import { runAudio, runStory, type AudioState, type JobEvent, type StoryJobArgs } from '../adapters/stories/jobs';
import { newId } from '../core/model/ids';
import { isNativeApp } from '../adapters/native/platform';
import { nativeJobRunning, onNativeJobEvent, startNativeJob } from '../adapters/native/backgroundJob';
import type { Story, StoryDifficulty } from '../core/stories/types';
import type { Lexicon } from '../core/stories/vocab';

/**
 * 이야기 만들기·음성 만들기는 화면과 따로 뒤에서 돈다 (다른 화면으로 가도 계속된다).
 * 서비스 워커가 있으면 거기서 돌린다 (sw.ts): 웹앱을 내려도 한동안 계속되고, 끝나면 휴대폰 알림을 띄운다.
 * 서비스 워커가 없거나 답하지 않으면(개발 화면, 예전 버전) 이 화면 안에서 돌린다 (앱을 내리면 멈출 수 있음).
 * 끝나면 저장하고 알림만 주고, 화면을 옮기지는 않는다.
 */
export interface StoryJob {
  status: 'idle' | 'running' | 'done' | 'error';
  /** 지금(마지막) 작업 번호 */
  id?: string;
  startedAt?: number;
  step?: StoryStep;
  error?: string;
  storyId?: string;
  title?: string;
  /** 완성됐는데 사용자가 아직 읽기 탭을 안 본 상태 */
  unseen: boolean;
  /** 알림을 한 번만 띄우려는 번호 */
  seq: number;
}

export type StoryAudioJob = AudioState;

const CHANNEL = 'story-jobs';
/** 서비스 워커가 이 시간 안에 받았다고 답하지 않으면 화면 안에서 돌린다 */
const ACK_MS = 3000;

let job: StoryJob = { status: 'idle', unseen: false, seq: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<StoryJob>) => {
  job = { ...job, ...patch };
  listeners.forEach((l) => l());
};

export const getStoryJob = (): StoryJob => job;
export const subscribeStoryJob = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useStoryJob = (): StoryJob => useSyncExternalStore(subscribeStoryJob, getStoryJob);

let audioJob: StoryAudioJob = { done: 0, total: 0, running: false };
const audioListeners = new Set<() => void>();
const setAudio = (next: StoryAudioJob) => {
  audioJob = next;
  audioListeners.forEach((l) => l());
};
const subscribeAudio = (l: () => void) => {
  audioListeners.add(l);
  return () => void audioListeners.delete(l);
};
export const useStoryAudioJob = (): StoryAudioJob => useSyncExternalStore(subscribeAudio, () => audioJob);

export function markStorySeen(): void {
  if (job.unseen) set({ unseen: false });
}

export function dismissStoryError(): void {
  if (job.status === 'error') set({ status: 'idle', error: undefined });
}

/** 작업 소식 (서비스 워커에서 오든 화면 안에서 돌든 같은 모양) */
function onEvent(e: JobEvent): void {
  if (e.kind === 'audio') {
    setAudio(e.audio);
    return;
  }
  if (e.kind === 'status') {
    void reconcile(e);
    return;
  }
  if (e.kind === 'ack' || e.id !== job.id) return;
  if (e.kind === 'step') {
    if (job.status === 'running') set({ step: e.step });
  } else if (e.kind === 'done') {
    if (job.status === 'running') set({ status: 'done', storyId: e.storyId, title: e.title, unseen: true, step: undefined, seq: job.seq + 1 });
  } else if (job.status === 'running') set({ status: 'error', error: e.message, step: undefined, seq: job.seq + 1 });
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : undefined;
const acks = new Map<string, () => void>();
channel?.addEventListener('message', (m: MessageEvent<JobEvent>) => {
  if (m.data.kind === 'ack') acks.get(m.data.id)?.();
  onEvent(m.data);
});

const worker = (): ServiceWorker | null | undefined => (typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : undefined);

/** 서비스 워커에 일을 맡긴다. 받았다고 답하면 true */
function toWorker(msg: unknown, id: string): Promise<boolean> {
  const sw = worker();
  if (!sw || !channel) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      acks.delete(id);
      resolve(false);
    }, ACK_MS);
    acks.set(id, () => {
      clearTimeout(timer);
      acks.delete(id);
      resolve(true);
    });
    sw.postMessage(msg);
  });
}

/** 다 되면 휴대폰 알림을 띄울 수 있게 처음 한 번 허락을 묻는다 (버튼을 누른 순간에만 물을 수 있다) */
function askNotifications(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
  } catch {
    /* 알림을 못 쓰는 곳 (앱 안 브라우저 등) */
  }
}

export function startStoryJob(args: { lex: Lexicon; difficulty: StoryDifficulty; topicKey: string; key: string }): void {
  if (job.status === 'running') return;
  askNotifications();
  const full: StoryJobArgs = { ...args, id: newId(), startedAt: Date.now() };
  set({ status: 'running', id: full.id, startedAt: full.startedAt, step: { attempt: 1, stage: 'writing' }, error: undefined, storyId: undefined, title: undefined });
  void (async () => {
    // 안드로이드 앱: 앱을 닫아도 계속하는 서비스에 맡긴다 (StoryJobService)
    if (isNativeApp() && (await startNativeJob({ kind: 'story', id: full.id, startedAt: full.startedAt, difficulty: full.difficulty, topicKey: full.topicKey }))) {
      nativeStory = true;
      return;
    }
    if (await toWorker({ type: 'story:start', args: full }, full.id)) return;
    // 서비스 워커가 없으면 이 화면에서 만든다
    hereStory = true;
    const story = await runStory(full, onEvent);
    hereStory = false;
    if (story) runAudioHere(story, true);
  })();
}

/** 화면 안에서(또는 안드로이드 서비스에서) 도는 중이면 서비스 워커 상태와 맞추지 않는다 */
let hereStory = false;
let hereAudio = false;
let nativeStory = false;
let nativeAudio = false;
let localAudio: string | undefined;
function runAudioHere(story: Story, replace: boolean): void {
  if (audioJob.running && !replace) return;
  localAudio = story.id;
  hereAudio = true;
  void runAudio(story, setAudio, () => localAudio !== story.id).finally(() => {
    if (localAudio === story.id) hereAudio = false;
  });
}

/** 다른 이야기의 음성을 만드는 중이면 무시한다. 방금 만든 이야기(replace)는 하던 것을 멈추고 먼저 한다 */
export function startStoryAudio(story: Story, replace = false): void {
  if (audioJob.running && !replace) return;
  const id = newId();
  setAudio({ storyId: story.id, done: 0, total: story.blocks.filter((b) => b.kind === 'line').length, running: true });
  void (async () => {
    if (isNativeApp() && (await startNativeJob({ kind: 'audio', id, storyId: story.id, replace }))) {
      nativeAudio = true;
      return;
    }
    if (await toWorker({ type: 'story:audio', storyId: story.id, replace, id }, id)) return;
    runAudioHere(story, true);
  })();
}

/**
 * 화면이 다시 보일 때: 서비스 워커가 하고 있는 일과 맞춘다.
 * 서비스 워커가 그새 꺼져서 작업을 잃었으면, 이야기가 저장됐는지 보고 완성 또는 "멈췄어요"로 바꾼다.
 */
async function reconcile(s: Extract<JobEvent, { kind: 'status' }>): Promise<void> {
  if (s.audio) setAudio(s.audio);
  else if (audioJob.running && !hereAudio && !nativeAudio) setAudio({ ...audioJob, running: false, note: '앱을 내려 둔 사이 음성 만들기가 멈췄어요' });
  if (s.running) {
    if (job.status !== 'running' || job.id !== s.running.id) set({ status: 'running', id: s.running.id, step: s.running.step });
    return;
  }
  if (job.status !== 'running' || !job.id || hereStory || nativeStory) return;
  const made = await db.stories.where('createdAt').aboveOrEqual(job.startedAt ?? 0).first();
  if (job.status !== 'running') return;
  if (made) set({ status: 'done', storyId: made.id, title: made.title, unseen: true, step: undefined, seq: job.seq + 1 });
  else set({ status: 'error', error: '앱을 내려 둔 사이 이야기 만들기가 멈췄어요. 다시 만들어 주세요', step: undefined, seq: job.seq + 1 });
}


function askStatus(): void {
  worker()?.postMessage({ type: 'story:status' });
  void checkNative();
}

/** 안드로이드 서비스가 일을 마쳤는데 소식을 못 받았으면 (앱이 닫혀 있었음) 저장된 것으로 맞춘다 */
async function nativeFinished(): Promise<void> {
  if (nativeAudio) {
    nativeAudio = false;
    if (audioJob.running) setAudio({ ...audioJob, running: false });
  }
  if (!nativeStory) return;
  nativeStory = false;
  if (job.status !== 'running') return;
  const made = await db.stories.where('createdAt').aboveOrEqual(job.startedAt ?? 0).first();
  if (job.status !== 'running') return;
  if (made) set({ status: 'done', storyId: made.id, title: made.title, unseen: true, step: undefined, seq: job.seq + 1 });
  else set({ status: 'error', error: '이야기를 만들지 못했어요. 다시 시도해 주세요', step: undefined, seq: job.seq + 1 });
}

async function checkNative(): Promise<void> {
  if (!nativeStory && !nativeAudio) return;
  if ((await nativeJobRunning()) === false) await nativeFinished();
}

if (isNativeApp()) onNativeJobEvent((e) => (e.kind === 'finished' ? void nativeFinished() : onEvent(e)));

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') askStatus();
  });
  navigator.serviceWorker?.addEventListener('controllerchange', askStatus);
  askStatus();
  // 화면이 보이는 동안 일하는 중이면 20초마다 물어본다: 서비스 워커를 깨워 두고, 그새 꺼져서 일을 잃었으면 알아챈다
  setInterval(() => {
    if (document.visibilityState === 'visible' && ((job.status === 'running' && !hereStory) || (audioJob.running && !hereAudio) || nativeStory || nativeAudio)) askStatus();
  }, 20_000);
}
