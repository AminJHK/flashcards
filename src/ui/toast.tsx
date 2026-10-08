import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastState {
  msg: string;
  undo?: () => void;
}

const Ctx = createContext<(msg: string, undo?: () => void) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children, high }: { children: ReactNode; high: boolean }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((msg: string, undo?: () => void) => {
    clearTimeout(timer.current);
    setToast({ msg, undo });
    timer.current = setTimeout(() => setToast(null), undo ? 4500 : 2400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">
        {toast && (
          <div className={`toast${high ? ' toast-high' : ''}`}>
            <span style={{ flex: 1 }}>{toast.msg}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                되돌리기
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
