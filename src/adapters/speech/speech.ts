import { getCardType } from '../../core/cardTypes/registry';
import type { Speech } from '../../core/cardTypes/types';
import type { Card, Deck, Note, Settings } from '../../core/model/types';
import { GeminiError } from '../gemini/api';
import { withTimeout } from '../net';
import { synthesize } from '../gemini/tts';
import { allModelsMessage, canSwitchTtsModel, storyTtsModels, type TtsModelState } from './modelFallback';
import { db } from '../storage/db';
import { missingVoiceLangs, speak as deviceSpeak, speakAndWait, stopSpeaking, voicesReady } from '../tts/webSpeech';

/**
 * 발음 재생 순서 (docs/DESIGN.md §6)
 * 1. 저장해 둔 Gemini 음성 파일
 * 2. 없으면 Gemini로 만들어서 저장하고 재생 (인터넷 필요)
 * 3. 안 되면 기기 내장 음성
 */

export function geminiOn(s: Settings | undefined): s is Settings & { gemini: NonNullable<Settings['gemini']> } {
  return !!s?.gemini?.apiKey && s.gemini.useTts;
}

/** 단어 카드(복습·단어 듣기)에서 Gemini 음성을 쓸지. 기본은 꺼짐: 무료 한도는 이야기 읽기에 쓰고, 카드는 기기 음성 */
export function cardGeminiOn(s: Settings | undefined): s is Settings & { gemini: NonNullable<Settings['gemini']> } {
  return geminiOn(s) && s.gemini.cardTts === true;
}

/** 음성을 만드는 글(프롬프트)을 바꾸면 올린다. 그러면 예전 방식으로 만든 음성은 쓰지 않고 새로 만든다. */
const CLIP_VERSION = 'v2';
const MODERN_CLIP_VERSION = 'v4'; // Gemini 3.8 Interactions + speech_metadata; discard old, unstyled v3 clips
const LEGACY_STORY_VERSION = 'v3-story'; // Changed conversational directions; preserve ordinary v2 card clips

export function clipKey(item: Speech, s: Settings & { gemini: NonNullable<Settings['gemini']> }): string {
  const version = s.gemini.ttsModel.includes('3.8') ? MODERN_CLIP_VERSION : item.style === 'story' ? LEGACY_STORY_VERSION : CLIP_VERSION;
  return `${version}|${s.gemini.ttsModel}|${s.gemini.voice}|${item.lang}|${item.text}${item.style ? `|style:${item.style}` : ''}`;
}

/** 예전 방식으로 만든 음성 파일(설명까지 읽어 버린 것 포함)을 지운다. */
export async function dropStaleClips(): Promise<void> {
  const keys = (await db.audio.toCollection().primaryKeys()) as string[];
  const stale = keys.filter((k) => (!k.startsWith(`${CLIP_VERSION}|`) && !k.startsWith(`${MODERN_CLIP_VERSION}|`) && !k.startsWith(`${LEGACY_STORY_VERSION}|`)) || k.startsWith('v2|gemini-3.8-'));
  if (stale.length) await db.audio.bulkDelete(stale);
}

/** 미리 만들기와 재생이 겹쳐도 같은 문장에 API를 두 번 호출하지 않는다. */
const inFlight = new Map<string, Promise<Blob>>();

/** Avoid repeatedly hitting Google's quota API after an exhausted response. Session-only; cached clips remain playable. */
const quotaPauses = new Map<string, { until: number; reason: GeminiError }>();
/** 이 키로는 쓸 수 없는 음성 모델 (404). 앱을 다시 열면 다시 시도한다 */
const unavailableTts = new Set<string>();
function quotaCooldown(error: GeminiError): number {
  // Daily limits won't be resolved by an immediate retry. An unknown 429 is treated cautiously.
  const defaultMs = error.limit === 'daily' ? 15 * 60_000 : 75_000;
  return Math.max(defaultMs, Math.min(error.retryAfterMs ?? defaultMs, 60 * 60_000));
}


async function clipFor(item: Speech, s: Settings & { gemini: NonNullable<Settings['gemini']> }): Promise<Blob> {
  const key = clipKey(item, s);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const have = await db.audio.get(key);
    if (have) return have.blob;
    const paused = quotaPauses.get(s.gemini.ttsModel);
    if (paused && Date.now() < paused.until) throw paused.reason;
    try {
      const blob = await synthesize(item.text, item.lang, s.gemini.voice, s.gemini.ttsModel, s.gemini.apiKey, item.style);
      await db.audio.put({ key, blob, createdAt: Date.now() });
      return blob;
    } catch (e) {
      if (e instanceof GeminiError && e.kind === 'quota') {
        quotaPauses.set(s.gemini.ttsModel, { until: Date.now() + quotaCooldown(e), reason: e });
      }
      throw e;
    }
  })();
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  }
}

