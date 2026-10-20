import { describe, expect, it } from 'vitest';
import type { Card } from '../model/types';
import { DEFAULT_NOTIFY_PREFS, notifyText, outOfQuiet, planAlarms } from './plan';

// 조용한 시간 계산 확인용 (앱 기본은 조용한 시간 없음)
const QUIET = { ...DEFAULT_NOTIFY_PREFS, quietStart: 22, quietEnd: 8 };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// 휴대폰 시각 = UTC (tz 0)로 계산해서 읽기 쉽게: 2026-10-20 12:00
const NOW = Date.UTC(2026, 9, 20, 12);

let n = 0;
function card(extra: Partial<Card>): Card {
  n++;
  return { id: `c${n}`, noteId: `n${n}`, deckId: 'd', templateId: 'forward', ord: 0, hidden: false, suspended: false, createdAt: 0, isNew: false, phase: 'learning', due: NOW, reps: 1, lapses: 0, ...extra };
}
const text = () => ({ front: '단어', back: '뜻' });

describe('복습 알림 계획', () => {
  it('짧은 복습(1분·10분 뒤)은 카드마다 그 시각에, 이미 지난 것은 바로 알린다', () => {
    const a = card({ lastReviewAt: NOW - MIN, due: NOW + MIN });
    const b = card({ lastReviewAt: NOW - 20 * MIN, due: NOW - 10 * MIN });
    const alarms = planAlarms({ cards: [a, b], textFor: text, now: NOW, tzOffsetMin: 0 });
    expect(alarms.map((x) => [x.kind, x.at - NOW])).toEqual([
      ['card', 5_000],
      ['card', MIN],
    ]);
    expect(alarms[0]).toMatchObject({ cardId: b.id, front: '단어', back: '뜻' });
  });

  it('기본은 조용한 시간이 없고, 정하면(밤 10시~아침 8시) 아침 8시로 미룬다', () => {
    expect(outOfQuiet(Date.UTC(2026, 9, 20, 23, 30), DEFAULT_NOTIFY_PREFS, 0)).toBe(Date.UTC(2026, 9, 20, 23, 30));
    const night = Date.UTC(2026, 9, 20, 23, 30);
    expect(outOfQuiet(night, QUIET, 0)).toBe(Date.UTC(2026, 9, 21, 8));
    expect(outOfQuiet(Date.UTC(2026, 9, 21, 3), QUIET, 0)).toBe(Date.UTC(2026, 9, 21, 8));
    expect(outOfQuiet(NOW, QUIET, 0)).toBe(NOW);
    // 시드니(UTC+11)의 밤 11시 = UTC 12시
    expect(outOfQuiet(Date.UTC(2026, 9, 20, 12), QUIET, 660)).toBe(Date.UTC(2026, 9, 20, 21));
  });

  it('며칠 간격 카드는 10장 이상 쌓이면 한 번에, 앱을 막 닫았을 때는 3시간 뒤부터, 3시간 간격, 하루 4번까지 (조용한 시간을 정했을 때)', () => {
    const long = (due: number) => card({ phase: 'review', lastReviewAt: due - 5 * DAY, due });
    const cards = [...Array.from({ length: 12 }, () => long(NOW - HOUR)), ...Array.from({ length: 5 }, () => long(NOW + 5 * HOUR))];
    const piles = planAlarms({ cards, textFor: text, now: NOW, tzOffsetMin: 0, prefs: QUIET }).filter((x) => x.kind === 'pile');
    expect(piles[0]).toMatchObject({ at: NOW + 3 * HOUR, count: 12 });
    expect(piles[1]).toMatchObject({ at: NOW + 6 * HOUR, count: 17 });
    // 21시 다음은 조용한 시간 → 아침 8시
    expect(piles.slice(0, 4).map((x) => new Date(x.at).getUTCHours())).toEqual([15, 18, 21, 8]);
    const perDay = new Map<number, number>();
    for (const x of piles) perDay.set(Math.floor(x.at / DAY), (perDay.get(Math.floor(x.at / DAY)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(4);
  });

  it('새 카드·숨긴 카드는 알리지 않고, 9장이면 쌓임 알림도 없다', () => {
    const cards = [card({ phase: 'new', isNew: true }), card({ hidden: true, lastReviewAt: NOW, due: NOW + MIN }), ...Array.from({ length: 9 }, () => card({ phase: 'review', lastReviewAt: NOW - 3 * DAY, due: NOW }))];
    expect(planAlarms({ cards, textFor: text, now: NOW, tzOffsetMin: 0 })).toEqual([]);
  });

  it('알림 글자: 앞면은 단어, 뒷면은 한국어 뜻만 (예문·영어 뜻 빼고). 듣기 카드는 알림으로 하지 않는다', () => {
    expect(
      notifyText({
        front: [{ kind: 'word', text: 'aku', size: 'front', lang: 'id-ID' }],
        back: [{ kind: 'word', text: 'aku', size: 'back', lang: 'id-ID' }, { kind: 'divider' }, { kind: 'meaning', text: '나', size: 'back' }, { kind: 'gloss', text: 'I, me', lang: 'en-US' }],
        tts: { front: [], back: [] },
      }),
    ).toEqual({ front: 'aku', back: '나' });
    expect(notifyText({ front: [{ kind: 'listen', text: 'aku', lang: 'id-ID' }], back: [], tts: { front: [], back: [] } })).toBeUndefined();
  });
});
