import { createFsrs6 } from './fsrs6';
import type { Scheduler, SchedulerConfig, SchedulerFactory } from './types';

/**
 * 사용할 수 있는 스케줄러 목록.
 * FSRS-7은 ts-fsrs 6.0 정식판이 나오면 여기에 추가한다 (docs/DESIGN.md §4.1).
 */
const FACTORIES: Record<string, SchedulerFactory> = {
  'fsrs-6': createFsrs6,
};

export const DEFAULT_SCHEDULER_ID = 'fsrs-6';

export function createScheduler(id: string, config: SchedulerConfig): Scheduler {
  const factory = FACTORIES[id] ?? FACTORIES[DEFAULT_SCHEDULER_ID]!;
  return factory(config);
}

export function schedulerIds(): string[] {
  return Object.keys(FACTORIES);
}
