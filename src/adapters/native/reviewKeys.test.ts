import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ setEnabled: vi.fn(), addListener: vi.fn(), remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => native,
}));
beforeEach(() => {
  vi.resetAllMocks();
  native.addListener.mockResolvedValue({ remove: native.remove });
  native.setEnabled.mockResolvedValue(undefined);
});

it('receives keys only after registering, and releases the native capture on exit', async () => {
  const { listenReviewKeys } = await import('./reviewKeys');
  const receive = vi.fn();
  const stop = await listenReviewKeys(receive);
  expect(native.addListener.mock.invocationCallOrder[0]!).toBeLessThan(native.setEnabled.mock.invocationCallOrder[0]!);
  native.addListener.mock.calls[0]![1]({ action: 'undo' });
  expect(receive).toHaveBeenCalledWith('undo');
  await stop();
  expect(native.setEnabled).toHaveBeenLastCalledWith({ enabled: false });
  expect(native.remove).toHaveBeenCalledOnce();
});

it('removes the listener when native activation fails', async () => {
  const { listenReviewKeys } = await import('./reviewKeys');
  native.setEnabled.mockRejectedValueOnce(new Error('unavailable'));
  await expect(listenReviewKeys(vi.fn())).rejects.toThrow('unavailable');
  expect(native.remove).toHaveBeenCalledOnce();
});

it('a delayed cleanup cannot disable a newer review subscription', async () => {
  const { listenReviewKeys } = await import('./reviewKeys');
  const old = await listenReviewKeys(vi.fn());
  const current = await listenReviewKeys(vi.fn());
  await old();
  expect(native.setEnabled).toHaveBeenLastCalledWith({ enabled: true });
  await current();
  expect(native.setEnabled).toHaveBeenLastCalledWith({ enabled: false });
});
