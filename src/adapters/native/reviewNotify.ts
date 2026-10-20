import { registerPlugin } from '@capacitor/core';
import { getCardType } from '../../core/cardTypes/registry';
import type { Card, Rating } from '../../core/model/types';
import { DEFAULT_NOTIFY_PREFS, isShortReview, notifyText, planAlarms, type Alarm } from '../../core/notify/plan';
import { db } from '../storage/db';
import { getSettings, recordReview } from '../storage/repo';

/**
 * 안드로이드 앱의 복습 알림 (android/.../ReviewNotifyPlugin.java, ReviewReceiver.java).
 * - 앱이 FSRS-7로 계산한 알림 계획(core/notify/plan.ts)을 휴대폰에 넘기면, 휴대폰이 그 시각에 알림을 띄운다.
 * - 알림에서 [다시]·[어려움]·[알았음]을 누르면 휴대폰이 누른 시각과 함께 저장하고, 바로 앱을 깨운다:
 *   앱이 뒤에 켜져 있으면 'answers' 소식으로, 완전히 꺼져 있으면 화면 없는 WebView(headless.ts)로.
 *   앱이 답을 복습 기록에 넣고(같은 recordReview, 같은 FSRS-7) 새 계획을 다시 보낸다.
 * - 앱 화면이 보이는 동안은 알림을 모두 끄고, 앱을 내리면 다시 켠다.
 */
export interface NotifyAnswer {
  id: string;
  cardId: string;
  rating: Rating;
  at: number;
}

interface ReviewNotifyPlugin {
  schedule(o: { alarms: Alarm[] }): Promise<void>;
  clear(): Promise<void>;
  pending(): Promise<{ answers: NotifyAnswer[] }>;
  ack(o: { ids: string[] }): Promise<void>;
  permissions(): Promise<{ notifications: boolean; exact: boolean }>;
  requestNotifications(): Promise<{ notifications: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  addListener(event: 'answers', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

const Plugin = registerPlugin<ReviewNotifyPlugin>('ReviewNotify');

/** 화면 없는 WebView에서 돌 때 휴대폰이 넣어 주는 연결 (HeadlessRunner.java) */
interface HeadlessBridge {
  pending(): string;
  ack(json: string): void;
  schedule(json: string): void;
  done(): void;
}
const headless = (): HeadlessBridge | undefined => (globalThis as { FlashcardsHeadless?: HeadlessBridge }).FlashcardsHeadless;
export const isHeadless = (): boolean => !!headless();

async function pending(): Promise<NotifyAnswer[]> {
  const h = headless();
  return h ? (JSON.parse(h.pending()) as NotifyAnswer[]) : (await Plugin.pending()).answers;
}

async function ack(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const h = headless();
  if (h) h.ack(JSON.stringify(ids));
  else await Plugin.ack({ ids });
}

async function send(alarms: Alarm[]): Promise<void> {
  const h = headless();
  if (h) h.schedule(JSON.stringify(alarms));
  else await Plugin.schedule({ alarms });
}

/** 알림에서 누른 답을 누른 시각 그대로 복습 기록에 넣는다. 넣은 개수 */
export async function applyAnswers(): Promise<number> {
  const answers = (await pending()).sort((a, b) => a.at - b.at);
  const done: string[] = [];
  for (const a of answers) {
    try {
      await recordReview(a.cardId, a.rating, undefined, db, a.at);
    } catch {
      /* 그새 지운 카드 등: 버린다 */
    }
    done.push(a.id);
  }
  await ack(done);
  return done.length;
}

/** 지금 카드 상태로 알림 계획을 만든다 */
export async function currentPlan(now = Date.now()): Promise<Alarm[]> {
  const settings = await getSettings();
  // 예전에 저장한 조용한 시간은 무시한다 (기능을 없앴다)
  const prefs = { ...DEFAULT_NOTIFY_PREFS, ...settings.reviewNotify, quietStart: 0, quietEnd: 0 };
  const off = new Set(settings.reviewNotify?.offDecks ?? []);
  const cards = (await db.cards.toArray()).filter((c) => !c.hidden && !c.suspended && c.phase !== 'new' && !off.has(c.deckId));
  const short = cards.filter(isShortReview);
  const [notes, decks] = await Promise.all([db.notes.bulkGet([...new Set(short.map((c) => c.noteId))]), db.decks.toArray()]);
  const noteById = new Map(notes.flatMap((n) => (n ? [[n.id, n] as const] : [])));
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const textFor = (c: Card) => {
    const note = noteById.get(c.noteId);
    const deck = deckById.get(c.deckId);
    if (!note || !deck) return undefined;
    try {
      return notifyText(getCardType(note.typeId).view(c.templateId, { fields: note.fields, deck, ttsOverride: note.ttsOverride }));
    } catch {
      return undefined;
    }
  };
  return planAlarms({ cards, textFor, now, tzOffsetMin: -new Date(now).getTimezoneOffset(), prefs });
}

/** 마지막으로 보낸 계획 (설정 화면의 확인용 줄). 이 기기에만 */
export interface LastSchedule {
  at: number;
  count: number;
  next?: number;
  error?: string;
}
const LAST_KEY = 'reviewNotifyLast';
export function lastSchedule(): LastSchedule | undefined {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? (JSON.parse(v) as LastSchedule) : undefined;
  } catch {
    return undefined;
  }
}
function remember(v: LastSchedule): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    /* 확인용일 뿐 */
  }
}

/** 알림 예약 (알림을 꺼 두었으면 모두 지운다) */
export async function scheduleAlarms(): Promise<void> {
  const s = await getSettings();
  const plan = s.reviewNotify?.enabled ? await currentPlan() : [];
  try {
    await send(plan);
    remember({ at: Date.now(), count: plan.length, next: plan[0]?.at });
  } catch (e) {
    remember({ at: Date.now(), count: plan.length, next: plan[0]?.at, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** 앱 화면이 보이는 동안: 예약과 떠 있는 복습 알림을 모두 끈다 */
export async function clearAlarms(): Promise<void> {
  if (!headless()) await Plugin.clear();
}

export function headlessDone(): void {
  headless()?.done();
}

export const notifyPermissions = () => Plugin.permissions();
export const requestNotifyPermission = () => Plugin.requestNotifications();
export const openExactAlarmSettings = () => Plugin.openExactAlarmSettings();

/** 앱이 뒤에 켜져 있을 때 알림에서 답하면 오는 소식 */
export function onNotifyAnswers(fn: () => void): () => void {
  let remove: (() => Promise<void>) | undefined;
  void Plugin.addListener('answers', fn).then((h) => (remove = h.remove));
  return () => void remove?.();
}
