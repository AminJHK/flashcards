import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/noto-serif-sc/500.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-ext-400.css';
import '@fontsource/noto-sans/latin-500.css';
import '@fontsource/noto-sans/latin-ext-500.css';
import './ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { applyCachedTheme } from './ui/theme';

applyCachedTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 오프라인 사용을 위한 서비스 워커. 미리보기처럼 등록할 수 없는 곳에서는 조용히 넘어간다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        // 앱을 다시 열 때마다 새 버전이 있는지 확인한다 (있으면 받아서 자동으로 새로 고침)
        onRegisteredSW(_url, reg) {
          if (!reg) return;
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void reg.update().catch(() => {});
          });
        },
      }),
    )
    .catch(() => {});
}
