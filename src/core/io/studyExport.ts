import { getCardType } from '../cardTypes/registry';
import type { Card, Deck, Millis, Note, ReviewLog } from '../model/types';
import { isHard, wordMemory } from '../stats/memory';
import type { Scheduler } from '../scheduler/types';

/**
 * AI(ChatGPT 등)에게 보여 줄 학습 기록 (사용자 요청 2026-10-20: "GPT가 내 카드와 복습 기록을 보게").
 * 백업 파일(JSON)은 id로 서로 이어져 있어 읽기 어려워서, 단어 하나에 한 줄인 CSV로 만든다.
 * 사용자가 직접 파일을 저장하거나 보낸다. 앱이 어디로 보내지는 않는다 (공개 저장소에도 넣지 않는다).
 */
const LEVEL_TEXT = { fresh: '새 카드', learning: '배우는 중', young: '막 외움', growing: '자라는 중', solid: '탄탄함', mastered: '완전히 앎' } as const;

const HEADER = ['덱', '카드 종류', '단어(앞면)', '뜻(뒷면)', '상태', '지금 떠올릴 확률(%)', '복습 횟수', '틀린 횟수', '어려운 단어', '마지막 복습', '다음 복습', '최근 답(오래된→최근)', '태그'];

/** 최근 답을 몇 개까지 적을지 */
const RECENT = 8;
const RATING_TEXT: Record<number, string> = { 1: '다시', 2: '어려움', 3: '알았음', 4: '쉬움' };

function cell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function day(t: Millis | undefined): string {
  if (t === undefined) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function studyFileName(now: Millis): string {
  return `flashcards-study-${day(now).replace(/-/g, '')}.csv`;
}

export function studyCsv(data: { decks: readonly Deck[]; notes: readonly Note[]; cards: readonly Card[]; reviewLogs: readonly ReviewLog[] }, scheduler: Scheduler, now: Millis): string {
  const deckName = new Map(data.decks.map((d) => [d.id, d.name]));
  const cardsByNote = new Map<string, Card[]>();
  for (const c of data.cards) cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c]);
  const noteOfCard = new Map(data.cards.map((c) => [c.id, c.noteId]));
  // 취소한 답(void)과 카드를 초기화(reset)하기 전의 답은 빼고 센다
  const voided = new Set(data.reviewLogs.flatMap((l) => (l.kind === 'void' ? [l.voidsId] : [])));
  const byCard = new Map<string, ReviewLog[]>();
  for (const l of [...data.reviewLogs].sort((a, b) => a.at - b.at)) {
    if (l.kind === 'void' || voided.has(l.id)) continue;
    if (l.kind === 'reset') byCard.set(l.cardId, []);
    else byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l]);
  }
  const answers = new Map<string, Extract<ReviewLog, { kind: 'review' }>[]>();
  for (const [cardId, logs] of byCard) {
    const noteId = noteOfCard.get(cardId);
    if (!noteId) continue;
    for (const l of logs) if (l.kind === 'review') answers.set(noteId, [...(answers.get(noteId) ?? []), l]);
  }
  const rows = [HEADER.map(cell).join(',')];
  const notes = [...data.notes].sort((a, b) => (deckName.get(a.deckId) ?? '').localeCompare(deckName.get(b.deckId) ?? '') || a.createdAt - b.createdAt);
  for (const n of notes) {
    const cards = cardsByNote.get(n.id) ?? [];
    const m = wordMemory(cards, scheduler, now);
    if (!m) continue; // 숨긴 카드·보류한 카드만 있는 단어
    let type: string;
    let title: string;
    let sub: string;
    try {
      const t = getCardType(n.typeId);
      ({ title, sub } = t.summary(n.fields));
      type = t.shortName;
    } catch {
      type = n.typeId;
      title = Object.values(n.fields)[0] ?? '';
      sub = '';
    }
    const real = (answers.get(n.id) ?? []).sort((a, b) => a.at - b.at);
    const seen = cards.filter((c) => !c.hidden && !c.suspended && c.phase !== 'new');
    const last = seen.reduce<number | undefined>((t, c) => (c.lastReviewAt !== undefined && (t === undefined || c.lastReviewAt > t) ? c.lastReviewAt : t), undefined);
    rows.push(
      [
        deckName.get(n.deckId) ?? '',
        type,
        title,
        sub,
        LEVEL_TEXT[m.level],
        m.recall === undefined ? '' : Math.round(m.recall * 100),
        real.length,
        m.lapses,
        isHard(m) ? '예' : '',
        day(last),
        day(m.due),
        real
          .slice(-RECENT)
          .map((l) => RATING_TEXT[l.rating] ?? '')
          .join(' '),
        n.tags.join(' '),
      ]
        .map(cell)
        .join(','),
    );
  }
  return rows.join('\n') + '\n';
}
