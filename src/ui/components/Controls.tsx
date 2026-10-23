import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  large,
  wrap,
  label,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  large?: boolean;
  /** 고를 것이 많으면 여러 줄로 */
  wrap?: boolean;
  label?: string;
}) {
  return (
    <div className={`seg${large ? ' seg-lg' : ''}${wrap ? ' seg-wrap' : ''}`} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  label,
  typeable,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
  /** 가운데 숫자를 눌러 직접 입력할 수 있게 한다 (범위 밖이면 min~max로 맞춘다) */
  typeable?: boolean;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} 줄이기`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      {typeable ? (
        <NumberInput label={label} value={value} min={min} max={max} onChange={onChange} />
      ) : (
        <span className="stepper-value" aria-live="polite">
          {format(value)}
        </span>
      )}
      <button type="button" aria-label={`${label} 늘리기`} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const latest = useRef({ value, onChange, min, max });
  latest.current = { value, onChange, min, max };
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);
  /** 입력한 숫자를 저장한다. 확인(엔터)을 누르지 않고 뒤로 가거나 화면을 옮겨도 저장되게, 입력하는 동안에도 잠깐 뒤에 저장한다 */
  const save = (text: string) => {
    clearTimeout(pending.current);
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) return;
    const { value: cur, onChange: change, min: lo, max: hi } = latest.current;
    const v = Math.min(hi, Math.max(lo, n));
    if (v !== cur) change(v);
  };
  // 화면을 떠날 때 아직 저장하지 않은 숫자가 있으면 저장한다
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => () => {
    if (pending.current !== undefined) save(draftRef.current);
  }, []);
  return (
    <input
      className="stepper-value stepper-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const text = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
        setDraft(text);
        clearTimeout(pending.current);
        pending.current = setTimeout(() => {
          pending.current = undefined;
          save(text);
        }, 400);
      }}
      onBlur={() => {
        focused.current = false;
        pending.current = undefined;
        save(draft);
        const n = parseInt(draft, 10);
        setDraft(String(Number.isNaN(n) ? value : Math.min(max, Math.max(min, n))));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

export function Row({ title, desc, children, col }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; col?: boolean }) {
  if (col) {
    return (
      <div className="row row-col">
        <span className="row-title">{title}</span>
        {desc && <span className="row-desc">{desc}</span>}
        {children}
      </div>
    );
  }
  return (
    <div className="row">
      <span className="row-text">
        <span className="row-title">{title}</span>
        {desc && <span className="row-desc">{desc}</span>}
      </span>
      {children}
    </div>
  );
}
