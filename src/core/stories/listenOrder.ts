import type { Id, Millis } from '../model/types';
import type { StoryProgress } from './types';

/**
 * 운전 모드(다 읽은 이야기 이어 듣기)의 순서: 끝까지 읽은 이야기만, 오래 안 들은 것부터.
 * 같은 날 들은 것끼리(또는 한 번도 안 들은 것끼리)는 섞는다. 한 바퀴 안에서 같은 이야기는 한 번만.
 */
export function listenOrder(stories: readonly { id: Id }[], progress: readonly StoryProgress[], rng: () => number = Math.random): Id[] {
  const byId = new Map(progress.map((p) => [p.storyId, p]));
  const DAY = 86_400_000;
  const done = stories.filter((s) => byId.get(s.id)?.completedAt);
  const keyed = done.map((s) => ({ id: s.id, day: Math.floor((byId.get(s.id)!.lastListenedAt ?? 0) / DAY), r: rng() }));
  return keyed.sort((a, b) => a.day - b.day || a.r - b.r).map((x) => x.id);
}

/** 이 이야기를 들었다고 적는다 (복습 기록·읽은 횟수와는 따로) */
export const listened = (p: StoryProgress, at: Millis): StoryProgress => ({ ...p, lastListenedAt: at });
