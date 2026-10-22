import { describe, expect, it } from 'vitest';
import type { Card, Deck, Note, ReviewLog } from '../model/types';
import type { Scheduler } from '../scheduler/types';
import { studyCsv, studyFileName } from './studyExport';

const sched = { retrievability: () => 0.734 } as unknown as Scheduler;
const DAY = 86_400_000;
const NOW = new Date(2026, 9, 20, 12).getTime();

describe('AI에게 보여 줄 학습 기록 (CSV)', () => {
  it('단어마다 한 줄: 덱·단어·뜻·상태·확률·복습 횟수·틀린 횟수·최근 답. 취소한 답과 초기화 전 답은 빼고, 쉼표·따옴표는 감싼다', () => {
    const decks: Deck[] = [{ id: 'd', name: '테스트 덱', createdAt: 0, settings: {} as Deck['settings'] }];
    const note = (id: string, word: string, meaning: string): Note => ({ id, deckId: 'd', typeId: 'id-spoken', typeVersion: 1, fields: { word, meaning }, tags: ['t1'], createdAt: id === 'a' ? 1 : 2, updatedAt: 0 });
    const card = (id: string, noteId: string, extra: Partial<Card>): Card => ({ id, noteId, deckId: 'd', templateId: 'forward', ord: 0, hidden: false, suspended: false, createdAt: 0, isNew: false, phase: 'review', due: NOW + 3 * DAY, lastReviewAt: NOW - DAY, reps: 4, lapses: 5, ...extra });
    const log = (id: string, cardId: string, rating: 1 | 2 | 3 | 4, at: number): ReviewLog => ({ id, cardId, kind: 'review', rating, at, tzOffsetMin: 0, scheduler: 'fsrs' });
    const reviewLogs: ReviewLog[] = [
      log('l1', 'c1', 3, 1),
      { id: 'r', cardId: 'c1', kind: 'reset', at: 2, tzOffsetMin: 0 },
      log('l2', 'c1', 1, 3),
      log('l3', 'c1', 3, 4),
      log('l4', 'c1', 4, 5),
      { id: 'v', cardId: 'c1', kind: 'void', voidsId: 'l4', at: 6, tzOffsetMin: 0 },
    ];
    const csv = studyCsv({ decks, notes: [note('a', 'jemput', '데리러 가다, "마중"'), note('b', 'baru', '새로운')], cards: [card('c1', 'a', {}), card('c2', 'b', { phase: 'new', isNew: true, lastReviewAt: undefined, lapses: 0 })], reviewLogs }, sched, NOW);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('덱,카드 종류,단어(앞면),뜻(뒷면),상태,지금 떠올릴 확률(%),복습 횟수,틀린 횟수,어려운 단어,마지막 복습,다음 복습,최근 답(오래된→최근),태그');
    expect(lines[1]).toMatch(/^테스트 덱,[^,]+,jemput,"데리러 가다, ""마중""",막 외움,73,2,5,예,2026-10-19,2026-10-23,다시 알았음,t1$/);
    expect(lines[2]).toMatch(/,baru,새로운,새 카드,,0,0,,,,,t1$/);
    expect(studyFileName(NOW)).toBe('flashcards-study-20261020.csv');
  });
});
