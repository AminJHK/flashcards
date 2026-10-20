import { createStory, type StoryStep } from '../gemini/story';
import { prepareStoryAudio } from '../speech/speech';
import { db } from '../storage/db';
import { getSettings } from '../storage/repo';
import { saveStory } from '../storage/stories';
import { planStory, type StoryHistory } from '../../core/stories/plan';
import type { Story, StoryDifficulty } from '../../core/stories/types';
import type { Lexicon } from '../../core/stories/vocab';

/**
 * 이야기 만들기·이야기 음성 만들기의 실제 일. 화면(ui/storyJob.ts)과 서비스 워커(sw.ts)가 같이 쓴다.
 * 서비스 워커에서 돌리면 웹앱을 내려도 한동안 계속된다 (브라우저가 화면은 멈춰도 서비스 워커는 조금 더 살려 둔다).
 * 진행 상황은 이벤트(JobEvent)로 알린다. 결과는 IndexedDB에 저장하므로 화면은 db를 다시 읽으면 된다.
 */
export interface StoryJobArgs {
  /** 이 작업의 번호 (화면이 만든다). 서비스 워커가 다시 켜져서 작업을 잃었는지 알아보는 데 쓴다 */
  id: string;
  startedAt: number;
  lex: Lexicon;
  difficulty: StoryDifficulty;
  topicKey: string;
  key: string;
}

export interface AudioState {
  storyId?: string;
  done: number;
  total: number;
  running: boolean;
  /** 멈춘 이유 (한도 등) */
  note?: string;
}

export type JobEvent =
  | { kind: 'ack'; id: string }
  | { kind: 'step'; id: string; step: StoryStep }
  | { kind: 'done'; id: string; storyId: string; title: string }
  | { kind: 'error'; id: string; message: string }
  | { kind: 'audio'; audio: AudioState }
  /** 서비스 워커가 지금 하고 있는 일 (화면이 다시 켜졌을 때 맞춰 보기) */
  | { kind: 'status'; running?: { id: string; step?: StoryStep }; audio?: AudioState };

/** 이야기를 만들어 저장한다. 실패하면 error 이벤트를 내고 undefined */
export async function runStory(args: StoryJobArgs, emit: (e: JobEvent) => void): Promise<Story | undefined> {
  try {
    // 최근 이야기에서 쓴 단어·상황은 피한다 (같은 줄거리 반복 방지)
    const recent = await db.stories.orderBy('createdAt').reverse().limit(12).toArray();
    const history: StoryHistory = {
      newWords: recent.slice(0, 5).flatMap((x) => x.plan?.newWords ?? []),
      reinforce: recent[0]?.plan?.reinforce ?? [],
      seeds: recent.flatMap((x) => (x.plan?.seed ? [x.plan.seed] : [])),
    };
    const plan = planStory(args.lex, args.difficulty, history, args.topicKey);
    const made = await createStory({ lex: args.lex, plan, topicKey: args.topicKey, key: args.key, onStep: (step) => emit({ kind: 'step', id: args.id, step }) });
    const story: Story = { ...made, plan: { newWords: plan.newWords.map((e) => e.word), reinforce: [...plan.focus, ...plan.reinforce].map((e) => e.word), seed: plan.seed?.id } };
    await saveStory(story);
    emit({ kind: 'done', id: args.id, storyId: story.id, title: story.title });
    return story;
  } catch (e) {
    emit({ kind: 'error', id: args.id, message: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
}

/**
 * 이야기의 AI 음성을 한꺼번에 만든다 (이미 있는 문장은 건너뜀). cancelled가 true가 되면 멈춘다 (다른 이야기 음성을 먼저 할 때).
 * "기기 음성으로 읽기"를 켰으면 만들지 않는다 (무료 한도 아끼기).
 */
export async function runAudio(story: Story, emit: (a: AudioState) => void, cancelled: () => boolean = () => false): Promise<void> {
  const total = story.blocks.filter((b) => b.kind === 'line').length;
  let last: AudioState = { storyId: story.id, done: 0, total, running: true };
  const send = (a: AudioState) => {
    last = a;
    if (!cancelled()) emit(a);
  };
  send(last);
  try {
    const settings = await getSettings();
    if (settings.storyDeviceVoice) {
      send({ storyId: story.id, done: 0, total, running: false, note: '기기 음성으로 읽어요' });
      return;
    }
    await prepareStoryAudio(story, settings, (done, count, note) => send({ storyId: story.id, done, total: count, running: !note && done < count, note }), cancelled);
  } catch {
    send({ ...last, running: false, note: '음성 준비가 중단됐어요' });
  }
  if (last.running) send({ ...last, running: false });
}
