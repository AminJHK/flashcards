import { createEmptyCard, fsrs, State, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import type { Millis, Rating } from '../model/types';
import type { SchedState, Scheduler, SchedulerConfig } from './types';

const LIB_VERSION = 'ts-fsrs-5.4.2';

interface StoredMemory {
  due: Millis;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: Millis;
}

function toStored(c: FsrsCard): StoredMemory {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
  };
}

function fromStored(m: StoredMemory): FsrsCard {
  return {
    ...m,
    due: new Date(m.due),
    last_review: m.last_review !== undefined ? new Date(m.last_review) : undefined,
  };
}

function toState(c: FsrsCard): SchedState {
  const stored = toStored(c);
  return {
    isNew: c.state === State.New,
    phase: c.state === State.New ? 'new' : c.state === State.Review ? 'review' : 'learning',
    due: stored.due,
    reps: c.reps,
    lapses: c.lapses,
    lastReviewAt: stored.last_review,
    memory: stored as unknown as Record<string, unknown>,
  };
}

function cardOf(state: SchedState, fallbackAt: Millis): FsrsCard {
  if (!state.memory) return createEmptyCard(new Date(fallbackAt));
  return fromStored(state.memory as unknown as StoredMemory);
}

/** FSRS-6 (ts-fsrs 5.x 안정판). */
export function createFsrs6(config: SchedulerConfig): Scheduler {
  const f = fsrs({
    request_retention: config.desiredRetention,
    maximum_interval: 36500,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    ...(config.params ? { w: config.params } : {}),
  });

  return {
    id: 'fsrs-6',
    version: `fsrs-6@${LIB_VERSION}`,
    label: 'FSRS-6',
    initial(createdAt) {
      return toState(createEmptyCard(new Date(createdAt)));
    },
    apply(state, rating, at) {
      const res = f.next(cardOf(state, at), new Date(at), rating as Grade);
      return toState(res.card);
    },
    preview(state, at) {
      const p = f.repeat(cardOf(state, at), new Date(at));
      const out = {} as Record<Rating, Millis>;
      for (const r of [1, 2, 3, 4] as Rating[]) out[r] = p[r as Grade].card.due.getTime();
      return out;
    },
    retrievability(state, at) {
      if (state.isNew || !state.memory) return 0;
      return f.get_retrievability(cardOf(state, at), new Date(at), false);
    },
  };
}
