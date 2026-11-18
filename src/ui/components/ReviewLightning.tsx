import { ERUPTION_ECHO_MS, eruptionAt } from '../../adapters/sound/reviewArcade';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface LightningTrigger {
  id: number;
  level: 1 | 2 | 3;
  times: readonly number[];
  rise: boolean;
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
    if (!ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion && !trigger.rise) return;

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
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
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
    const cardBottom = document.querySelector('.card-area .card-sheet')?.getBoundingClientRect().bottom ?? 0;
    const vent = point(width * 0.5, Math.min(height - 12, Math.max(height * 0.92, cardBottom + 16)));
    const lower = jagged(impact, trigger.rise ? vent : finish, Math.max(7, Math.ceil((height - impact.y) / 95)), Math.min(92, width * 0.26), 16);
    const firstStrike = trigger.times[0] ?? 0;
    const main = [...upper, ...lower.slice(1)];
    const arcs: Arc[] = [{
      path: main,
      // 이전보다 흰 코어와 중간 파란/보라색 선을 굵게.
      width: trigger.level === 1 ? 6.2 : trigger.level === 2 ? 8.0 : 10.2,
      delay: firstStrike,
    }];

    trigger.times.slice(1).forEach((delay, i) => {
      const direction = i % 2 === 0 ? 1 : -1;
      const x = clamp(impact.x + direction * width * (0.12 + i * 0.045), 12, width - 12);
      const nextImpact = point(x, impact.y);
      const nextUpper = jagged(point(x + 18 * direction, -16), nextImpact, 3, width * 0.12, 9);
      const nextLower = jagged(nextImpact, trigger.rise ? vent : point(x - 28 * direction, height + 8), 8, width * 0.24, 16);
      arcs.push({ path: [...nextUpper, ...nextLower.slice(1)], width: 6.2 + i * 0.95, delay });
    });

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
      const delay = firstStrike + random(11, 72);
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
    const eruption = eruptionAt(trigger.times);
    const duration = trigger.rise ? eruption + 900 : Math.max(
      trigger.level === 1 ? 720 : trigger.level === 2 ? 890 : 1060,
      (trigger.times.at(-1) ?? 0) + 380);
    const ejecta = trigger.rise ? Array.from({ length: 72 }, (_, i) => ({
      vx: random(-0.82, 0.82),
      vy: random(-1.5, -0.32),
      size: random(1.2, 5.8),
      delay: i < 51 ? 0 : ERUPTION_ECHO_MS,
    })) : [];

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

    const gold = style.getPropertyValue('--eruption-gold').trim();
    const amber = style.getPropertyValue('--eruption-amber').trim();
    const ivory = style.getPropertyValue('--eruption-core').trim();
    const beamShards = [-0.47, -0.36, -0.27, 0.25, 0.35, 0.47];
    const drawBeam = (age: number) => {
      if (age < 0 || age >= 740) return;
      const growth = 1 - (1 - Math.min(1, age / 170)) ** 3;
      const fade = 1 - Math.max(0, (age - 270) / 470);
      const top = vent.y - (vent.y + 20) * growth;
      ctx.save();
      ctx.globalAlpha = fade * Math.min(1, age / 30);
      const polygon = (color: string, points: readonly Point[]) => {
        ctx.beginPath();
        ctx.moveTo(vent.x, vent.y);
        for (const p of points) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      for (const offset of beamShards) {
        const x = vent.x + width * offset * growth;
        const y = vent.y * (1 - growth * (0.5 + Math.abs(offset) * 0.65));
        polygon(Math.abs(offset) > 0.4 ? gold : amber, [
          point(vent.x + (x - vent.x) * 0.54, (vent.y + y) / 2),
          point(x, y),
          point(vent.x + (x - vent.x) * 0.77, (vent.y + y) / 2),
        ]);
      }
      for (const [color, spread] of [[amber, 0.21], [gold, 0.16], [ivory, 0.062]] as const) {
        const half = width * spread * growth;
        polygon(color, [
          point(vent.x - half * 0.58, (vent.y + top) * 0.5),
          point(vent.x - half, top),
          point(vent.x + half, top),
          point(vent.x + half * 0.64, (vent.y + top) * 0.48),
        ]);
      }
      ctx.restore();
    };

    const draw = (now: number) => {
      if (document.hidden) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      const elapsed = now - startTime;
      const ageSinceStrike = elapsed - firstStrike;
      const t = Math.min(1, Math.max(0, ageSinceStrike) / duration);
      ctx.clearRect(0, 0, width, height);

      // 충격 순간 짧게 화면 전체를 비추되 눈부심은 억제.
      const burst = ageSinceStrike < 0 ? 0 : Math.max(0, 1 - ageSinceStrike / 170);
      const glow = burst;
      if (glow > 0) {
        ctx.fillStyle = edge;
        ctx.globalAlpha = glow * (trigger.level === 3 ? 0.13 : 0.08);
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      if (trigger.rise) {
        const age = elapsed - eruption;
        drawBeam(age);
        for (const delay of [0, ERUPTION_ECHO_MS]) {
          const t = age - delay;
          if (t < 0 || t > 580) continue;
          const progress = t / 580;
          const radius = 12 + width * 0.64 * Math.sqrt(progress);
          ctx.beginPath();
          ctx.ellipse(vent.x, vent.y, radius, radius * 0.25, 0, 0, Math.PI * 2);
          ctx.strokeStyle = delay ? amber : gold;
          ctx.lineWidth = 5 * (1 - progress) + 1;
          ctx.globalAlpha = (1 - progress) * 0.8;
          ctx.stroke();

        }
        for (const ember of ejecta) {
          const t = age - ember.delay;
          if (t < 0 || t > 720) continue;
          const x = vent.x + ember.vx * t;
          const y = vent.y + ember.vy * t + 0.0009 * t * t;
          const size = ember.size * (1 - t / 800);
          ctx.globalAlpha = Math.min(1, t / 14, 1 - t / 720);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - ember.vx * 19, y - (ember.vy + 0.0018 * t) * 19);
          ctx.lineWidth = size;
          ctx.strokeStyle = ember.size > 4 ? ivory : gold;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      for (const arc of arcs) {
        const age = elapsed - arc.delay;
        const alpha = age < 0 ? 0 : age < 100 ? 1 : Math.max(0, 1 - (age - 100) / 230);
        drawLine(arc, alpha);
      }

      for (const spark of ageSinceStrike < 0 ? [] : sparks) {
        const age = Math.max(0, ageSinceStrike - 55);
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

    if (reducedMotion) {
      drawBeam(190);
      const timeout = window.setTimeout(() => ctx.clearRect(0, 0, width, height), 620);
      return () => {
        window.clearTimeout(timeout);
        ctx.clearRect(0, 0, width, height);
      };
    }
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
      ctx.clearRect(0, 0, width, height);
    };
  }, [trigger]);

  return createPortal(
    <canvas ref={ref} className={trigger?.rise ? 'review-lightning review-eruption' : 'review-lightning'} aria-hidden="true" />,
    document.body,
  );
}
