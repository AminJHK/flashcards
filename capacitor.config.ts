import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드 앱 (docs/DESIGN.md D1: PWA를 Capacitor로 감싼다).
 * 앱은 배포된 웹앱(GitHub Pages)을 그대로 불러온다. 그래서 화면·기능 업데이트는 웹처럼 자동으로 들어오고,
 * 안드로이드 쪽 기능(음성 엔진 등)을 바꿀 때만 새 APK가 필요하다.
 * 인터넷이 없어서 처음 화면을 못 불러오면 앱 안의 offline.html을 보여 준다.
 */
const config: CapacitorConfig = {
  appId: 'io.github.aminjhk.flashcards',
  appName: '단어 카드',
  webDir: 'android-web',
  server: {
    url: 'https://aminjhk.github.io/flashcards/',
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
