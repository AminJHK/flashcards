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
        login_hint?: string;
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

import { markActivationUsed } from '../activation';
import { isNativeApp } from '../native/platform';
import { nativeAuthorize } from './nativeGoogle';
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
export async function getAccessToken(clientId: string, opts: { forceConsent?: boolean; email?: string } = {}): Promise<string> {
  if (!opts.forceConsent && cached && cached.clientId === clientId && cached.expiresAt > Date.now() + 60_000) return cached.token;
  // 안드로이드 앱 안 브라우저(WebView)에서는 Google이 로그인 창을 막는다 → 안드로이드의 Google 계정 권한 요청을 쓴다
  if (isNativeApp()) return nativeToken(clientId, true);
  const gis = await withTimeout(loadGis(), 15_000, 'Google 로그인을 불러오지 못했어요. 인터넷 연결을 확인해 주세요');
  const token = new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      // 전에 로그인한 계정이면 계정 고르기 화면을 건너뛴다
      ...(opts.email ? { login_hint: opts.email } : {}),
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
    markActivationUsed();
    client.requestAccessToken({ prompt: opts.forceConsent ? 'consent' : '' });
  });
  return withTimeout(token, 180_000, 'Google 로그인이 끝나지 않았어요. 다시 시도해 주세요');
}

const NATIVE_SCOPES = DRIVE_SCOPE.split(' ');

async function nativeToken(clientId: string, interactive: boolean): Promise<string> {
  let token: string | undefined;
  try {
    token = await nativeAuthorize(NATIVE_SCOPES, interactive);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    throw new GoogleAuthError(/취소|cancel/i.test(msg) ? 'Google 로그인을 취소했어요' : `Google 로그인에 실패했어요${msg ? ` (${msg})` : ''}`);
  }
  if (!token) throw new GoogleAuthError('Google 로그인이 필요해요');
  // 안드로이드가 주는 토큰도 1시간짜리. 만료 시각은 알려 주지 않아서 50분으로 잡는다
  cached = { clientId, token, expiresAt: Date.now() + 50 * 60_000 };
  return token;
}

/**
 * 창 없이 받을 수 있는 토큰 (자동 동기화용). 브라우저는 받아 둔 토큰만,
 * 안드로이드 앱은 한 번 허용했으면 창 없이 새 토큰을 받는다.
 */
export async function silentToken(clientId: string): Promise<string | undefined> {
  const t = peekToken(clientId);
  if (t || !isNativeApp()) return t;
  try {
    return await nativeToken(clientId, false);
  } catch {
    return undefined;
  }
}

/** 로그인 창 없이 쓸 수 있는 토큰이 지금 있으면 돌려준다 (자동 동기화용) */
export function peekToken(clientId: string): string | undefined {
  return cached && cached.clientId === clientId && cached.expiresAt > Date.now() + 60_000 ? cached.token : undefined;
}

export function forgetToken(): void {
  if (cached && !isNativeApp() && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(cached.token);
  cached = undefined;
}

export function clearTokenCache(): void {
  cached = undefined;
}
