import { applyAnswers, headlessDone, scheduleAlarms } from './adapters/native/reviewNotify';
import type { NativeTask } from './adapters/native/backgroundJob';
import { db } from './adapters/storage/db';
import { getSettings, schedulerFor } from './adapters/storage/repo';
import { runAudio, runStory, type JobEvent } from './adapters/stories/jobs';
import { buildLexicon } from './core/stories/vocab';

/**
 * 화면 없이 뒤에서 켜졌을 때 (안드로이드 앱, HeadlessRunner.java). 화면은 그리지 않는다.
 * - 할 일(task)이 있으면: 이야기 또는 음성 만들기 (StoryJobService, 앱을 닫아도 계속). 진행 소식은 event로 보낸다.
 * - 없으면: 알림에서 누른 답을 복습 기록에 넣고 새 알림 계획을 보낸다 (HeadlessJobService).
 */
interface Bridge {
  task?: () => string;
  event?: (json: string) => void;
}
const bridge = (globalThis as { FlashcardsHeadless?: Bridge }).FlashcardsHeadless;
const emit = (e: JobEvent) => bridge?.event?.(JSON.stringify(e));

async function runTask(task: NativeTask): Promise<void> {
  if (task.kind === 'audio') {
    const story = await db.stories.get(task.storyId);
    if (story) await runAudio(story, (audio) => emit({ kind: 'audio', audio }));
    return;
  }
  const settings = await getSettings();
  const key = settings.gemini?.apiKey;
  if (!key) {
    emit({ kind: 'error', id: task.id, message: '설정에서 Gemini 키를 먼저 연결해 주세요' });
    return;
  }
  const [notes, cards] = await Promise.all([db.notes.toArray(), db.cards.toArray()]);
  const lex = buildLexicon(notes, cards, schedulerFor(settings), Date.now());
  const story = await runStory({ id: task.id, startedAt: task.startedAt, lex, difficulty: task.difficulty as never, topicKey: task.topicKey, key }, emit);
  if (story) await runAudio(story, (audio) => emit({ kind: 'audio', audio }));
}

void (async () => {
  try {
    const raw = bridge?.task?.();
    if (raw) await runTask(JSON.parse(raw) as NativeTask);
    else {
      await applyAnswers();
      await scheduleAlarms();
    }
  } catch {
    /* 알림 답: 못 넣은 답은 남아 있다가 다음에 앱이 켜질 때 들어간다. 이야기: 앱이 다시 보이면 저장된 것으로 맞춘다 */
  } finally {
    headlessDone();
  }
})();
