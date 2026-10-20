import { createFsrs6 } from './fsrs6';
import { createFsrs7 } from './fsrs7';
import type { Scheduler, SchedulerConfig, SchedulerFactory } from './types';

/**
 * 사용할 수 있는 스케줄러 목록 (docs/DESIGN.md §4.1). 기본은 FSRS-7, 설정에서 FSRS-6으로 되돌릴 수 있다.
 */
const FACTORIES: Record<string, SchedulerFactory> = {
  'fsrs-7': createFsrs7,
  'fsrs-6': createFsrs6,
};

export const DEFAULT_SCHEDULER_ID = 'fsrs-7';

export function createScheduler(id: string, config: SchedulerConfig): Scheduler {
  const factory = FACTORIES[id] ?? FACTORIES[DEFAULT_SCHEDULER_ID]!;
  return factory(config);
}

export function schedulerIds(): string[] {
  return Object.keys(FACTORIES);
}
