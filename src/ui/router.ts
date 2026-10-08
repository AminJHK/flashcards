import { useEffect, useState } from 'react';

/** 해시 라우팅 (#/review, #/decks/abc). 안드로이드 뒤로 가기 버튼이 그대로 동작한다. */
export function useRoute(): string[] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const h = () => setHash(window.location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function go(path: string, opts: { replace?: boolean } = {}): void {
  const target = `#/${path.replace(/^\//, '')}`;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = target;
}
