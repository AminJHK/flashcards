import { useEffect } from 'react';
import { activationUsedRecently } from '../adapters/activation';
import { peekToken } from '../adapters/google/auth';
import { driveErrorMessage } from './driveBackup';
import { syncWithDrive } from './driveSync';
import { useToast } from './toast';

/**
 * 앱을 연 뒤 화면을 처음 누를 때 Google에 로그인해서 다른 기기와 맞춘다.
 * 서버 없는 앱은 Google 로그인을 오래 유지할 수 없고(토큰 1시간, 메모리에만), 로그인 창은 누를 때만 열 수 있다.
 * 그래서 시작 화면으로 막지 않고, 처음 누른 동작은 그대로 하면서 뒤에서 로그인 창을 잠깐 띄운다
 * (한 번 허락한 계정이면 창이 떴다가 바로 닫힌다). 앱을 다시 열거나, 오래 뒤로 갔다 오면 다시 한 번.
 */
export function FirstTapSync({ clientId }: { clientId: string }) {
  const toast = useToast();
  useEffect(() => {
    let armed = true;
    const onTap = () => {
      if (!armed) return;
      // 버튼이 할 일(파일 고르기, 로그인 창)을 먼저 하게 클릭 처리가 끝난 뒤에 본다
      setTimeout(() => {
        if (!armed) return;
        // 그 버튼이 직접 창을 열었으면 이번 탭은 양보한다 (다음 탭에서)
        if (activationUsedRecently()) return;
        armed = false;
        const interactive = !peekToken(clientId);
        syncWithDrive({ interactive })
          .then((r) => {
            if (interactive && r) toast(r.hadRemote ? '다른 기기와 맞췄어요' : '이 기기의 데이터를 Drive에 올렸어요');
          })
          .catch((e: unknown) => {
            armed = true; // 실패하면 다음 탭에서 다시
            const msg = driveErrorMessage(e);
            if (!/취소|닫혔/.test(msg)) toast(`동기화하지 못했어요 · ${msg}`);
          });
      }, 0);
    };
    // 오래 뒤로 갔다 오면(토큰이 끝났으면) 다시 한 번 맞춘다
    const onShow = () => {
      if (document.visibilityState === 'visible' && !peekToken(clientId)) armed = true;
    };
    window.addEventListener('click', onTap);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      armed = false;
      window.removeEventListener('click', onTap);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [clientId, toast]);
  return null;
}
