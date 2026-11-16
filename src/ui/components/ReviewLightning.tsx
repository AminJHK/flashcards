import { useEffect, useRef } from 'react';

export interface LightningTrigger {
  id: number;
  level: 1 | 2 | 3;
}

interface Point { x: number; y: number }
interface Arc { path: Point[]; width: number; delay: number }
interface Spark { x: number; y: number; vx: number; vy: number; radius: number; hue: number }

/**
 * 화면 전체를 덮는 번개. 입력을 가로채지 않고 한 번의 충격(최대 1.15초) 뒤
 * requestAnimationFrame을 완전히 멈춘다. 콤보 중 충전된 진행 바는 CSS가 담당한다.
 */
export function ReviewLightning({ trigger }: { trigger?: LightningTrigger }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!trigger || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const style = getComputedStyle(document.documentElement);
    const bright = style.getPropertyValue('--lightning-bright').trim();
    const blue = style.getPropertyValue('--lightning-blue').trim();
    const violet = style.getPropertyValue('--lightning-violet').trim();
    const core = bright || '#efffff';
    const edge = trigger.level >= 3 ? (violet || '#ba83ff') : (blue || '#42c5ff');
    let width = 0;
    let height = 0;
    let frame = 0;
    const rng = (min: number, max: number) => min + Math.random() * (max - min);
    const point = (x: number, y: number): Point => ({ x, y });
    const path = (from: Point, to: Point, steps: number, spread: number): Point[] => {
      const result = [from];
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const bend = Math.sin(t * Math.PI) * spread;
        result.push(point(from.x + (to.x - from.x) * t + rng(-bend, bend),
          from.y + (to.y - from.y) * t + rng(-bend, bend)));
      }
      result.push(to);
      return result;
    };
    const fit = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const bar = document.querySelector('.review-progress-row .progress-track')?.getBoundingClientRect();
    const impact = point(bar ? bar.left + bar.width * 0.72 : width * 0.5, bar ? bar.top + bar.height / 2 : height * 0.16);
    const arcs: Arc[] = [];
    const primary = path(point(impact.x + rng(-width * 0.14, width * 0.14), -18), impact, 15, 18);
    arcs.push({ path: primary, width: 3.2, delay: 0 });
    const branches = trigger.level === 1 ? 6 : trigger.level === 2 ? 10 : 14;
    // 상단 바에서 끝나지 않고 화면 좌우/카드 아래까지 갈라져 퍼지는 번개
    for (let i = 0; i < branches; i++) {
      const from = i < 3 ? primary[Math.floor(rng(4, 13))] ?? impact : impact;
      const side = i % 2 ? 1 : -1;
      const end = point(Math.max(4, Math.min(width - 4, impact.x + side * rng(width * 0.18, width * 0.75))),
        rng(height * 0.28, height * 0.88));
      const ray = path(from, end, 9 + Math.floor(rng(0, 7)), 14 + trigger.level * 4);
      const delay = rng(18, 115);
      arcs.push({ path: ray, width: rng(1.05, 1.85), delay });
      const tiny = trigger.level >= 2 ? 2 : 1;
      for (let j = 0; j < tiny; j++) {
        const at = ray[Math.floor(rng(3, ray.length - 2))] ?? end;
        const tip = point(at.x + rng(-width * 0.25, width * 0.25), Math.min(height - 6, at.y + rng(18, height * 0.15)));
        arcs.push({ path: path(at, tip, 5, 10), width: rng(0.55, 0.9), delay: delay + rng(8, 55) });
      }
    }
    const sparks: Spark[] = Array.from({ length: trigger.level === 1 ? 55 : trigger.level === 2 ? 90 : 125 },
      () => {
        const a = rng(0, Math.PI * 2);
        const speed = rng(0.6, 5.2) * (trigger.level === 3 ? 1.4 : 1);
        return { x: impact.x, y: impact.y, vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed + rng(0, 2), radius: rng(0.7, 2.4), hue: rng(0, 1) };
      });

    const start = performance.now();
    const duration = trigger.level === 1 ? 800 : 1150;
    const drawLine = (arc: Arc, alpha: number) => {
      if (alpha <= 0) return;
      ctx.beginPath();
      arc.path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowBlur = 24;
      ctx.shadowColor = edge;
      ctx.strokeStyle = edge;
      ctx.lineWidth = arc.width * 7;
      ctx.globalAlpha = alpha * 0.29;
      ctx.stroke();
      ctx.shadowBlur = 8;
      ctx.strokeStyle = edge;
      ctx.lineWidth = arc.width * 2.2;
      ctx.globalAlpha = alpha * 0.85;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(0.65, arc.width * 0.6);
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const draw = (now: number) => {
      if (document.hidden) return;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      ctx.clearRect(0, 0, width, height);
      // 전체 화면의 빛이 두 차례 반짝이되 눈부심을 줄이기 위해 밝기를 제한한다.
      const burst = Math.max(0, 1 - elapsed / 215);
      const echo = Math.max(0, 1 - Math.abs(elapsed - 185) / 90) * 0.5;
      const light = Math.max(burst, echo);
      if (light > 0) {
        ctx.fillStyle = edge;
        ctx.globalAlpha = light * (trigger.level === 3 ? 0.17 : 0.11);
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      for (const arc of arcs) {
        const age = elapsed - arc.delay;
        const alpha = age < 0 ? 0 : age < 90 ? 1 : Math.max(0, 1 - (age - 90) / 200);
        drawLine(arc, alpha);
      }
      sparks.forEach((s) => {
        const age = Math.max(0, elapsed - 70);
        const k = age / 16;
        const x = s.x + s.vx * k;
        const y = s.y + s.vy * k + k * k * 0.028;
        const opacity = Math.max(0, (1 - t * 1.12) * (s.hue > 0.7 ? 1 : 0.8));
        ctx.fillStyle = s.hue > 0.8 ? core : edge;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(x, y, s.radius * (1 - t * 0.55), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (elapsed < duration) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
      ctx.clearRect(0, 0, width, height);
    };
  }, [trigger]);

  return <canvas ref={ref} className="review-lightning" aria-hidden="true" />;
}
