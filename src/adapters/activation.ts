/**
 * 브라우저는 "사용자가 방금 누름" 허가가 있을 때만 팝업·파일 고르기 창을 연다. 허가는 한 번 쓰면 사라질 수 있다.
 * 버튼이 직접 그런 창을 열었는지 기록해서, 같은 탭에서 다른 기능(자동 동기화)이 또 창을 열지 않게 한다.
 */
let usedAt = 0;

export function markActivationUsed(): void {
  usedAt = Date.now();
}

export function activationUsedRecently(ms = 1500): boolean {
  return Date.now() - usedAt < ms;
}
