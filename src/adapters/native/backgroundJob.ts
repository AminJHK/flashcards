import { registerPlugin } from '@capacitor/core';
import type { JobEvent } from '../stories/jobs';

/**
 * 안드로이드 앱: 이야기·음성 만들기를 앱을 닫아도 계속하는 서비스 (android/.../StoryJobService.java).
 * 서비스가 화면 없는 앱을 켜서 src/headless.ts가 같은 코드로 만든다. 진행 소식은 'event'로 온다 (앱이 켜져 있을 때).
 */
export type NativeTask =
  | { kind: 'story'; id: string; startedAt: number; difficulty: string; topicKey: string }
  | { kind: 'audio'; id: string; storyId: string; replace: boolean };

interface BackgroundJobPlugin {
  start(o: { task: NativeTask }): Promise<{ started: boolean }>;
  running(): Promise<{ running: boolean; task?: string }>;
  addListener(event: 'event', fn: (e: { json: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

const Plugin = registerPlugin<BackgroundJobPlugin>('BackgroundJob');

/** 서비스에 맡긴다. 이 앱(APK)에 서비스가 없거나 이미 하고 있으면 false */
export async function startNativeJob(task: NativeTask): Promise<boolean> {
  try {
    return (await Plugin.start({ task })).started;
  } catch {
    return false;
  }
}

export async function nativeJobRunning(): Promise<boolean | undefined> {
  try {
    return (await Plugin.running()).running;
  } catch {
    return undefined;
  }
}

/** 'finished': 서비스가 일을 마침 (성공·실패와 상관없이) */
export function onNativeJobEvent(fn: (e: JobEvent | { kind: 'finished' }) => void): void {
  void Plugin.addListener('event', (e) => {
    try {
      fn(JSON.parse(e.json) as JobEvent | { kind: 'finished' });
    } catch {
      /* 모르는 소식 */
    }
  }).catch(() => {});
}
