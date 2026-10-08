import type { ReactNode } from 'react';

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  large,
  label,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  large?: boolean;
  label?: string;
}) {
  return (
    <div className={`seg${large ? ' seg-lg' : ''}`} role="group" aria-label={label}>
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
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} 줄이기`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="stepper-value" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" aria-label={`${label} 늘리기`} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
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
