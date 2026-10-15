import type { Speech } from '../../core/cardTypes/types';

/**
 * 기기 내장 음성 (Web Speech API). docs/DESIGN.md §6의 1단계.
 * 클라우드 음성은 나중에 같은 모양(speak/voicesFor)으로 다른 어댑터를 추가한다.
 */

export interface VoiceInfo {
  name: string;
  lang: string;
  local: boolean;
}

const synth = (): SpeechSynthesis | undefined => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);

export function ttsSupported(): boolean {
  return !!synth() && typeof SpeechSynthesisUtterance !== 'undefined';
}

const norm = (l: string) => l.replace('_', '-').toLowerCase();

let cached: SpeechSynthesisVoice[] = [];
function loadVoices(): SpeechSynthesisVoice[] {
  const s = synth();
  if (!s) return [];
  const v = s.getVoices();
  if (v.length) cached = v;
  return cached;
}

/** 음성 목록은 늦게 도착할 수 있다. 바뀌면 알려준다. */
export function onVoicesChanged(cb: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  const h = () => {
    loadVoices();
    cb();
  };
  s.addEventListener('voiceschanged', h);
  return () => s.removeEventListener('voiceschanged', h);
}

/** 안드로이드는 음성 목록이 늦게 도착한다. 첫 재생 전에 잠깐 기다려서, 목록이 비었다고 기본(영어) 음성으로 읽는 일을 막는다. */
export function voicesReady(timeoutMs = 1500): Promise<void> {
  const s = synth();
  if (!s || loadVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      s.removeEventListener('voiceschanged', done);
      clearTimeout(t);
      loadVoices();
      resolve();
    };
    const t = setTimeout(done, timeoutMs);
    s.addEventListener('voiceschanged', done);
  });
}

/** 같은 언어(지역까지 같은 것 먼저), 그 안에서는 기기에 저장된 음성(인터넷 없이도 나오는 것)을 먼저. */
function matching(lang: string): SpeechSynthesisVoice[] {
  const want = norm(lang);
  const all = loadVoices();
  const local = (v: SpeechSynthesisVoice) => (v.localService ? 0 : 1);
  const exact = all.filter((v) => norm(v.lang) === want).sort((a, b) => local(a) - local(b));
  const near = all.filter((v) => norm(v.lang).slice(0, 2) === want.slice(0, 2) && !exact.includes(v)).sort((a, b) => local(a) - local(b));
  return [...exact, ...near];
}

export function voicesFor(lang: string): VoiceInfo[] {
  return matching(lang).map((v) => ({ name: v.name, lang: v.lang, local: v.localService }));
}

function pickVoice(lang: string, preferred?: string): SpeechSynthesisVoice | undefined {
  const list = matching(lang);
  return list.find((v) => v.name === preferred) ?? list[0];
}

/** 이 기기에 음성이 없는 언어들. 음성 목록이 아직 안 왔으면 알 수 없으니 비워 둔다. */
export function missingVoiceLangs(items: readonly Speech[]): string[] {
  if (!ttsSupported() || !loadVoices().length) return [];
  return [...new Set(items.filter((i) => i.text && !pickVoice(i.lang)).map((i) => i.lang))];
}

/**
 * 차례대로 읽는다. 이전에 읽던 것은 멈춘다. 음성이 없으면 false.
 * 그 언어의 음성이 없는 문장은 읽지 않는다. 억지로 읽으면 기본 음성(영어)이 스페인어를 영어처럼 읽어서
 * 더 헷갈린다. 음성 목록이 아직 도착하지 않았을 때만 언어 태그를 믿고 기기에 맡긴다.
 */
export function speak(items: readonly Speech[], preferred: Record<string, string> = {}, rate = 0.9): boolean {
  const s = synth();
  if (!s || !ttsSupported()) return false;
  s.cancel();
  const known = loadVoices().length > 0;
  let found = true;
  for (const it of items) {
    if (!it.text) continue;
    const v = pickVoice(it.lang, preferred[it.lang]);
    if (!v && known) {
      found = false;
      continue;
    }
    const u = new SpeechSynthesisUtterance(it.text);
    u.lang = v?.lang ?? it.lang; // 고른 음성의 언어 태그를 같이 써야 안드로이드가 그 음성으로 읽는다
    u.rate = rate;
    if (v) u.voice = v;
    s.speak(u);
  }
  return found;
}

/** Await a single device-spoken sentence for sequential story replay.
 * Calling stopSpeaking() resolves the waiter so paused replay never hangs.
 */
let cancelWaiter: (() => void) | undefined;

export async function speakAndWait(item: Speech, preferred: Record<string, string> = {}, rate = 0.9): Promise<boolean> {
  const s = synth();
  if (!s || !ttsSupported() || !item.text.trim()) return false;
  const v = pickVoice(item.lang, preferred[item.lang]);
  if (!v && loadVoices().length) return false;
  stopSpeaking();
  return new Promise<boolean>((resolve) => {
    let finished = false;
    let timeout: ReturnType<typeof setTimeout>;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (cancelWaiter === done) cancelWaiter = undefined;
      resolve(true);
    };
    cancelWaiter = done;
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = v?.lang ?? item.lang;
    u.rate = rate;
    if (v) u.voice = v;
    u.onend = done;
    u.onerror = done;
    timeout = setTimeout(() => {
      s.cancel();
      done();
    }, Math.min(90_000, Math.max(15_000, item.text.length * 400)));
    s.speak(u);
  });
}

export function stopSpeaking(): void {
  cancelWaiter?.();
  synth()?.cancel();
}
