import { ERUPTION_ECHO_MS, eruptionAt } from '../sound/reviewArcade';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type ReviewKey = 'up' | 'down' | 'undo';
interface ReviewKeysPlugin {
  vibrateCombo(options: { times: readonly number[]; eruption?: boolean }): Promise<void>;
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


export function vibrateCombo(times: readonly number[], eruption = false): void {
  if (supportsReviewKeys()) {
    void plugin.vibrateCombo({ times, eruption }).catch(() => vibrateInBrowser(times, eruption));
  } else {
    vibrateInBrowser(times, eruption);
  }
}

function vibrateInBrowser(times: readonly number[], eruption: boolean): void {
  const beats = times.map((start, i) => ({ start, duration: i % 2 ? 13 : 25 }));
  if (eruption) {
    const start = eruptionAt(times);
    beats.push({ start, duration: 78 }, { start: start + ERUPTION_ECHO_MS, duration: 58 });
  }
  let end = 0;
  const pattern = beats.flatMap(({ start, duration }) => {
    const gap = start - end;
    end = start + duration;
    return [gap, duration];
  });
  try {
    navigator.vibrate?.(pattern[0] === 0 ? pattern.slice(1) : [0, ...pattern]);
  } catch {
    // 진동을 지원하지 않는 브라우저도 있다.
  }
}
