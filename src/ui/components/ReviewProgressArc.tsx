import { useEffect, useRef } from 'react';

const SWEEP_MS = 1500;

type ElectricLevel = 'off' | 'blue' | 'violet';

interface EdgePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * 진짜 번개처럼 꺾이는 굵은 전류가 진행 바의 타원형 테두리를 한 바퀴 따라간다.
 * CSS 그라디언트를 옆으로 움직이는 대신 캔버스에 매 프레임 지그재그 경로를 그린다.
 * Android 배터리를 아끼려고 1.5초만 재생하고 다음 파동까지 프레임을 쉬게 한다.
 */
export function ReviewProgressArc({ level }: { level: ElectricLevel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (level === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const color = styles.getPropertyValue(level === 'violet' ? '--lightning-violet' : '--lightning-blue').trim() ||
      (level === 'violet' ? '#b67bff' : '#42c5ff');
    const white = styles.getPropertyValue('--lightning-bright').trim() || '#efffff';
    let w = 0;
    let h = 0;
    let raf = 0;
    let timeout: number | undefined;
    let began = 0;
    let cancelled = false;
    let pulse = 0;
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const noise = (a: number, b: number) => {
      const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return (n - Math.floor(n)) * 2 - 1;
    };

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // 진행 바의 둥근 윗변 → 오른쪽 곡선 → 아랫변 → 왼쪽 곡선 순서로 추적한다.
    const perimeter = () => {
      const r = 5.5;
      const left = 12 + r;
      const right = w - 12 - r;
      const cy = 29 + r;
      const straight = Math.max(1, right - left);
      const curve = Math.PI * r;
      const length = straight * 2 + curve * 2;

      const at = (distance: number): EdgePoint => {
        let d = ((distance % length) + length) % length;
        if (d <= straight) return { x: left + d, y: cy - r, nx: 0, ny: -1 };
        d -= straight;
        if (d <= curve) {
          const angle = -Math.PI / 2 + d / r;
          return { x: right + r * Math.cos(angle), y: cy + r * Math.sin(angle),
            nx: Math.cos(angle), ny: Math.sin(angle) };
        }
        d -= curve;
        if (d <= straight) return { x: right - d, y: cy + r, nx: 0, ny: 1 };
        d -= straight;
        const angle = Math.PI / 2 + d / r;
        return { x: left + r * Math.cos(angle), y: cy + r * Math.sin(angle),
          nx: Math.cos(angle), ny: Math.sin(angle) };
      };
      return { at, length };
    };

    const draw = (now: number) => {
      if (cancelled || document.hidden) { raf = 0; return; }
      const elapsed = now - began;
      const progress = Math.min(elapsed / SWEEP_MS, 1);
      ctx.clearRect(0, 0, w, h);
      const { at, length } = perimeter();
      const head = progress * (length + Math.min(150, w * 0.35));
      const trail = clamp(w * 0.45, 80, 185);
      const visibility = clamp(elapsed / 80, 0, 1) * clamp((SWEEP_MS - elapsed) / 240, 0, 1);
      const shimmer = Math.floor(elapsed / 90);

      const arc = (end: number, amount: number, opacity: number, offset: number) => {
        const start = Math.max(0, end - amount);
        const finish = Math.min(length, end);
        if (finish - start < 7 || opacity <= 0) return;
        const segments = Math.max(6, Math.ceil((finish - start) / 9));
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= segments; i++) {
          const distance = start + (finish - start) * i / segments;
          const p = at(distance);
          // 테두리를 따라 달리되 전류는 테두리 밖으로 불규칙하게 튀어나간다.
          const jump = noise(i + offset * 31, shimmer + pulse * 9) * 5 +
            (i % 5 === 2 ? 9 : 0);
          pts.push({ x: p.x + p.nx * jump, y: p.y + p.ny * jump });
        }
        const drawPath = () => {
          ctx.beginPath();
          pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
        };
        drawPath();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 21;
        ctx.lineWidth = 11;
        ctx.globalAlpha = opacity * 0.32;
        ctx.stroke();
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        ctx.globalAlpha = opacity * 0.95;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = white;
        ctx.lineWidth = 1.7;
        ctx.globalAlpha = opacity;
        ctx.stroke();

        // 주 전류에서 2~3개의 뾰족한 가지가 바깥쪽으로 짧게 솟는다.
        for (let i = 1; i <= 3; i++) {
          const d = start + (finish - start) * i / 4;
          const p = at(d);
          const tangent = { x: -p.ny, y: p.nx };
          const len = 10 + 8 * Math.abs(noise(i + 31 * offset, shimmer + pulse));
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.nx * (len * 0.58) + tangent.x * 5, p.y + p.ny * (len * 0.58) + tangent.y * 5);
          ctx.lineTo(p.x + p.nx * len - tangent.x * 3, p.y + p.ny * len - tangent.y * 3);
          ctx.strokeStyle = white;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = opacity * 0.75;
          ctx.stroke();
        }

        // 머리 부분은 구체적인 밝은 전기 입자로 빛난다.
        const tip = pts[pts.length - 1]!;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = white;
        ctx.shadowColor = color;
        ctx.shadowBlur = 22;
        ctx.globalAlpha = opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      };

      // 두 겹의 전류가 서로 다른 위치를 돌며 위아래 가장자리를 휘감는다.
      arc(head, trail, visibility, 1);
      const secondary = (head * 0.9 + length * 0.53) % length;
      arc(secondary, trail * 0.48, visibility * 0.67, 2);

      if (elapsed < SWEEP_MS) raf = requestAnimationFrame(draw);
      else {
        raf = 0;
        ctx.clearRect(0, 0, w, h);
        scheduleNextPulse();
      }
    };

    const startPulse = () => {
      timeout = undefined;
      if (cancelled || document.hidden) return;
      fit();
      if (w < 55) { scheduleNextPulse(); return; }
      pulse++;
      began = performance.now();
      raf = requestAnimationFrame(draw);
    };
    const schedule = (delay: number) => {
      if (cancelled || document.hidden) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(startPulse, delay);
    };
    const scheduleNextPulse = () => schedule(rand(5000, 8000));
    const onVisibility = () => {
      if (document.hidden) {
        if (timeout !== undefined) window.clearTimeout(timeout);
        timeout = undefined;
        cancelAnimationFrame(raf);
        raf = 0;
        ctx.clearRect(0, 0, w, h);
      } else if (!raf && timeout === undefined) scheduleNextPulse();
    };

    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : undefined;
    if (observer) observer.observe(canvas.parentElement ?? canvas);
    else window.addEventListener('resize', fit);
    document.addEventListener('visibilitychange', onVisibility);
    scheduleNextPulse();

    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', fit);
      ctx.clearRect(0, 0, w, h);
    };
  }, [level]);

  if (level === 'off') return null;
  return <canvas ref={canvasRef} className="review-progress-arc" aria-hidden="true" />;
}