/**
 * 이야기 음성의 분당 요청 수. 예전에는 모델마다 1분에 2번으로 스스로 막아서, 모델을 돌려 써도 8문장마다 65초씩 기다렸다.
 * 이제는 Google이 실제로 한도(429)를 알려 줄 때 그 모델만 쉬게 하고 다음 모델로 넘어간다 (quotaPauses).
 * 이 값은 같은 모델로 한꺼번에 몰리는 것만 막는 넉넉한 안전장치다.
 */
const recentStoryRequests = new Map<string, number[]>();
const STORY_RPM_SAFETY = 10;

function claimStoryRequest(model: string, now: number): boolean {
  const previous = (recentStoryRequests.get(model) ?? []).filter((at) => now - at < 60_000);
  if (previous.length >= STORY_RPM_SAFETY) {
    recentStoryRequests.set(model, previous);
    return false;
  }
  previous.push(now);
  recentStoryRequests.set(model, previous);
  return true;
}

/** 이 모델로 다시 요청할 수 있게 되는 시각 (지금 바로 되면 now) */
function storyModelFreeAt(model: string, now: number): number {
  const paused = quotaPauses.get(model);
  const pauseEnd = paused && paused.until > now ? paused.until : now;
  const recent = (recentStoryRequests.get(model) ?? []).filter((at) => now - at < 60_000);
  const slotEnd = recent.length >= STORY_RPM_SAFETY ? recent[0]! + 60_000 : now;
  return Math.max(pauseEnd, slotEnd);
}

/** 기다림 (테스트에서 바꿀 수 있게) */
export let storyWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export function setStoryWait(f: (ms: number) => Promise<void>): void {
  storyWait = f;
}

/** 테스트용 */
export function resetStoryQuota(): void {
  recentStoryRequests.clear();
  quotaPauses.clear();
  unavailableTts.clear();
}

/** First reuse any cached line from any eligible engine, then try available free engines.
 * One request succeeds at most once. Never retry bad keys, network errors or other unexpected failures.
 */
export async function storyClipFor(
  item: Speech,
  s: Settings & { gemini: NonNullable<Settings['gemini']> },
  switching: boolean,
  cachedOnly = false,
): Promise<{ blob: Blob; model: string; cached: boolean }> {
  const models = storyTtsModels(s.gemini.ttsModel, switching);
  for (const model of models) {
    const selected = { ...s, gemini: { ...s.gemini, ttsModel: model } };
    const cached = await db.audio.get(clipKey(item, selected));
    if (cached) return { blob: cached.blob, model, cached: true };
  }

  // Results/re-listen should never burn a second API request just to repeat the story.
  if (cachedOnly) throw new GeminiError('이 문장은 아직 저장된 AI 음성이 없어요. 기기 음성으로 읽을게요.', 'empty');

  let lastLimit: GeminiError | undefined;
  let delayed = false;
  /** 모델마다 왜 못 썼는지 (모두 안 되면 화면에 그대로 보여 준다) */
  const states = new Map<string, TtsModelState>();
  for (const model of models) {
    const selected = { ...s, gemini: { ...s.gemini, ttsModel: model } };
    if (unavailableTts.has(model)) {
      states.set(model, 'unavailable');
      continue;
    }
    const paused = quotaPauses.get(model);
    if (paused && Date.now() < paused.until) {
      lastLimit = paused.reason;
      states.set(model, paused.reason.limit === 'daily' ? 'daily' : 'minute');
      continue;
    }
    if (!claimStoryRequest(model, Date.now())) {
      delayed = true;
      states.set(model, 'minute');
      continue;
    }
    try {
      return { blob: await clipFor(item, selected), model, cached: false };
    } catch (e) {
      if (!switching || !canSwitchTtsModel(e)) throw e;
      if (e.kind === 'quota') {
        lastLimit = e;
        states.set(model, e.limit === 'daily' ? 'daily' : 'minute');
      } else {
        // 이 키(프로젝트)에 열려 있지 않은 모델 (404): 이번에 앱을 쓰는 동안은 다시 부르지 않는다
        unavailableTts.add(model);
        states.set(model, 'unavailable');
      }
    }
  }
  if (!delayed && !lastLimit) throw new GeminiError(models.length > 1 ? allModelsMessage(states, Date.now()) : '선택할 수 있는 Gemini 음성 모델이 없어요. 설정에서 모델을 확인해 주세요.', 'model');
  // 기다리면 풀리는 모델(한도로 쉬는 중)만 보고, 가장 먼저 풀리는 때까지만 기다린다. 못 쓰는 모델은 빼고 센다
  const now = Date.now();
  const limited = models.filter((m) => states.get(m) === 'daily' || states.get(m) === 'minute');
  const waitMs = Math.max(1_000, Math.min(...limited.map((m) => storyModelFreeAt(m, now))) - now);
  const message = models.length > 1 ? allModelsMessage(states, now) : lastLimit?.message ?? 'Gemini 음성 요청이 빠르게 이어졌어요.';
  // 5분 넘게 기다려야 하면 (오늘 한도 등) 기다리지 않는다
  if (waitMs > 5 * 60_000) throw new GeminiError(message, 'quota', 'daily');
  throw new GeminiError(message, 'quota', 'minute', waitMs);
}

