import type { Millis } from '../model/types';

/** 다음 복습까지의 간격을 짧게 표시한다. 예: 1분, 10분, 3시간, 4일, 2.5개월, 1.2년 */
export function formatInterval(ms: Millis): string {
  const min = ms / 60_000;
  if (min < 1) return '1분';
  if (min < 60) return `${Math.round(min)}분`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)}시간`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}일`;
  const months = days / 30.44;
  if (months < 12) return `${trim(months)}개월`;
  return `${trim(days / 365.25)}년`;
}

function trim(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
