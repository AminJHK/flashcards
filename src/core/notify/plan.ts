import type { Block, CardView } from '../cardTypes/types';
import type { Card, Millis } from '../model/types';

/**
 * 복습 알림 계획 (안드로이드 앱, 사용자 요청 2026-10-20).
 * - 짧은 복습(직전 복습에서 하루가 안 되는 간격: 1분·10분 뒤 등)은 카드마다 그 시각에 알림 → 알림에서 바로 답한다.
 * - 며칠 간격의 복습은 카드가 쌓이면 한 번에 알린다 (pileMin장 이상, 최소 pileGapH시간 간격, 하루 pileMaxPerDay번까지).
 * - 조용한 시간(quietStart~quietEnd, 휴대폰 시각)에는 울리지 않고 끝나는 시각으로 미룬다.
 * 계산은 앱이 하고(FSRS-7이 정한 due), 휴대폰은 받은 시각에 울리기만 한다. 답하면 앱이 다시 계산해서 새 계획을 보낸다.
 */
export interface NotifyPrefs {
  /** 조용한 시간 시작·끝 (시, 0~23). 같으면 조용한 시간 없음 */
  quietStart: number;
  quietEnd: number;
  pileMin: number;
  pileGapH: number;
  pileMaxPerDay: number;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { quietStart: 22, quietEnd: 8, pileMin: 10, pileGapH: 3, pileMaxPerDay: 4 };

export interface CardAlarm {
  id: string;
  kind: 'card';
  at: Millis;
  cardId: string;
  front: string;
  back: string;
}
export interface PileAlarm {
  id: string;
  kind: 'pile';
  at: Millis;
  count: number;
}
export type Alarm = CardAlarm | PileAlarm;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 카드 알림은 많아도 이만큼만 (가장 이른 것부터) */
const MAX_CARD_ALARMS = 30;
/** 쌓임 알림은 며칠 앞까지 */
const PILE_DAYS = 7;

/** 짧은 복습 카드: 본 적 있고, 직전 복습에서 다음 복습까지 하루가 안 된다 */
export function isShortReview(c: Card): boolean {
  if (c.hidden || c.suspended || c.phase === 'new' || c.lastReviewAt === undefined) return false;
  return c.due - c.lastReviewAt < DAY;
}

/** tzOffsetMin: 휴대폰 시각 = UTC + 이 값(분). 예: 시드니 여름 +660 */
function localHour(t: Millis, tzOffsetMin: number): number {
  return new Date(t + tzOffsetMin * MIN).getUTCHours();
}

function inQuiet(t: Millis, p: NotifyPrefs, tz: number): boolean {
  if (p.quietStart === p.quietEnd) return false;
  const h = localHour(t, tz);
  return p.quietStart < p.quietEnd ? h >= p.quietStart && h < p.quietEnd : h >= p.quietStart || h < p.quietEnd;
}

/** 조용한 시간이면 끝나는 시각(정각)으로 미룬다 */
export function outOfQuiet(t: Millis, p: NotifyPrefs, tz: number): Millis {
  if (!inQuiet(t, p, tz)) return t;
  const local = new Date(t + tz * MIN);
  let end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), p.quietEnd) - tz * MIN;
  if (end <= t) end += DAY;
  return end;
}

const TEXT_KINDS = new Set<Block['kind']>(['hanzi', 'word', 'meaning', 'sentence', 'prompt', 'pinyin', 'gloss']);

function textOf(blocks: readonly Block[], skip: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (!TEXT_KINDS.has(b.kind) || !('text' in b)) continue;
    const t = b.text.trim();
    if (t && !skip.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 알림에 쓸 앞면·뒷면 글자. 듣기 카드(앞면이 소리)는 알림으로 못 하므로 undefined */
export function notifyText(view: CardView): { front: string; back: string } | undefined {
  if (view.front.some((b) => b.kind === 'listen')) return undefined;
  const front = textOf(view.front);
  if (!front.length) return undefined;
  const back = textOf(view.back, new Set(front));
  return { front: clip(front.join(' · '), 120), back: clip(back.join('\n'), 400) || '(뒷면 없음)' };
}

export function planAlarms(input: {
  cards: readonly Card[];
  /** 카드 알림에 쓸 글자. 없으면 그 카드는 카드 알림 대신 쌓임 알림에 센다 */
  textFor: (c: Card) => { front: string; back: string } | undefined;
  now: Millis;
  tzOffsetMin: number;
  prefs?: NotifyPrefs;
}): Alarm[] {
  const p = input.prefs ?? DEFAULT_NOTIFY_PREFS;
  const { now, tzOffsetMin: tz } = input;
  const alarms: Alarm[] = [];
  const pile: Millis[] = [];
  const short = input.cards
    .filter((c) => isShortReview(c) && c.due < now + DAY)
    .sort((a, b) => a.due - b.due);
  let cardCount = 0;
  for (const c of short) {
    const text = cardCount < MAX_CARD_ALARMS ? input.textFor(c) : undefined;
    if (!text) {
      pile.push(c.due);
      continue;
    }
    cardCount++;
    // 이미 지난 카드는 바로(몇 초 뒤) 알린다
    alarms.push({ id: `card:${c.id}`, kind: 'card', at: outOfQuiet(Math.max(c.due, now + 5_000), p, tz), cardId: c.id, ...text });
  }
  for (const c of input.cards) {
    if (c.hidden || c.suspended || c.phase === 'new' || isShortReview(c)) continue;
    pile.push(c.due);
  }
  pile.sort((a, b) => a - b);
  // 쌓임 알림: 앱을 막 닫았을 때는 바로 울리지 않는다 (방금 본 셈)
  let last = now;
  const perDay = new Map<number, number>();
  let i = 0;
  let due = 0;
  const horizon = now + PILE_DAYS * DAY;
  for (let t = now + p.pileGapH * HOUR; t <= horizon; ) {
    t = outOfQuiet(t, p, tz);
    while (i < pile.length && pile[i]! <= t) {
      i++;
      due++;
    }
    const day = Math.floor((t + tz * MIN) / DAY);
    if (due >= p.pileMin && t - last >= p.pileGapH * HOUR && (perDay.get(day) ?? 0) < p.pileMaxPerDay) {
      alarms.push({ id: `pile:${t}`, kind: 'pile', at: t, count: due });
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      last = t;
      t += p.pileGapH * HOUR;
      continue;
    }
    // 다음으로 볼 시각: 다음 카드가 due가 되는 때 (그동안 개수가 안 바뀐다), 이미 넘었으면 간격만큼 뒤
    const next = i < pile.length ? pile[i]! : horizon + 1;
    t = due >= p.pileMin ? Math.max(t + MIN, last + p.pileGapH * HOUR) : Math.max(next, t + MIN);
  }
  return alarms.sort((a, b) => a.at - b.at);
}
