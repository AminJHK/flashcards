/** 응답이 없으면 정해진 시간 뒤에 포기한다. 느린 네트워크에서 버튼이 "확인 중…"으로 멈추지 않게. */
export class TimeoutError extends Error {}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 20_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new TimeoutError(`응답이 너무 늦어요 (${Math.round(ms / 1000)}초). 인터넷 연결을 확인하고 다시 시도해 주세요`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 약속(Promise)에 시간 제한을 건다. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
