import { getCardType } from '../../core/cardTypes/registry';
import type { Speech } from '../../core/cardTypes/types';
import type { Card, Deck, Note, Settings } from '../../core/model/types';
import { GeminiError } from '../gemini/api';
import { withTimeout } from '../net';
import { synthesize } from '../gemini/tts';
import { db } from '../storage/db';
import { speak as deviceSpeak, stopSpeaking } from '../tts/webSpeech';

/**
 * 발음 재생 순서 (docs/DESIGN.md §6)
 * 1. 저장해 둔 Gemini 음성 파일
 * 2. 없으면 Gemini로 만들어서 저장하고 재생 (인터넷 필요)
 * 3. 안 되면 기기 내장 음성
 */

export function geminiOn(s: Settings | undefined): s is Settings & { gemini: NonNullable<Settings['gemini']> } {
  return !!s?.gemini?.apiKey && s.gemini.useTts;
}

export function clipKey(item: Speech, s: Settings & { gemini: NonNullable<Settings['gemini']> }): string {
  return `${s.gemini.ttsModel}|${s.gemini.voice}|${item.lang}|${item.text}`;
}

async function clipFor(item: Speech, s: Settings & { gemini: NonNullable<Settings['gemini']> }): Promise<Blob> {
  const key = clipKey(item, s);
  const have = await db.audio.get(key);
  if (have) return have.blob;
  const blob = await synthesize(item.text, item.lang, s.gemini.voice, s.gemini.ttsModel, s.gemini.apiKey);
  await db.audio.put({ key, blob, createdAt: Date.now() });
  return blob;
}

let token = 0;
let current: HTMLAudioElement | null = null;

export function stopAll(): void {
  token++;
  current?.pause();
  current = null;
  stopSpeaking();
}

function playBlob(blob: Blob, my: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (my !== token) return resolve();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    current = a;
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    a.onended = done;
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('재생하지 못했어요'));
    };
    a.play().catch((e) => {
      URL.revokeObjectURL(url);
      reject(e);
    });
  });
}

export interface PlayResult {
  /** 실제로 쓴 음성 */
  via: 'gemini' | 'device' | 'none';
  /** Gemini가 안 돼서 기기 음성으로 바꿨을 때 그 이유 */
  error?: string;
}

export async function play(items: readonly Speech[], s: Settings | undefined): Promise<PlayResult> {
  stopAll();
  const list = items.filter((i) => i.text.trim());
  if (!list.length) return { via: 'none' };
  const my = token;
  if (geminiOn(s)) {
    try {
      for (const it of list) {
        // 처음 만드는 음성이 늦으면 기다리지 않고 기기 음성으로 읽는다 (만드는 건 계속해서 저장됨)
        const blob = await withTimeout(clipFor(it, s), 10_000, '자연스러운 음성을 만드는 데 시간이 걸려요');
        if (my !== token) return { via: 'gemini' };
        await playBlob(blob, my);
      }
      return { via: 'gemini' };
    } catch (e) {
      if (my !== token) return { via: 'gemini' };
      const ok = deviceSpeak(list, s.voices);
      return { via: ok ? 'device' : 'none', error: e instanceof Error ? e.message : undefined };
    }
  }
  return { via: deviceSpeak(list, s?.voices) ? 'device' : 'none' };
}

/** 노트 하나의 모든 카드에서 읽을 텍스트 (중복 제거) */
export function speechesOf(note: Note, cards: readonly Card[], deck: Deck): Speech[] {
  const type = getCardType(note.typeId);
  const seen = new Map<string, Speech>();
  for (const c of cards) {
    if (c.hidden) continue;
    const v = type.view(c.templateId, { fields: note.fields, deck, ttsOverride: note.ttsOverride });
    for (const it of [...v.tts.front, ...v.tts.back]) if (it.text.trim()) seen.set(`${it.lang}|${it.text}`, it);
  }
  return [...seen.values()];
}

/** 새로 만든 단어의 음성을 미리 만들어 둔다. 실패해도 조용히 넘어간다 (재생할 때 다시 시도). */
export async function prefetchNote(noteId: string, s: Settings | undefined): Promise<void> {
  if (!geminiOn(s) || !navigator.onLine) return;
  const note = await db.notes.get(noteId);
  if (!note) return;
  const [cards, deck] = await Promise.all([db.cards.where('noteId').equals(noteId).toArray(), db.decks.get(note.deckId)]);
  if (!deck) return;
  for (const it of speechesOf(note, cards, deck)) {
    try {
      await clipFor(it, s);
    } catch {
      return;
    }
  }
}

/** 아직 음성 파일이 없는 텍스트 */
export async function missingClips(s: Settings): Promise<Speech[]> {
  if (!geminiOn(s)) return [];
  const [notes, cards, decks, keys] = await Promise.all([db.notes.toArray(), db.cards.toArray(), db.decks.toArray(), db.audio.toCollection().primaryKeys()]);
  const have = new Set(keys as string[]);
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const cardsByNote = new Map<string, Card[]>();
  for (const c of cards) cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c]);
  const out = new Map<string, Speech>();
  for (const n of notes) {
    const deck = deckById.get(n.deckId);
    if (!deck) continue;
    for (const it of speechesOf(n, cardsByNote.get(n.id) ?? [], deck)) {
      const k = clipKey(it, s);
      if (!have.has(k)) out.set(k, it);
    }
  }
  return [...out.values()];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 모든 단어의 음성을 차례로 만든다. 무료 한도에 걸리면 잠깐 기다렸다가 다시 하고,
 * 그래도 안 되면 멈춘다 (만든 것까지는 저장돼 있어서 다음에 이어서 한다).
 */
export async function generateAll(
  s: Settings,
  onProgress: (done: number, total: number) => void,
  signal: { cancelled: boolean },
): Promise<{ done: number; total: number; stopped?: string }> {
  const todo = await missingClips(s);
  let done = 0;
  onProgress(0, todo.length);
  for (const it of todo) {
    if (signal.cancelled) return { done, total: todo.length };
    let tries = 0;
    for (;;) {
      try {
        await clipFor(it, s as Settings & { gemini: NonNullable<Settings['gemini']> });
        break;
      } catch (e) {
        if (e instanceof GeminiError && e.kind === 'quota' && tries++ < 2) {
          await sleep(30_000);
          continue;
        }
        return { done, total: todo.length, stopped: e instanceof Error ? e.message : '음성을 만들지 못했어요' };
      }
    }
    done++;
    onProgress(done, todo.length);
    await sleep(1_000); // 무료 한도(분당 요청 수)를 넘지 않게 천천히
  }
  return { done, total: todo.length };
}

export async function clearClips(): Promise<void> {
  await db.audio.clear();
}
