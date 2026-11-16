import { useEffect, useRef } from 'react';

export interface LightningTrigger {
  id: number;
  level: 1 | 2 | 3;
}

interface Point { x: number; y: number }
interface Arc { path: Point[]; width: number; delay: number }
interface Spark { x: number; y: number; vx: number; vy: number; radius: number; hue: number }

/**
 * 굵은 주 번개 한 줄이 화면 상단부터 하단까지 관통하고,
 * 본체 곳곳에서 짧은 잔가지와 전기 불꽃만 튄다.
 * 화면 입력을 가리지 않으며 짧게 재생한 뒤 애니메이션 프레임을 정리한다.
 */
export function ReviewLightning({ trigger }: { trigger?: LightningTrigger }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!trigger || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const style = getComputedStyle(document.documentElement);
    const core = style.getPropertyValue('--lightning-bright').trim() || '#efffff';
    const blue = style.getPropertyValue('--lightning-blue').trim() || '#42c5ff';
    const violet = style.getPropertyValue('--lightning-violet').trim() || '#ba83ff';
    const edge = trigger.level >= 3 ? violet : blue;
    let width = 0;
    let height = 0;
    let frame = 0;
    const random = (a: number, b: number) => a + Math.random() * (b - a);
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const point = (x: number, y: number): Point => ({ x, y });

    const fit = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    // 지그재그는 짧고 날카롭게. 가지 길이가 화면 폭을 가로지르지 않도록 제한한다.
    const zigzag = (from: Point, to: Point, segments: number, wobble: number): Point[] => {
      const result = [from];
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const wiggle = Math.sin(t * Math.PI) * wobble;
        result.push(point(
          from.x + (to.x - from.x) * t + random(-wiggle, wiggle),
          from.y + (to.y - from.y) * t,
        ));
      }
      return [...result, to];
    };

    const bar = document.querySelector('.review-progress-row .progress-track')?.getBoundingClientRect();
    const impact = point(
      bar ? bar.left + bar.width * 0.5 : width * 0.5,
      bar ? bar.top + bar.height / 2 : height * 0.15,
    );
    const start = point(clamp(impact.x + random(-width * 0.10, width * 0.10), width * 0.2, width * 0.8), -16);
    const finish = point(clamp(impact.x + random(-width * 0.08, width * 0.08), width * 0.2, width * 0.8), height + 8);
    const upper = zigzag(start, impact, 8, 14);
    const lower = zigzag(impact, finish, 23, 24);
    const main = [...upper, ...lower.slice(1)];
    const arcs: Arc[] = [{
      path: main,
      width: trigger.level === 1 ? 3.8 : trigger.level === 2 ? 4.8 : 5.8,
      delay: 0,
    }];

    // '빗자루'처럼 한 지점에서 사방으로 뻗지 않고 주 줄기 전체에 가지를 흩뿌린다.
    const count = trigger.level === 1 ? 5 : trigger.level === 2 ? 7 : 9;
    for (let i = 0; i < count; i++) {
      // 충격부뿐 아니라 카드 한가운데, 화면 하단에서도 튄다.
      const fraction = (i + 0.6 + random(-0.2, 0.2)) / count;
      const index = clamp(Math.floor(6 + fraction * (main.length - 9)), 4, main.length - 3);
      const from = main[index] ?? impact;
      const direction = i % 2 ? 1 : -1;
      const maxReach = Math.min(88, width * 0.20);
      const reach = random(27, maxReach);
      const tip = point(
        clamp(from.x + direction * reach, 5, width - 5),
        Math.min(height - 4, from.y + random(24, 79)),
      );
      const branch = zigzag(from, tip, 4 + Math.floor(random(0, 3)), 9);
      const delay = random(12, 85);
      arcs.push({ path: branch, width: random(0.95, 1.55), delay });

      // 가지에서 다시 1개의 짧은 가는 스파크만 튄다.
      if (trigger.level >= 2 || i % 2 === 0) {
        const fork = branch[Math.floor(branch.length * 0.6)] ?? tip;
        const smallTip = point(
          clamp(fork.x + direction * random(12, 31), 4, width - 4),
          Math.min(height - 3, fork.y + random(12, 31)),
        );
        arcs.push({
          path: zigzag(fork, smallTip, 3, 5),
          width: random(0.45, 0.75),
          delay: delay + random(9, 32),
        });
      }
    }

    // 진행 바, 주 줄기, 하단 충격 지점에 작은 불꽃을 분산한다.
    const sparks: Spark[] = Array.from({
      length: trigger.level === 1 ? 35 : trigger.level === 2 ? 50 : 66,
    }, (_, i) => {
      const source = i % 4 === 0 ? impact : i % 4 === 1 ? finish :
        main[Math.floor(random(4, main.length - 2))] ?? impact;
      const angle = random(0, Math.PI * 2);
      const speed = random(0.5, 3.2);
      return {
        x: source.x,
        y: source.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: random(0.6, 1.85),
        hue: random(0, 1),
      };
    });

    const startTime = performance.now();
    const duration = trigger.level === 1 ? 720 : trigger.level === 2 ? 890 : 1060;

    const drawLine = (arc: Arc, alpha: number) => {
      if (alpha <= 0) return;
      ctx.beginPath();
      arc.path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'round';

      // 굵은 본체에 네온 외곽 광, 좁은 안쪽 광, 하얀 코어 세 겹.
      ctx.shadowBlur = 19;
      ctx.shadowColor = edge;
      ctx.strokeStyle = edge;
      ctx.lineWidth = arc.width * 5.2;
      ctx.globalAlpha = alpha * 0.28;
      ctx.stroke();

      ctx.shadowBlur = 7;
      ctx.strokeStyle = edge;
      ctx.lineWidth = arc.width * 1.9;
      ctx.globalAlpha = alpha * 0.94;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(0.65, arc.width * 0.70);
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const draw = (now: number) => {
      if (document.hidden) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      ctx.clearRect(0, 0, width, height);

      // 충격 순간 짧게 화면 전체를 비추되 눈부심은 억제.
      const burst = Math.max(0, 1 - elapsed / 170);
      const echo = Math.max(0, 1 - Math.abs(elapsed - 175) / 90) * 0.38;
      const glow = Math.max(burst, echo);
      if (glow > 0) {
        ctx.fillStyle = edge;
        ctx.globalAlpha = glow * (trigger.level === 3 ? 0.13 : 0.08);
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      for (const arc of arcs) {
        const age = elapsed - arc.delay;
        const alpha = age < 0 ? 0 : age < 100 ? 1 : Math.max(0, 1 - (age - 100) / 230);
        drawLine(arc, alpha);
      }

      for (const spark of sparks) {
        const age = Math.max(0, elapsed - 55);
        const k = age / 16;
        const x = spark.x + spark.vx * k;
        const y = spark.y + spark.vy * k + k * k * 0.025;
        const alpha = Math.max(0, (1 - t * 1.13) * (spark.hue > 0.75 ? 1 : 0.75));
        if (!alpha) continue;
        ctx.fillStyle = spark.hue > 0.8 ? core : edge;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, spark.radius * (1 - t * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
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
