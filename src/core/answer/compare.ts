/**
 * 직접 쓴 답과 정답을 글자 단위로 비교한다 (작문 카드용).
 * 띄어쓰기·문장부호·대소문자는 무시한다. 채점은 사용자가 하고, 이건 차이를 보여주기만 한다.
 */

export type DiffOp = 'same' | 'missing' | 'extra';
export interface DiffPart {
  op: DiffOp;
  text: string;
}

export interface AnswerComparison {
  /** 정답 기준: same(맞음) / missing(빠뜨림) */
  expected: DiffPart[];
  /** 내 답 기준: same(맞음) / extra(틀리거나 더 씀) */
  given: DiffPart[];
  /** 0~1. 정답 글자 중 맞힌 비율 */
  score: number;
  exact: boolean;
}

const IGNORED = /[\s\p{P}\p{S}]/u;

function chars(s: string): string[] {
  return Array.from(s.normalize('NFC').toLowerCase()).filter((ch) => !IGNORED.test(ch));
}

export function compareAnswer(expectedText: string, givenText: string): AnswerComparison {
  const a = chars(expectedText);
  const b = chars(givenText);
  // LCS 표
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const expected: DiffPart[] = [];
  const given: DiffPart[] = [];
  const push = (list: DiffPart[], op: DiffOp, ch: string) => {
    const last = list[list.length - 1];
    if (last && last.op === op) last.text += ch;
    else list.push({ op, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(expected, 'same', a[i]!);
      push(given, 'same', b[j]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push(expected, 'missing', a[i++]!);
    } else {
      push(given, 'extra', b[j++]!);
    }
  }
  while (i < a.length) push(expected, 'missing', a[i++]!);
  while (j < b.length) push(given, 'extra', b[j++]!);
  const lcs = dp[0]![0]!;
  return {
    expected,
    given,
    score: a.length ? lcs / a.length : 0,
    exact: a.length > 0 && lcs === a.length && lcs === b.length,
  };
}
