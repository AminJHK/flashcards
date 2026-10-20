import { registerPlugin } from '@capacitor/core';
import type { Speech } from '../../core/cardTypes/types';

/**
 * 안드로이드 앱의 음성 엔진 플러그인 (android/app/src/main/java/.../NativeTtsPlugin.java).
 * rate·pitch를 주지 않으면 휴대폰 설정(텍스트 음성 변환)의 속도·높낮이를 그대로 쓴다.
 */
export interface NativeEngine {
  name: string;
  label: string;
}
export interface NativeVoice {
  name: string;
  lang: string;
  network: boolean;
}
export interface NativeSpeakOptions {
  engine?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
}

/** 화면에 보여 줄 목소리: 같은 목소리의 "폰에 저장"·"인터넷" 판을 하나로 묶은 것 */
export interface VoiceChoice {
  /** 고르면 저장할 이름 (폰에 저장된 판이 있으면 그것: 인터넷 없이도 읽는다) */
  name: string;
  label: string;
  /** 같은 목소리로 보는 이름들 (예전에 고른 이름도 이걸로 찾는다) */
  members: string[];
}

/**
 * 엔진이 주는 목소리 이름(id-id-x-ide-local, id-id-x-ide-network …)은 알아보기 어려워서 "목소리 1, 2 …"로 보여 준다.
 * -local/-network만 다른 것은 같은 목소리로 묶고, 엔진 기본과 같은 "…-language"는 뺀다 (맨 위 "엔진 기본 목소리"와 같음).
 */
export function voiceChoices(voices: readonly NativeVoice[]): VoiceChoice[] {
  const groups = new Map<string, NativeVoice[]>();
  for (const v of voices) {
    if (/-language$/i.test(v.name)) continue;
    const base = v.name.replace(/-(local|network)$/i, '');
    groups.set(base, [...(groups.get(base) ?? []), v]);
  }
  return [...groups.keys()]
    .sort()
    .map((base, i) => {
      const list = groups.get(base)!;
      const pick = list.find((v) => !v.network) ?? list[0]!;
      return { name: pick.name, label: `목소리 ${i + 1}${pick.network ? ' · 인터넷 필요' : ''}`, members: list.map((v) => v.name) };
    });
}

interface NativeTtsPlugin {
  getEngines(): Promise<{ engines: NativeEngine[]; defaultEngine: string }>;
  getVoices(o: { engine?: string; lang: string }): Promise<{ voices: NativeVoice[] }>;
  check(o: { engine?: string; lang: string }): Promise<{ available: boolean }>;
  speak(o: NativeSpeakOptions & { text: string; lang: string; queue?: 'flush' | 'add' }): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
}

const NativeTts = registerPlugin<NativeTtsPlugin>('NativeTts');

export const nativeEngines = () => NativeTts.getEngines();
export const nativeVoices = (lang: string, engine?: string) => NativeTts.getVoices({ lang, engine }).then((r) => r.voices);

const available = new Map<string, boolean>();
/** 이 엔진이 이 언어를 읽을 수 있는지 (엔진·언어마다 한 번만 묻는다) */
export async function nativeCanSpeak(lang: string, engine?: string): Promise<boolean> {
  const key = `${engine ?? ''}|${lang}`;
  if (!available.has(key)) {
    try {
      available.set(key, (await NativeTts.check({ lang, engine })).available);
    } catch {
      return false;
    }
  }
  return available.get(key)!;
}

/** 차례대로 읽는다 (이전 소리는 멈춤). 읽을 수 없는 언어는 건너뛴다. 하나라도 건너뛰면 false. 끝날 때까지 기다리지 않는다 */
export async function nativeSpeak(items: readonly Speech[], opts: (lang: string) => NativeSpeakOptions): Promise<boolean> {
  let found = true;
  let first = true;
  for (const it of items) {
    if (!it.text) continue;
    const o = opts(it.lang);
    if (!(await nativeCanSpeak(it.lang, o.engine))) {
      found = false;
      continue;
    }
    void NativeTts.speak({ ...o, text: it.text, lang: it.lang, queue: first ? 'flush' : 'add' }).catch(() => {});
    first = false;
  }
  return found;
}

/** 한 문장을 읽고 끝날 때까지 기다린다. 멈추거나 실패하면 false */
export async function nativeSpeakAndWait(item: Speech, o: NativeSpeakOptions): Promise<boolean> {
  if (!item.text.trim() || !(await nativeCanSpeak(item.lang, o.engine))) return false;
  try {
    return (await NativeTts.speak({ ...o, text: item.text, lang: item.lang, queue: 'flush' })).ok;
  } catch {
    return false;
  }
}

export function nativeStop(): void {
  void NativeTts.stop().catch(() => {});
}

/** 읽을 수 없는 언어들 (nativeSpeak가 이미 물어본 것 기준) */
export function nativeMissing(items: readonly Speech[], engine?: string): string[] {
  return [...new Set(items.filter((i) => i.text && available.get(`${engine ?? ''}|${i.lang}`) === false).map((i) => i.lang))];
}
