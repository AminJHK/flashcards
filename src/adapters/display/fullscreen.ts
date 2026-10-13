/**
 * 전체 화면 (위 상태 표시줄·아래 내비게이션 바 숨기기). 브라우저는 사용자가 화면을 누를 때만 허락하므로
 * 탭할 때마다 아직 전체 화면이 아니면 다시 요청한다.
 */
export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}

export function enterFullscreen(): void {
  if (!fullscreenSupported() || isFullscreen()) return;
  void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

export function exitFullscreen(): void {
  if (isFullscreen()) void document.exitFullscreen().catch(() => {});
}
