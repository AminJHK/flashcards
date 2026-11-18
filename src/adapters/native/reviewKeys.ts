import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type ReviewKey = 'up' | 'down' | 'undo';
interface ReviewKeysPlugin {
  vibrateCombo(options: { times: readonly number[] }): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  addListener(event: 'key', callback: (event: { action: ReviewKey }) => void): Promise<PluginListenerHandle>;
}
const plugin = registerPlugin<ReviewKeysPlugin>('ReviewKeys');
export const supportsReviewKeys = () => Capacitor.isPluginAvailable('ReviewKeys');

let lease = 0;

/** Register before capturing keys; old APKs must keep their ordinary volume controls. */
export async function listenReviewKeys(callback: (key: ReviewKey) => void): Promise<() => Promise<void>> {
  const current = ++lease;
  const listener = await plugin.addListener('key', ({ action }) => callback(action));
  try {
    if (current === lease) await plugin.setEnabled({ enabled: true });
  } catch (error) {
    await listener.remove();
    throw error;
  }
  return async () => {
    if (current === lease) await plugin.setEnabled({ enabled: false });
    await listener.remove();
  };
}


export function vibrateCombo(times: readonly number[]): void {
  if (supportsReviewKeys()) {
    void plugin.vibrateCombo({ times }).catch(() => vibrateInBrowser(times));
  } else {
    vibrateInBrowser(times);
  }
}

function vibrateInBrowser(times: readonly number[]): void {
  const duration = 28;
  const pattern = times.flatMap((time, i) => [time - (i ? times[i - 1]! + duration : 0), duration]);
  try {
    navigator.vibrate?.(pattern[0] === 0 ? pattern.slice(1) : [0, ...pattern]);
  } catch {
    // 일부 브라우저는 진동이 지원되지 않는다.
  }
}
