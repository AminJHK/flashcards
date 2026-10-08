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

function matching(lang: string): SpeechSynthesisVoice[] {
  const want = norm(lang);
  const all = loadVoices();
  const exact = all.filter((v) => norm(v.lang) === want);
  const near = all.filter((v) => norm(v.lang).slice(0, 2) === want.slice(0, 2) && !exact.includes(v));
  return [...exact, ...near];
}

export function voicesFor(lang: string): VoiceInfo[] {
  return matching(lang).map((v) => ({ name: v.name, lang: v.lang, local: v.localService }));
}

function pickVoice(lang: string, preferred?: string): SpeechSynthesisVoice | undefined {
  const list = matching(lang);
  return list.find((v) => v.name === preferred) ?? list[0];
}

/** 차례대로 읽는다. 이전에 읽던 것은 멈춘다. 음성이 없으면 false. */
export function speak(items: readonly Speech[], preferred: Record<string, string> = {}, rate = 0.9): boolean {
  const s = synth();
  if (!s || !ttsSupported()) return false;
  s.cancel();
  let found = true;
  for (const it of items) {
    if (!it.text) continue;
    const u = new SpeechSynthesisUtterance(it.text);
    u.lang = it.lang;
    u.rate = rate;
    const v = pickVoice(it.lang, preferred[it.lang]);
    if (v) u.voice = v;
    else found = false;
    s.speak(u);
  }
  return found;
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
