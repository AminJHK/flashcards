import { useState } from 'react';
import type { Settings } from '../core/model/types';
import { driveErrorMessage } from './driveBackup';
import { syncWithDrive } from './driveSync';
import { useToast } from './toast';

/**
 * 앱을 열 때: Google로 로그인해서 다른 기기에서 공부한 것과 합친 뒤 시작한다.
 * Google 로그인 창은 버튼을 눌러야만 열 수 있어서 (팝업 차단) 시작 화면에 버튼을 둔다.
 */
export function StartSync({ s, onDone }: { s: Settings; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const email = s.googleDrive?.email;

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await syncWithDrive({ interactive: true });
      toast(r?.hadRemote ? `불러왔어요 · 단어 ${r.notes}개` : '이 기기의 데이터를 Drive에 올렸어요');
      onDone();
    } catch (e) {
      setError(driveErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ justifyContent: 'center', gap: 20, padding: '32px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="title title-lg">플래시카드</h1>
        <span className="muted" style={{ lineHeight: 1.6 }}>
          Google로 로그인하면 다른 기기(폰·PC)에서 공부한 덱과 복습 기록을 불러와서 이어서 해요.
          {email && (
            <>
              <br />
              <span className="faint small">{email}</span>
            </>
          )}
        </span>
      </div>
      <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
        {busy ? '불러오는 중…' : 'Google로 로그인하고 시작'}
      </button>
      {error && (
        <span role="alert" style={{ color: 'var(--again)', fontSize: 14, lineHeight: 1.5 }}>
          {error}
        </span>
      )}
      <button type="button" className="btn btn-quiet" onClick={onDone} disabled={busy}>
        로그인 없이 이 기기 데이터로 시작
      </button>
      <span className="faint small" style={{ lineHeight: 1.6 }}>
        시작한 뒤에도 앱을 쓰는 동안 몇 분마다, 그리고 앱을 닫을 때 자동으로 맞춰요. 설정 › Google Drive에서 끌 수 있어요.
      </span>
    </div>
  );
}