/** Prepare saved story lines without playing them. Reuses model/voice-specific cached clips.
 * Sequential requests respect the same conservative per-model RPM guard as playback.
 * A quota error stops preparation; it never loops through exhausted daily quotas.
 */
export async function prepareStoryAudio(
  story: import('../../core/stories/types').Story,
  settings: Settings | undefined,
  onProgress: (done: number, total: number, stopped?: string) => void,
  cancelled: () => boolean = () => false,
): Promise<void> {
  const { roleOf, storyVoice } = await import('../../core/stories/voices');
  const lines = story.blocks.filter((b): b is import('../../core/stories/types').StoryLine => b.kind === 'line');
  const total = lines.length;
  if (!geminiOn(settings) || !navigator.onLine) {
    onProgress(0, total, 'Gemini TTS가 꺼져 있거나 오프라인이에요');
    return;
  }
  const overrides = settings.storyVoices?.[story.id] ?? {};
  onProgress(0, total);
  for (let i = 0; i < total; i++) {
    if (cancelled()) return;
    const line = lines[i]!;
    const voice = storyVoice(story, roleOf(story, line), overrides);
    const selected = { ...settings, gemini: { ...settings.gemini, voice } };
    let prepared = false;
    for (let attempt = 0; attempt < 4 && !prepared; attempt++) {
      if (cancelled()) return;
      try {
        await storyClipFor({ text: line.text, lang: story.lang, style: 'story' }, selected, settings.storyAutoModelSwitch !== false);
        prepared = true;
        onProgress(i + 1, total);
      } catch (error) {
        if (error instanceof GeminiError && error.kind === 'quota' && error.limit === 'minute' && attempt < 3) {
          // 모델을 돌려 써도 모두 분당 한도에 걸렸을 때만, 가장 먼저 풀리는 모델까지 기다린다
          const waitMs = Math.min(Math.max(1_000, error.retryAfterMs ?? 65_000), 90_000);
          onProgress(i, total, `분당 무료 한도를 기다리는 중… (${Math.ceil(waitMs / 1000)}초)`);
          await storyWait(waitMs);
          continue;
        }
        const reason = error instanceof Error ? error.message : '음성을 준비하지 못했어요';
        onProgress(i, total, reason);
        return;
      }
    }
  }
}

/** 읽기에서 다음 대사 하나만 미리 준비한다 (Gemini를 켰을 때만, 저장은 기기 안). */
export async function prefetchSpeech(item: Speech, s: Settings | undefined, voice?: string): Promise<void> {
  if (!geminiOn(s) || !navigator.onLine) return;
  const selected = voice ? { ...s, gemini: { ...s.gemini, voice } } : s;
  try {
    await clipFor(item, selected);
  } catch {
    // 재생할 때 다시 시도하거나 기기 음성을 쓴다.
  }
}

let token = 0;
let current: HTMLAudioElement | null = null;
let interruptAudio: (() => void) | undefined;

/** Change speed immediately for audio already playing; no new Gemini API call. */
export function setPlaybackRate(rate: number): void {
  if (current && Number.isFinite(rate) && rate > 0) current.playbackRate = rate;
}

export function stopAll(): void {
  token++;
  interruptAudio?.();
  current?.pause();
  current = null;
  stopSpeaking();
}

function playBlob(blob: Blob, my: number, rate = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    if (my !== token) return resolve();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    let finished = false;
    const cleanup = () => {
      if (finished) return false;
      finished = true;
      if (interruptAudio === cancel) interruptAudio = undefined;
      if (current === a) current = null;
      URL.revokeObjectURL(url);
      return true;
    };
    const cancel = () => {
      a.pause();
      if (cleanup()) resolve();
    };
    interruptAudio = cancel;
    a.onended = () => { if (cleanup()) resolve(); };
    a.onerror = () => { if (cleanup()) reject(new Error('재생하지 못했어요')); };
    a.play().catch((e) => { if (cleanup()) reject(e); });
  });
}

