import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleNativeBack, installNativeBack } from './back';

/** DOM 없이: 열려 있는 창(.dialog-backdrop)만 흉내 낸다 */
const openWindows = (...clicks: (() => void)[]) => vi.stubGlobal('document', { querySelectorAll: () => clicks.map((click) => ({ click })) });

afterEach(() => vi.unstubAllGlobals());

describe('안드로이드 뒤로 가기', () => {
  it('열린 창이 없으면 false (안드로이드가 앞 화면으로 돌아간다)', () => {
    openWindows();
    expect(handleNativeBack()).toBe(false);
  });

  it('열린 창이 있으면 맨 위의 창만 닫고 true', () => {
    const closeSheet = vi.fn();
    const closeConfirm = vi.fn();
    openWindows(closeSheet, closeConfirm);
    expect(handleNativeBack()).toBe(true);
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();
  });

  it('앱이 켜질 때 window에 연결한다', () => {
    const win: { __flashcardsBack?: () => boolean } = {};
    vi.stubGlobal('window', win);
    openWindows();
    installNativeBack();
    expect(win.__flashcardsBack?.()).toBe(false);
  });
});
