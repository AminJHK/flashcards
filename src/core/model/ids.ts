import type { Id } from './types';

export function newId(): Id {
  return globalThis.crypto.randomUUID();
}
