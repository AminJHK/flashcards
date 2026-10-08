/**
 * Google 로그인 (Google Identity Services, 토큰 방식). 서버 없이 이 기기에서만 동작한다.
 * 사용자가 만든 OAuth 클라이언트 ID가 필요하다 (설정 화면 안내). 토큰은 메모리에만 두고 저장하지 않는다.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

import { withTimeout } from '../net';

export class GoogleAuthError extends Error {}

let gisLoading: Promise<Gis> | undefined;

function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new GoogleAuthError('Google 로그인을 불러오지 못했어요')));
    s.onerror = () => {
      gisLoading = undefined;
      reject(new GoogleAuthError('Google 로그인을 불러오지 못했어요. 인터넷 연결을 확인해 주세요'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

let cached: { clientId: string; token: string; expiresAt: number } | undefined;

/**
 * 액세스 토큰을 받는다. 처음에는 Google 로그인·동의 창이 뜨고, 그 뒤로는 창이 잠깐 떴다 사라진다.
 * 반드시 버튼을 누른 직후에 불러야 한다 (팝업 차단 방지).
 */
export async function getAccessToken(clientId: string, opts: { forceConsent?: boolean } = {}): Promise<string> {
  if (!opts.forceConsent && cached && cached.clientId === clientId && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const gis = await withTimeout(loadGis(), 15_000, 'Google 로그인을 불러오지 못했어요. 인터넷 연결을 확인해 주세요');
  const token = new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new GoogleAuthError(r.error === 'access_denied' ? 'Google 로그인을 취소했어요' : `Google 로그인 실패 (${r.error ?? '토큰 없음'})`));
          return;
        }
        cached = { clientId, token: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(new GoogleAuthError(e.type === 'popup_closed' ? 'Google 로그인 창이 닫혔어요' : e.type === 'popup_failed_to_open' ? '팝업이 막혔어요. 브라우저에서 팝업을 허용해 주세요' : 'Google 로그인에 실패했어요')),
    });
    client.requestAccessToken({ prompt: opts.forceConsent ? 'consent' : '' });
  });
  return withTimeout(token, 180_000, 'Google 로그인이 끝나지 않았어요. 다시 시도해 주세요');
}

export function forgetToken(): void {
  if (cached && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(cached.token);
  cached = undefined;
}

export function clearTokenCache(): void {
  cached = undefined;
}
