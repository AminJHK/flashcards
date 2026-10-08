import { useEffect, useRef, useState } from 'react';

const BARS = 28;

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 듣는 중 표시: 소리 크기에 따라 움직이는 막대 + 녹음 시간.
 * level()이 -1이면 소리 크기를 모르는 경우(기기 음성 인식)라 부드럽게 움직이는 막대를 보여준다.
 */
export function VoiceMeter({ level, startedAt, maxMs, partial }: { level: () => number; startedAt: number; maxMs: number; partial?: string }) {
  const [heights, setHeights] = useState<number[]>(() => new Array(BARS).fill(0.08));
  const [now, setNow] = useState(() => Date.now());
  const history = useRef<number[]>(new Array(BARS).fill(0.08));

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 60) return; // 초당 약 16번이면 충분
      last = t;
      const l = level();
      const v = l < 0 ? 0.25 + 0.2 * Math.sin(t / 180) + Math.random() * 0.25 : Math.max(0.08, Math.min(1, l * 1.6));
      history.current = [...history.current.slice(1), v];
      setHeights(history.current);
      setNow(Date.now());
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);

  const elapsed = now - startedAt;
  const left = maxMs - elapsed;
  return (
    <div className="voice-meter" role="status" aria-label={`듣고 있어요 ${fmt(elapsed)}`}>
      <div className="voice-bars" aria-hidden="true">
        {heights.map((h, i) => (
          <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </div>
      <div className="voice-info">
        <span className="voice-dot" aria-hidden="true" />
        <span>{fmt(elapsed)}</span>
        <span className="faint">/ {fmt(maxMs)}</span>
        <span className="faint" style={{ marginLeft: 'auto' }}>
          {left < 10_000 ? `${Math.ceil(left / 1000)}초 뒤 자동으로 끝나요` : '다 말했으면 ■ 누르기'}
        </span>
      </div>
      {partial !== undefined && partial !== '' && (
        <span className="voice-partial" lang="zh-CN">
          {partial}
        </span>
      )}
    </div>
  );
}
