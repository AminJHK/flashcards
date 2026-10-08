import type { Millis, ReviewLog } from '../model/types';
import type { SchedState, Scheduler } from './types';

/**
 * 복습 로그로 카드 상태를 처음부터 다시 계산한다 (docs/DESIGN.md §4.2).
 * - void 로그가 가리키는 복습은 없었던 것으로 친다
 * - reset 로그 이후는 새 카드로 다시 시작한다
 */
export function rebuildFromLogs(createdAt: Millis, logs: readonly ReviewLog[], scheduler: Scheduler): SchedState {
  const voided = new Set(logs.filter((l) => l.kind === 'void').map((l) => (l as { voidsId: string }).voidsId));
  const ordered = logs
    .filter((l) => l.kind !== 'void' && !voided.has(l.id))
    .slice()
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));

  let state = scheduler.initial(createdAt);
  let firstReviewAt: Millis | undefined;
  for (const log of ordered) {
    if (log.kind === 'reset') {
      state = scheduler.initial(log.at);
      firstReviewAt = undefined;
    } else if (log.kind === 'review') {
      state = scheduler.apply(state, log.rating, log.at);
      firstReviewAt ??= log.at;
    }
  }
  return firstReviewAt === undefined ? state : { ...state, firstReviewAt };
}
