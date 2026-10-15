import type { Id } from '../../core/model/types';
import type { Story, StoryProgress } from '../../core/stories/types';
import { db, type FlashcardsDB } from './db';

/** 만든 이야기는 바로 저장한다. 다시 열 때 AI를 다시 부르지 않는다. */
export async function saveStory(story: Story, d: FlashcardsDB = db): Promise<void> {
  await d.stories.put(story);
}

export async function listStories(d: FlashcardsDB = db): Promise<Story[]> {
  return d.stories.orderBy('createdAt').reverse().toArray();
}

export async function deleteStory(id: Id, d: FlashcardsDB = db): Promise<void> {
  await d.transaction('rw', [d.stories, d.storyProgress], async () => {
    await d.stories.delete(id);
    await d.storyProgress.delete(id);
  });
}

export async function getProgress(storyId: Id, d: FlashcardsDB = db): Promise<StoryProgress> {
  return (await d.storyProgress.get(storyId)) ?? { storyId, position: 1, answers: {}, readCount: 0, updatedAt: 0 };
}

export async function saveProgress(p: StoryProgress, d: FlashcardsDB = db): Promise<void> {
  await d.storyProgress.put({ ...p, updatedAt: Date.now() });
}

/** 처음부터 다시 읽기. 끝까지 읽은 횟수는 남긴다 */
export async function restartStory(storyId: Id, d: FlashcardsDB = db): Promise<void> {
  const p = await getProgress(storyId, d);
  await saveProgress({ ...p, position: 1, answers: {}, completedAt: undefined }, d);
}
