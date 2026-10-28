/**
 * 안드로이드 뒤로 가기 버튼 (MainActivity.java가 눌릴 때마다 window.__flashcardsBack()을 불러 본다).
 * 열려 있는 창(확인창·단어 창·메뉴 등)이 있으면 맨 위의 것을 닫고 true를 돌려준다 (그러면 화면은 그대로).
 * 창이 없으면 false: 안드로이드가 웹뷰의 앞 화면(해시 주소 기록)으로 돌아가고, 더 갈 곳이 없으면 앱이 뒤로 물러난다.
 * 모든 창의 바깥(.dialog-backdrop)을 누르면 닫히므로, 바깥을 누르는 것과 같게 처리한다.
 */
export function handleNativeBack(): boolean {
  const open = document.querySelectorAll<HTMLElement>('.dialog-backdrop');
  const top = open[open.length - 1];
  if (!top) return false;
  top.click();
  return true;
}

declare global {
  interface Window {
    __flashcardsBack?: () => boolean;
  }
}

export function installNativeBack(): void {
  window.__flashcardsBack = handleNativeBack;
}
