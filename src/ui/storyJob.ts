import { useSyncExternalStore } from 'react';
import { createStory, type StoryStep } from '../adapters/gemini/story';
import { saveStory } from '../adapters/storage/stories';
import { planStory } from '../core/stories/plan';
import type { StoryDifficulty } from '../core/stories/types';
import type { Lexicon } from '../core/stories/vocab';

/**
 * 이야기 만들기는 화면과 따로 뒤에서 돈다 (다른 화면으로 가도 계속된다).
 * 앱을 완전히 닫거나 새로고침하면 중단된다. 끝나면 저장하고 알림만 주고, 화면을 옮기지는 않는다.
 */
export interface StoryJob {
  status: 'idle' | 'running' | 'done' | 'error';
  step?: StoryStep;
  error?: string;
  storyId?: string;
  title?: string;
  /** 완성됐는데 사용자가 아직 읽기 탭을 안 본 상태 */
  unseen: boolean;
  /** 알림을 한 번만 띄우려는 번호 */
  seq: number;
}

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

export function markStorySeen(): void {
  if (job.unseen) set({ unseen: false });
}

export function dismissStoryError(): void {
  if (job.status === 'error') set({ status: 'idle', error: undefined });
}

export function startStoryJob(args: { lex: Lexicon; difficulty: StoryDifficulty; topicKey: string; key: string }): void {
  if (job.status === 'running') return;
  set({ status: 'running', step: { attempt: 1, stage: 'writing' }, error: undefined, storyId: undefined, title: undefined });
  void (async () => {
    try {
      const plan = planStory(args.lex, args.difficulty);
      const story = await createStory({ lex: args.lex, plan, topicKey: args.topicKey, key: args.key, onStep: (step) => set({ step }) });
      await saveStory(story);
      set({ status: 'done', storyId: story.id, title: story.title, unseen: true, step: undefined, seq: job.seq + 1 });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e), step: undefined, seq: job.seq + 1 });
    }
  })();
}
