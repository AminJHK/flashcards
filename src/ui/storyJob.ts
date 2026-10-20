import { useSyncExternalStore } from 'react';
import { prepareStoryAudio } from '../adapters/speech/speech';
import { getSettings } from '../adapters/storage/repo';
import { createStory, type StoryStep } from '../adapters/gemini/story';
import { saveStory } from '../adapters/storage/stories';
import { db } from '../adapters/storage/db';
import { planStory, type StoryHistory } from '../core/stories/plan';
import type { Story, StoryDifficulty } from '../core/stories/types';
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
      // 최근 이야기에서 쓴 단어·상황은 피한다 (같은 줄거리 반복 방지)
      const recent = await db.stories.orderBy('createdAt').reverse().limit(12).toArray();
      const history: StoryHistory = {
        newWords: recent.slice(0, 5).flatMap((x) => x.plan?.newWords ?? []),
        reinforce: recent[0]?.plan?.reinforce ?? [],
        seeds: recent.flatMap((x) => (x.plan?.seed ? [x.plan.seed] : [])),
      };
      const plan = planStory(args.lex, args.difficulty, history, args.topicKey);
      const made = await createStory({ lex: args.lex, plan, topicKey: args.topicKey, key: args.key, onStep: (step) => set({ step }) });
      const story = { ...made, plan: { newWords: plan.newWords.map((e) => e.word), reinforce: [...plan.focus, ...plan.reinforce].map((e) => e.word), seed: plan.seed?.id } };
      await saveStory(story);
      // 이야기는 바로 읽을 수 있고, 음성은 저장한 뒤에 뒤에서 만든다
      set({ status: 'done', storyId: story.id, title: story.title, unseen: true, step: undefined, seq: job.seq + 1 });
      startStoryAudio(story, true);
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e), step: undefined, seq: job.seq + 1 });
    }
  })();
}

/**
 * 이야기 음성(Gemini) 한꺼번에 만들기. 이야기를 만든 직후에 저절로 돌고, 읽기 화면의 "나머지 음성 만들기"로 다시 돌릴 수 있다
 * (한도·앱 닫기로 중간에 멈췄을 때). 이야기 만들기처럼 화면과 따로 돌아서 다른 화면으로 가도 계속된다. 한 번에 이야기 하나만.
 */
export interface StoryAudioJob {
  storyId?: string;
  done: number;
  total: number;
  running: boolean;
  /** 멈춘 이유 (한도 등) */
  note?: string;
}

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

/** 다른 이야기의 음성을 만드는 중이면 무시한다. 방금 만든 이야기(replace)는 하던 것을 멈추고 먼저 한다 */
export function startStoryAudio(story: Story, replace = false): void {
  if (audioJob.running && !replace) return;
  const total = story.blocks.filter((b) => b.kind === 'line').length;
  setAudio({ storyId: story.id, done: 0, total, running: true });
  const mine = () => audioJob.storyId === story.id;
  void (async () => {
    try {
      const settings = await getSettings();
      await prepareStoryAudio(story, settings, (done, count, note) => {
        if (mine()) setAudio({ storyId: story.id, done, total: count, running: !note && done < count, note });
      }, () => !mine());
    } catch {
      if (mine()) setAudio({ ...audioJob, running: false, note: '음성 준비가 중단됐어요' });
    }
    if (mine() && audioJob.running) setAudio({ ...audioJob, running: false });
  })();
}
