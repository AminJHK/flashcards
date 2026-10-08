import { Component, useEffect, useState, type ReactNode } from 'react';

/**
 * 앱 안에서 그리는 확인 창. window.confirm은 홈 화면에 설치한 앱(삼성 인터넷 등)에서
 * 막히거나 아무 반응이 없을 때가 있어서 쓰지 않는다.
 */
interface Ask {
  message: string;
  ok: string;
  resolve: (v: boolean) => void;
}

let show: ((a: Ask) => void) | undefined;

export function ask(message: string, ok = '확인'): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(false);
    show({ message, ok, resolve });
  });
}

export function ConfirmHost() {
  const [cur, setCur] = useState<Ask>();
  useEffect(() => {
    show = (a) =>
      setCur((prev) => {
        prev?.resolve(false);
        return a;
      });
    return () => {
      show = undefined;
    };
  }, []);
  if (!cur) return null;
  const done = (v: boolean) => {
    cur.resolve(v);
    setCur(undefined);
  };
  return (
    <div className="dialog-backdrop" onClick={() => done(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={cur.message} onClick={(e) => e.stopPropagation()}>
        <p className="dialog-msg">{cur.message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-plain" onClick={() => done(false)}>
            취소
          </button>
          <button type="button" className="btn btn-primary" onClick={() => done(true)} autoFocus>
            {cur.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 화면 하나가 오류로 멈춰도 앱 전체가 하얗게 굳지 않게 한다. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error?: Error; key: string }> {
  state: { error?: Error; key: string } = { key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { error?: Error; key: string }) {
    return p.resetKey !== s.key ? { error: undefined, key: p.resetKey } : null;
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>화면에 문제가 생겼어요</h1>
        <p className="muted" style={{ margin: 0 }}>
          데이터는 안전해요. 다시 불러오면 대부분 해결돼요.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 12, wordBreak: 'break-all' }}>
          {this.state.error.message}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          다시 불러오기
        </button>
      </div>
    );
  }
}
