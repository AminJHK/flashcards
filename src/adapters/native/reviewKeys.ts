import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type ReviewKey = 'up' | 'down' | 'undo';
interface ReviewKeysPlugin {
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
