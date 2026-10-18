import type { Speech } from '../../core/cardTypes/types';
import type { Settings } from '../../core/model/types';
import { isNativeApp } from '../native/platform';
import { nativeMissing, nativeSpeak, nativeSpeakAndWait, nativeStop, type NativeSpeakOptions } from './nativeTts';
import { missingVoiceLangs, speak, speakAndWait, stopSpeaking, voicesReady } from './webSpeech';

/**
 * 기기 음성. 안드로이드 앱이면 음성 엔진을 직접 쓰고(엔진·목소리 선택, 휴대폰 설정의 속도·높낮이),
 * 브라우저면 Web Speech를 쓴다.
 * rate: 이 재생만의 속도 (이야기 읽기 속도). 없으면 설정의 기기 음성 속도.
 */
type Voice = Pick<Settings, 'voices' | 'deviceRate' | 'devicePitch' | 'nativeTts'> | undefined;

function nativeOptions(s: Voice, rate?: number): (lang: string) => NativeSpeakOptions {
  const n = s?.nativeTts;
  // 휴대폰 설정의 속도·높낮이를 쓰면(기본) 앱이 값을 보내지 않는다
  const own = n?.systemRatePitch === false;
  return (lang) => ({
    engine: n?.engine || undefined,
    voice: n?.voices?.[lang] || undefined,
    rate: own ? (rate ?? s?.deviceRate ?? 0.9) : undefined,
    pitch: own ? (s?.devicePitch ?? 1) : undefined,
  });
}

export async function speakDevice(items: readonly Speech[], s: Voice, rate?: number): Promise<boolean> {
  if (isNativeApp()) return nativeSpeak(items, nativeOptions(s, rate));
  await voicesReady();
  return speak(items, s?.voices, rate ?? s?.deviceRate ?? 0.9, s?.devicePitch ?? 1);
}

export async function speakDeviceAndWait(item: Speech, s: Voice, rate?: number): Promise<boolean> {
  if (isNativeApp()) return nativeSpeakAndWait(item, nativeOptions(s, rate)(item.lang));
  await voicesReady();
  return speakAndWait(item, s?.voices, rate ?? s?.deviceRate ?? 0.9, s?.devicePitch ?? 1);
}

export function missingDeviceLangs(items: readonly Speech[], s: Voice): string[] {
  return isNativeApp() ? nativeMissing(items, s?.nativeTts?.engine || undefined) : missingVoiceLangs(items, s?.voices);
}

export function stopDevice(): void {
  stopSpeaking();
  if (isNativeApp()) nativeStop();
}
