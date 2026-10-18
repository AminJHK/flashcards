import { Capacitor } from '@capacitor/core';

/** 안드로이드 앱(Capacitor) 안에서 돌고 있는지. 브라우저·PWA에서는 false */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
