import {
  dateChrono,
  defineScheduler,
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware,
} from 'ts-fsrs7';
import { checkFSRS7Parameters, FSRS7Model, migrateFSRS7Parameters } from 'ts-fsrs7/models/fsrs-7';
import type { Millis, Rating } from '../model/types';
import type { SchedState, Scheduler, SchedulerConfig } from './types';

/**
 * FSRS-7 (ts-fsrs 6.0 베타, 버전 고정). 사용자 요청으로 정식판 전에 바꿨다 (2026-10-20, docs/DESIGN.md §4.1).
 * 베타의 FSRS-7 계산은 fsrs-rs(model_v7)를 옮긴 것이고, 최근 베타는 이름 바꾸기 같은 정리만 했다.
 * 설정은 라이브러리의 DefaultScheduler와 같다 (같은 정책 순서). DefaultScheduler는 비동기라서 같은 것을 동기로 만든다.
 * - 간격을 소수 일로 다룬다 (fractionalDays). 같은 날 다시 보는 것도 계산에 들어간다.
 * - 처음 배우는 단계 1분·10분, 다시 배우는 단계 10분. 모델이 충분히 안다고 보면 단계를 건너뛴다 (allowModelOverride).
 * - 퍼즈(간격 흔들기)는 카드 id와 복습 횟수로 씨앗을 만들어 결정적이다 (로그로 다시 계산해도 같은 결과).
 */
const LIB_VERSION = 'ts-fsrs-6.0.0-beta.15';

const definition = defineScheduler({ model: FSRS7Model, chrono: dateChrono }).use(
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
);

/** 카드 id를 모를 때 (라이브러리가 빈 id를 받지 않는다) */
const NO_ID = 'card';
const LEARNING_STEPS = ['1m', '10m'] as const;
const RELEARNING_STEPS = ['10m'] as const;

/** 저장하는 모양 (Date 대신 밀리초) */
interface StoredMemory {
  stability: number;
  stabilityFast: number;
  difficulty: number;
  state: number;
  scheduleStatus: string;
  dueAt: Millis;
  lastReviewAt: Millis | null;
  cardId: string;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
}

type LibCard = Omit<StoredMemory, 'dueAt' | 'lastReviewAt'> & { dueAt: Date; lastReviewAt: Date | null };

function toStored(c: LibCard): StoredMemory {
  return {
    stability: c.stability,
    stabilityFast: c.stabilityFast,
    difficulty: c.difficulty,
    state: c.state,
    scheduleStatus: c.scheduleStatus,
    dueAt: c.dueAt.getTime(),
    lastReviewAt: c.lastReviewAt ? c.lastReviewAt.getTime() : null,
    cardId: c.cardId,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduledDays,
    learningStep: c.learningStep,
  };
}

function fromStored(m: StoredMemory): LibCard {
  return { ...m, dueAt: new Date(m.dueAt), lastReviewAt: m.lastReviewAt === null ? null : new Date(m.lastReviewAt) };
}

/** FSRS-7 상태: 0 새 카드, 1 배우는 중, 2 복습, 3 다시 배우는 중 */
function toState(c: LibCard): SchedState {
  const stored = toStored(c);
  return {
    isNew: c.state === 0,
    phase: c.state === 0 ? 'new' : c.state === 2 ? 'review' : 'learning',
    due: stored.dueAt,
    reps: c.reps,
    lapses: c.lapses,
    lastReviewAt: stored.lastReviewAt ?? undefined,
    memory: stored as unknown as Record<string, unknown>,
  };
}

/** FSRS-6용으로 최적화한 값(21개)은 FSRS-7에 맞지 않으므로, 맞는 값일 때만 쓴다 */
function weightsFor(params: readonly number[] | undefined): number[] {
  if (params) {
    try {
      return Array.from(checkFSRS7Parameters(params));
    } catch {
      /* FSRS-7 값이 아니다 → 기본값 */
    }
  }
  return Array.from(migrateFSRS7Parameters(undefined));
}

export function createFsrs7(config: SchedulerConfig): Scheduler {
  const s = definition.create({
    config: {
      fractionalDays: true,
      weights: weightsFor(config.params),
      enableShortTerm: true,
      desiredRetention: config.desiredRetention,
      learningSteps: [...LEARNING_STEPS],
      relearningSteps: [...RELEARNING_STEPS],
      allowModelOverride: true,
      enableFuzz: true,
      maximumInterval: 36500,
    },
  });
  const cardOf = (state: SchedState, at: Millis, cardId: string): LibCard =>
    state.memory ? fromStored(state.memory as unknown as StoredMemory) : (s.newCard({ now: new Date(at), cardId }) as unknown as LibCard);

  return {
    id: 'fsrs-7',
    version: `fsrs-7@${LIB_VERSION}`,
    label: 'FSRS-7',
    initial(createdAt, cardId = NO_ID) {
      return toState(s.newCard({ now: new Date(createdAt), cardId }) as unknown as LibCard);
    },
    apply(state, rating, at) {
      const card = cardOf(state, at, NO_ID);
      const res = s.review({ card: card as never, grade: rating as never, now: new Date(at) });
      return toState(res.card as unknown as LibCard);
    },
    preview(state, at) {
      const out = {} as Record<Rating, Millis>;
      for (const p of s.preview({ card: cardOf(state, at, NO_ID) as never, now: new Date(at) })) {
        out[p.grade as Rating] = (p.card as unknown as LibCard).dueAt.getTime();
      }
      return out;
    },
    retrievability(state, at) {
      if (state.isNew || !state.memory) return 0;
      const card = cardOf(state, at, NO_ID);
      if (!card.lastReviewAt) return 0;
      const elapsed = Math.max(0, s.chrono.difference(card.lastReviewAt, new Date(at)));
      return s.model.forgettingCurve(card as never, elapsed);
    },
  };
}
