/**
 * 앱 업데이트. 서비스 워커는 가끔 새 버전을 늦게 받는다(특히 Dock·설치 앱). 그래서 배포된 버전 번호(version.json)를
 * 직접 확인하고, 다르면 서비스 워커와 앱 파일 캐시만 지운 뒤 새로 불러온다. 덱·복습 기록(IndexedDB)은 건드리지 않는다.
 */

declare const __APP_VERSION__: string;

export const currentVersion = (): string => __APP_VERSION__;

/** 배포된 최신 버전. 개발 중이거나 확인할 수 없으면 undefined */
export async function fetchLatestVersion(): Promise<string | undefined> {
  if (__APP_VERSION__ === 'dev') return undefined;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const v = ((await res.json()) as { version?: unknown }).version;
    return typeof v === 'string' && v ? v : undefined;
  } catch {
    return undefined;
  }
}

/** 서비스 워커와 앱 파일 캐시를 지우고 새 버전으로 다시 연다. IndexedDB(덱·기록)는 그대로다. */
export async function applyUpdate(latest: string): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } catch {
    /* 지우지 못해도 아래에서 새로 불러온다 */
  }
  // 주소에 버전을 붙여서 브라우저가 예전 index.html을 쓰지 못하게 한다
  const url = new URL(location.href);
  url.searchParams.set('v', latest);
  location.replace(url.toString());
}

/** 업데이트 뒤 주소에 남은 ?v=를 지운다 */
export function cleanVersionParam(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('v')) return;
  url.searchParams.delete('v');
  history.replaceState(null, '', url.toString());
}