export interface PlayResult {
  /** 실제로 쓴 음성 */
  via: 'gemini' | 'device' | 'none';
  /** 이미 이 기기에 저장된 Gemini 음성인지 */
  cached?: boolean;
  /** 재생한 Gemini 모델 이름(키 자체는 노출하지 않음) */
  model?: string;
  /** Gemini가 안 돼서 기기 음성으로 바꿨을 때 그 이유 */
  error?: string;
  /** 기기에 음성이 없어서 읽지 못한 언어 (예: ['es-ES']) */
  missing?: string[];
}

export async function play(items: readonly Speech[], s: Settings | undefined, opts?: { timeoutMs?: number; onSource?: (result: PlayResult) => void; voice?: string; rate?: number; storyAutoModel?: boolean; cachedOnly?: boolean; awaitDevice?: boolean }): Promise<PlayResult> {
  stopAll();
  const list = items.filter((i) => i.text.trim());
  if (!list.length) return { via: 'none' };
  const my = token;
  const selected = geminiOn(s) && opts?.voice ? { ...s, gemini: { ...s.gemini, voice: opts.voice } } : s;
  // 이야기 줄은 Gemini를 켰으면 쓰고, 단어 카드는 "카드에도 Gemini" 설정을 켰을 때만 쓴다
  if (geminiOn(selected) && list.every((it) => it.style === 'story' || selected.gemini.cardTts === true)) {
    try {
      for (const it of list) {
        // 처음 만드는 음성이 늦으면 기다리지 않고 기기 음성으로 읽는다 (만드는 건 계속해서 저장됨)
        let blob: Blob;
        let usedModel = selected.gemini.ttsModel;
        let cached = false;
        if (it.style === 'story') {
          const resolved = await withTimeout(storyClipFor(it, selected, opts?.storyAutoModel !== false, opts?.cachedOnly), opts?.timeoutMs ?? 30_000, '자연스러운 음성을 만드는 데 시간이 걸려요');
          blob = resolved.blob;
          usedModel = resolved.model;
          cached = resolved.cached;
        } else {
          cached = !!(await db.audio.get(clipKey(it, selected)));
          blob = await withTimeout(clipFor(it, selected), opts?.timeoutMs ?? 10_000, '자연스러운 음성을 만드는 데 시간이 걸려요');
        }
        if (my !== token) return { via: 'gemini' };
        opts?.onSource?.({ via: 'gemini', model: usedModel, cached });
        await playBlob(blob, my, opts?.rate ?? 1);
      }
      return { via: 'gemini' };
    } catch (e) {
      if (my !== token) return { via: 'gemini' };
      await voicesReady();
      if (my !== token) return { via: 'device' };
      const result: PlayResult = { via: 'device', error: e instanceof Error ? e.message : undefined };
      if (opts?.awaitDevice && list.length === 1) {
        // Report the source before speaking and wait for playback to finish.
        opts.onSource?.(result);
        const ok = await speakAndWait(list[0]!, selected.voices, opts.rate ?? 0.9);
        return { ...result, via: ok ? 'device' : 'none', missing: ok ? undefined : missingVoiceLangs(list) };
      }
      const ok = deviceSpeak(list, selected.voices, opts?.rate ?? 0.9);
      const out: PlayResult = { ...result, via: ok ? 'device' : 'none', missing: ok ? undefined : missingVoiceLangs(list) };
      opts?.onSource?.(out);
      return out;
    }
  }
  await voicesReady();
  if (my !== token) return { via: 'device' };
  if (opts?.awaitDevice && list.length === 1) {
    opts.onSource?.({ via: 'device' });
    const ok = await speakAndWait(list[0]!, s?.voices, opts.rate ?? 0.9);
    return { via: ok ? 'device' : 'none', missing: ok ? undefined : missingVoiceLangs(list) };
  }
  const ok = deviceSpeak(list, s?.voices, opts?.rate ?? 0.9);
  const result: PlayResult = { via: ok ? 'device' : 'none', missing: ok ? undefined : missingVoiceLangs(list) };
  opts?.onSource?.(result);
  return result;
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
  if (!cardGeminiOn(s) || !navigator.onLine) return;
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
  if (!cardGeminiOn(s)) return [];
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
        // Retry only a confirmed short-term limit. Daily/unknown 429s should stop,
        // not repeat background requests that consume the user's small free quota.
        if (e instanceof GeminiError && e.kind === 'quota' && e.limit === 'minute' && tries++ < 2) {
          await sleep(Math.max(75_000, e.retryAfterMs ?? 0));
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
