import type { Millis, MemoryState, Rating } from '../model/types';

/** 카드 한 장의 스케줄링 결과. Card 캐시에 그대로 들어간다. */
export interface SchedState {
  isNew: boolean;
  phase: 'new' | 'learning' | 'review';
  due: Millis;
  reps: number;
  lapses: number;
  lastReviewAt?: Millis;
  firstReviewAt?: Millis;
  memory?: MemoryState;
}

export interface SchedulerConfig {
  desiredRetention: number;
  /** 최적화한 파라미터. 없으면 알고리즘 기본값 */
  params?: number[];
}

/**
 * 스케줄링 알고리즘 어댑터. FSRS-7 등 새 알고리즘은 이 인터페이스를 구현해 추가한다.
 * 같은 입력에는 항상 같은 결과를 내야 한다 (로그 재계산이 결정적이어야 하므로).
 */
export interface Scheduler {
  /** 설정에 저장되는 id. 예: 'fsrs-6' */
  id: string;
  /** 로그에 남기는 상세 버전. 예: 'fsrs-6@ts-fsrs-5.4.2' */
  version: string;
  label: string;
  initial(createdAt: Millis): SchedState;
  apply(state: SchedState, rating: Rating, at: Millis): SchedState;
  /** 버튼별 다음 복습 시각 */
  preview(state: SchedState, at: Millis): Record<Rating, Millis>;
  /** 지금 기억하고 있을 확률 (0~1). 새 카드는 0 */
  retrievability(state: SchedState, at: Millis): number;
}

export type SchedulerFactory = (config: SchedulerConfig) => Scheduler;
