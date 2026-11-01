import { useEffect, useEffectEvent } from 'react';
import { listenReviewKeys, type ReviewKey } from '../adapters/native/reviewKeys';

export function useReviewKeys(enabled: boolean, onKey: (key: ReviewKey) => void, onError: () => void) {
  const key = useEffectEvent(onKey);
  const error = useEffectEvent(onError);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;
    void listenReviewKeys((action) => { if (!disposed) key(action); }).then((stop) => {
      if (disposed) void stop().catch(() => {});
      else cleanup = stop;
    }).catch(() => { if (!disposed) error(); });
    return () => {
      disposed = true;
      if (cleanup) void cleanup().catch(() => {});
    };
  }, [enabled]);
}
