import type { Card, Rating } from '../../core/model/types';

/**
 * 새 카드/학습 중 카드: 성공(Good/Easy)은 보상, 틀림(Again/Hard)은 감점 없이 유지.
 * 복습 카드: 기존처럼 Again은 초기화, Hard는 한 단계 하락.
 * 답변 '전'의 phase를 사용해야 첫 학습에서 Review로 전환돼도 감점하지 않는다.
 */
export function advanceCombo(combo: number, rating: Rating, phase: Card['phase'] = 'review'): number {
  if (rating >= 3) return combo + 1;
  if (phase !== 'review') return combo;
  if (rating === 1) return 0;
  return [0, 0, 2, 4, 7][comboTier(combo)] ?? 0;
}

export function comboTier(combo: number): 0 | 1 | 2 | 3 | 4 {
  if (combo < 1) return 0;
  if (combo <= 2) return 1;
  if (combo <= 4) return 2;
  if (combo <= 7) return 3;
  return 4;
}

/** 3콤보부터 Good/Easy를 누를 때마다 전 화면 번개가 발동한다. */
export function lightningBurstLevel(combo: number): 0 | 1 | 2 | 3 {
  if (combo < 3) return 0;
  if (combo < 5) return 1;
  if (combo < 8) return 2;
  return 3;
}

/** 큰 천둥은 별도 간격으로: 빠른 복습 중 연속 '쾅' 소리가 겹치지 않게 한다. */
export function thunderMilestoneLevel(combo: number): 0 | 1 | 2 | 3 {
  if (combo === 3) return 1;
  if (combo === 5) return 2;
  if (combo >= 8 && (combo - 8) % 5 === 0) return 3;
  return 0;
}

// 천둥 소리는 저음 충격 + 중음 울림 + 전기 파열음. 모바일 스피커에서도 들리도록
// 초저음만 사용하지 않고 100~300Hz와 1kHz 이상 대역을 겹친다.
function noiseBurst(ctx: AudioContext, out: AudioNode, at: number, duration: number, volume: number, filterType: BiquadFilterType, frequency: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = filterType;
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.009);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(at);
  src.stop(at + duration);
}

function thunderHit(ctx: AudioContext, out: AudioNode, at: number, force: number): void {
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(186, at);
  sub.frequency.exponentialRampToValueAtTime(53, at + 0.27);
  subGain.gain.setValueAtTime(0.0001, at);
  subGain.gain.exponentialRampToValueAtTime(0.44 * force, at + 0.012);
  subGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.37);
  sub.connect(subGain);
  subGain.connect(out);
  sub.start(at);
  sub.stop(at + 0.38);
  // 스피커가 작은 폰에서도 '쿵' 소리가 느껴지는 중음 타격
  tone(ctx, out, 155, at + 0.008, 0.31, 0.16 * force, 'triangle');
  noiseBurst(ctx, out, at, 0.095, 0.22 * force, 'highpass', 1700);
  noiseBurst(ctx, out, at + 0.018, 0.65, 0.18 * force, 'lowpass', 380);
}

function thunder(ctx: AudioContext, out: AudioNode, at: number, level: 1 | 2 | 3): void {
  // 간격을 둔 복수 타격으로 '쾅—쾅!' 느낌. 3단계에서도 전체 출력은 압축기로 제한.
  thunderHit(ctx, out, at + 0.045, level === 1 ? 0.60 : level === 2 ? 0.84 : 1);
  if (level >= 2) thunderHit(ctx, out, at + 0.21, level === 2 ? 0.53 : 0.69);
  if (level === 3) thunderHit(ctx, out, at + 0.38, 0.50);
  for (let i = 0; i < level * 3 + 2; i++) {
    const delay = 0.035 + i * 0.034;
    const f = 1050 + (i % 4) * 420;
    tone(ctx, out, f, at + delay, 0.055 + (i % 3) * 0.014, 0.028, 'sawtooth');
  }
}

// 오프라인 Web Audio 합성: 외부 파일/네트워크/결제 필요 없음.
let context: AudioContext | undefined;
let output: GainNode | undefined;

function audio(): { context: AudioContext; output: GainNode } | undefined {
  try {
    if (!context || !output) {
      context = new AudioContext();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -17;
      compressor.knee.value = 9;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.09;
      output = context.createGain();
      output.gain.value = 0.25;
      output.connect(compressor);
      compressor.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return { context, output };
  } catch {
    // 브라우저에서 오디오를 거부하더라도 복습은 절대로 막지 않는다.
    return undefined;
  }
}

function tone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  shape: OscillatorType = 'sine',
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = shape;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.007);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.015);
}

const transpose = (frequency: number, semitones: number) => frequency * 2 ** (semitones / 12);

/** 미리보기의 경쾌한 아케이드 음색. 콤보가 커질수록 음·화음이 풍성해진다. */
export function playReviewArcadeSound(rating: Rating, combo: number): void {
  try {
    const engine = audio();
    if (!engine) return;
    const { context: ctx, output: mix } = engine;
    const t = ctx.currentTime + 0.009;
    if (rating === 1) {
      tone(ctx, mix, 392, t, 0.145, 0.30, 'triangle');
      tone(ctx, mix, 261.63, t + 0.065, 0.20, 0.28);
      return;
    }
    if (rating === 2) {
      tone(ctx, mix, 330, t, 0.16, 0.25, 'triangle');
      tone(ctx, mix, 294, t + 0.07, 0.17, 0.20);
      return;
    }
    const stage = comboTier(combo);
    const base = rating === 4 ? 587.33 : 523.25;
    const pattern = stage === 1 ? [0, 7] : stage === 2 ? [0, 4, 7] : stage === 3 ? [0, 4, 7, 12] : [0, 4, 7, 12, 16];
    pattern.forEach((semitones, i) => {
      const at = t + i * (stage === 4 ? 0.042 : 0.06);
      const f = transpose(base, semitones);
      tone(ctx, mix, f, at, 0.19 + stage * 0.012, 0.20);
      tone(ctx, mix, f * 2.01, at + 0.003, 0.12 + stage * 0.01, 0.055, 'triangle');
    });
    if (stage >= 3) {
      tone(ctx, mix, base / 2, t + 0.015, 0.30, 0.095, 'triangle');
      tone(ctx, mix, base * 1.5, t + 0.08, 0.19, 0.07);
    }
    if (stage === 4) {
      tone(ctx, mix, transpose(base, 19), t + 0.15, 0.18, 0.10);
      tone(ctx, mix, base * 0.75, t + 0.045, 0.33, 0.08, 'triangle');
    }
    const milestone = thunderMilestoneLevel(combo);
    if (milestone) thunder(ctx, mix, t, milestone);
    else if (lightningBurstLevel(combo)) {
      // 중간 콤보는 짧은 전기음: 매번 대형 천둥을 재생하면 과도하게 시끄럽다.
      tone(ctx, mix, 1260, t + 0.055, 0.06, 0.045, 'sawtooth');
      tone(ctx, mix, 1780, t + 0.085, 0.04, 0.024, 'triangle');
    }
  } catch {
    // 음향 오류는 FSRS 저장이나 다음 카드 이동에 영향을 주지 않는다.
  }
}
