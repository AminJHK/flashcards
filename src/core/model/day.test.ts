import { describe, expect, it } from 'vitest';
import { studyDay, studyDayEnd } from './day';
import { KST } from '../testUtil';

describe('studyDay', () => {
  it('새벽 4시 전은 전날로 친다', () => {
    const at0330 = Date.UTC(2026, 9, 8, 18, 30); // 10/9 03:30 KST
    const at0430 = Date.UTC(2026, 9, 8, 19, 30); // 10/9 04:30 KST
    const at2300 = Date.UTC(2026, 9, 8, 14, 0); // 10/8 23:00 KST
    expect(studyDay(at0330, KST, 4)).toBe(studyDay(at2300, KST, 4));
    expect(studyDay(at0430, KST, 4)).toBe(studyDay(at2300, KST, 4) + 1);
  });

  it('하루 끝은 다음 날 새벽 4시 직전', () => {
    const at = Date.UTC(2026, 9, 8, 1, 0); // 10/8 10:00 KST
    const end = studyDayEnd(studyDay(at, KST, 4), KST, 4);
    expect(end).toBe(Date.UTC(2026, 9, 8, 19, 0) - 1); // 10/9 04:00 KST - 1ms
  });

  it('시간대가 바뀌면 같은 시각도 다른 날일 수 있다', () => {
    const at = Date.UTC(2026, 9, 8, 20, 0); // KST 10/9 05:00, 자카르타(UTC+7) 10/9 03:00
    expect(studyDay(at, KST, 4)).toBe(studyDay(at, -420, 4) + 1);
  });
});
