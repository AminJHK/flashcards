import { registerPlugin } from '@capacitor/core';

/**
 * 안드로이드 앱의 Google 권한 요청 (android/.../NativeGooglePlugin.java).
 * interactive=false면 창을 띄우지 않고, 창이 필요하면 토큰 없이 돌아온다.
 */
interface NativeGooglePlugin {
  authorize(o: { scopes: string[]; interactive?: boolean }): Promise<{ accessToken?: string; needsUi: boolean }>;
}

const NativeGoogle = registerPlugin<NativeGooglePlugin>('NativeGoogle');

export async function nativeAuthorize(scopes: string[], interactive: boolean): Promise<string | undefined> {
  const r = await NativeGoogle.authorize({ scopes, interactive });
  return r.accessToken;
}
