import type { Millis } from './types';

const DAY = 86_400_000;

/**
 * "학습일" 번호. 하루는 현지 시간 dayStartHour시(기본 새벽 4시)에 시작한다.
 * tzOffsetMin은 Date#getTimezoneOffset() 값 (UTC − 현지, 분). 한국은 -540.
 */
export function studyDay(at: Millis, tzOffsetMin: number, dayStartHour: number): number {
  const local = at - tzOffsetMin * 60_000;
  return Math.floor((local - dayStartHour * 3_600_000) / DAY);
}

/** 해당 학습일이 끝나는 UTC 시각 (다음 학습일 시작 직전). */
export function studyDayEnd(day: number, tzOffsetMin: number, dayStartHour: number): Millis {
  return (day + 1) * DAY + dayStartHour * 3_600_000 + tzOffsetMin * 60_000 - 1;
}
