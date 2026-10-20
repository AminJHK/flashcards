/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// 설정 화면 맨 아래에 보이는 버전 (어떤 업데이트가 깔렸는지 확인용)
function version(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// base를 상대 경로('./')로 두면 GitHub Pages(/flashcards/)와 다른 경로 어디에 올려도 동작한다.
// 화면 이동은 해시(#/...)로 하므로 서버 설정이 필요 없다.
const APP_VERSION = version();

// 앱이 "새 버전이 있나?"를 확인할 수 있게 빌드 버전을 파일로도 내보낸다 (서비스 워커가 못 갱신해도 알 수 있다)
const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
  },
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // 서비스 워커를 직접 쓴다 (src/sw.ts): 오프라인 파일 저장 + 웹앱을 내려도 이야기·음성 만들기
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '플래시카드',
        short_name: '플래시카드',
        description: '나만의 단어 카드',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F3F4F6',
        theme_color: '#F3F4F6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
