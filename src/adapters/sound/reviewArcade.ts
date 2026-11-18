import singleStrikeUrl from './lightning-combo-10.mp3?inline';
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

/** 높은 콤보의 축하 타격. 일반 성공은 기존 짧은 전기음을 쓴다. */
export function comboStrike(combo: number): 0 | 1 | 2 {
  if (combo >= 5 && combo % 5 === 0) return 2;
  return thunderMilestoneLevel(combo) ? 1 : 0;
}

export function comboBoltTimes(combo: number): readonly number[] {
  if (!lightningBurstLevel(combo)) return [];
  const count = combo < 5 ? 1 : Math.min(combo - 3, 5);
  const interval = 246 - count * 28;
  const first = comboStrike(combo) ? STRIKE_TIMES_MS[0] : 0;
  return Array.from({ length: count }, (_, i) => first + i * interval);
}

// 타격 샘플의 충전음은 건너뛰고, 화면 효과와 같은 시점에 타격을 재생한다.
const STRIKE_TIMES_MS = [140] as const;
const STRIKE_SAMPLE_OFFSET = 0.13;
let strikeBuffer: AudioBuffer | undefined;
let loadingStrike: Promise<void> | undefined;

function prepareStrike(ctx: AudioContext): void {
  if (strikeBuffer || loadingStrike) return;
  loadingStrike = fetch(singleStrikeUrl)
    .then((response) => response.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => { strikeBuffer = buffer; })
    .catch(() => {})
    .finally(() => { loadingStrike = undefined; });
}

function playStrike(ctx: AudioContext, out: AudioNode, at: number, volume: number): void {
  if (!strikeBuffer) {
    tone(ctx, out, 146, at, 0.14, volume * 0.5, 'triangle');
    return;
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = strikeBuffer;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.setTargetAtTime(0.0001, at + 0.09, 0.05);
  source.connect(gain);
  gain.connect(out);
  source.start(at, STRIKE_SAMPLE_OFFSET, 0.30);
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
    prepareStrike(ctx);
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
    const times = comboBoltTimes(combo);
    const volume = times.length > 1 ? 0.62 : 0.9;
    times.forEach((delay) => playStrike(ctx, mix, t + delay / 1000, volume));
  } catch {
    // 음향 오류는 FSRS 저장이나 다음 카드 이동에 영향을 주지 않는다.
  }
}
