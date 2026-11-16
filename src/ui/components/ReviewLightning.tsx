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

    // 큰 방향 전환(주 굴곡) + 짧은 예리한 꺾임(잔 굴곡)을 중첩한다.
    // 직선에 작은 흔들림만 붙이는 대신, 실제 번개처럼 20~50도 각도로 튀는 줄기를 만든다.
    const jagged = (from: Point, to: Point, sections: number, swing: number, detail: number): Point[] => {
      const anchors: Point[] = [from];
      let previousX = from.x;
      const minX = Math.max(9, width * 0.15);
      const maxX = Math.min(width - 9, width * 0.85);
      for (let i = 1; i < sections; i++) {
        const t = i / sections;
        const centre = from.x + (to.x - from.x) * t;
        const x = clamp(previousX * 0.42 + centre * 0.58 + random(-swing, swing), minX, maxX);
        anchors.push(point(x, from.y + (to.y - from.y) * t));
        previousX = x;
      }
      anchors.push(to);
      const result: Point[] = [from];
      for (let i = 1; i < anchors.length; i++) {
        const p = anchors[i - 1]!;
        const q = anchors[i]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        result.push(
          point(clamp(p.x + dx * 0.35 + random(-detail, detail), 4, width - 4), p.y + dy * 0.35),
          point(clamp(p.x + dx * 0.72 + random(-detail, detail), 4, width - 4), p.y + dy * 0.72),
          q,
        );
      }
      return result;
    };

    const bar = document.querySelector('.review-progress-row .progress-track')?.getBoundingClientRect();
    const impact = point(
      bar ? bar.left + bar.width * 0.5 : width * 0.5,
      bar ? bar.top + bar.height / 2 : height * 0.15,
    );
    const start = point(clamp(impact.x + random(-width * 0.09, width * 0.09), width * 0.2, width * 0.8), -16);
    const finish = point(clamp(impact.x + random(-width * 0.16, width * 0.16), width * 0.2, width * 0.8), height + 8);
    const upper = jagged(start, impact, 3, Math.min(42, width * 0.12), 9);
    const lower = jagged(impact, finish, Math.max(7, Math.ceil((height - impact.y) / 95)), Math.min(92, width * 0.26), 16);
    const main = [...upper, ...lower.slice(1)];
    const arcs: Arc[] = [{
      path: main,
      // 이전보다 흰 코어와 중간 파란/보라색 선을 굵게.
      width: trigger.level === 1 ? 6.2 : trigger.level === 2 ? 8.0 : 10.2,
      delay: 0,
    }];

    // 짧은 잔가지는 메인 줄기 전체에 분산. 한 점에서 빗자루처럼 퍼지지 않는다.
    const count = trigger.level === 1 ? 5 : trigger.level === 2 ? 6 : 7;
    for (let i = 0; i < count; i++) {
      const index = clamp(
        Math.floor((i + 1) / (count + 1) * (main.length - 1) + random(-1.5, 1.5)),
        4,
        main.length - 4,
      );
      const from = main[index] ?? impact;
      const direction = i % 2 ? 1 : -1;
      const reach = random(18, Math.min(66, width * 0.17));
      const tip = point(
        clamp(from.x + direction * reach, 5, width - 5),
        Math.min(height - 3, from.y + random(15, 55)),
      );
      const branch = jagged(from, tip, 2, 10, 5);
      const delay = random(11, 72);
      arcs.push({ path: branch, width: random(0.9, 1.45), delay });

      // 큰 번개가 아닌 고주파로 짧게 튀는 잔불꽃.
      if (trigger.level >= 2 && i % 2 === 0) {
        const fork = branch[Math.floor(branch.length * 0.6)] ?? tip;
        const end = point(
          clamp(fork.x + direction * random(9, 23), 4, width - 4),
          Math.min(height - 3, fork.y + random(9, 25)),
        );
        arcs.push({
          path: jagged(fork, end, 2, 4, 2),
          width: random(0.4, 0.7),
          delay: delay + random(12, 32),
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
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // 굵은 본체에 네온 외곽 광, 좁은 안쪽 광, 하얀 코어 세 겹.
      ctx.shadowBlur = 26;
      ctx.shadowColor = edge;
      ctx.strokeStyle = edge;
      ctx.lineWidth = arc.width * 5.7;
      ctx.globalAlpha = alpha * 0.28;
      ctx.stroke();

      ctx.shadowBlur = 7;
      ctx.strokeStyle = edge;
      ctx.lineWidth = arc.width * 2.2;
      ctx.globalAlpha = alpha * 0.94;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(0.8, arc.width * 0.82);
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
