/**
 * 읽기 받아쓰기 (docs/HANDOFF.md "읽기 · 받아쓰기"). 화면과 상관없는 비교 규칙만 둔다.
 * - 빈칸: 한 문장에서 1~2단어만 가리고 그 단어를 쓴다 (배우는 단어·덱의 새 단어를 먼저 고른다).
 * - 전체: 문장 전체를 쓰고, 문장의 단어마다 맞았는지 표시한다.
 * 대소문자·문장부호·흔한 철자 차이(nggak/gak/ga …)는 틀린 걸로 치지 않는다.
 */

/** 같은 말로 보는 구어 철자 (첫 번째가 대표) */
const VARIANTS: readonly string[][] = [
  ['nggak', 'gak', 'ga', 'enggak', 'engga', 'nggk', 'gk'],
  ['udah', 'uda', 'udh'],
  ['gimana', 'gmn'],
  ['emang', 'emg'],
  ['banget', 'bgt'],
  ['dateng', 'datang'],
];
const CANON = new Map(VARIANTS.flatMap((g) => g.map((w) => [w, g[0]!] as const)));

/** 비교용으로 다듬은 단어: 소문자, 앞뒤 문장부호 제거, 구어 철자를 대표형으로 */
export function normalizeWord(w: string): string {
  const s = w
    .toLowerCase()
    .normalize('NFC')
    .replace(/[’']/g, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return CANON.get(s) ?? s;
}

/** 문장을 단어로 (하이픈은 한 단어: apa-apa) */
export function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** 맞았는지: 같거나, 5글자 이상에서 한 글자만 다르면 맞은 걸로 (오타) */
export function sameWord(expected: string, typed: string): boolean {
  const e = normalizeWord(expected);
  const t = normalizeWord(typed);
  if (!e || !t) return false;
  return e === t || (e.length >= 5 && distance(e, t) <= 1);
}

export interface WordMark {
  word: string;
  ok: boolean;
}

/**
 * 전체 받아쓰기 채점: 정답 문장의 단어마다 쓴 문장에서 찾았는지 (순서를 지키는 가장 긴 일치).
 * 덧붙인 단어는 무시한다 (틀린 단어는 정답 쪽에 빠진 것으로 나온다).
 */
export function markWords(expected: string, typed: string): WordMark[] {
  const want = expected.split(/\s+/).filter((w) => normalizeWord(w));
  const got = wordsOf(typed);
  const n = want.length;
  const m = got.length;
  const lcs = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = sameWord(want[i]!, got[j]!) ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: WordMark[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && sameWord(want[i]!, got[j]!) && lcs[i]![j] === lcs[i + 1]![j + 1]! + 1) {
      out.push({ word: want[i]!, ok: true });
      i++;
      j++;
    } else if (j < m && lcs[i]![j + 1]! >= lcs[i + 1]![j]!) j++;
    else {
      out.push({ word: want[i]!, ok: false });
      i++;
    }
  }
  return out;
}

export interface BlankCandidate {
  /** 문장 안의 위치 */
  start: number;
  end: number;
  text: string;
  /** 고를 때 먼저 볼 순서 (작을수록 먼저): 배우는 단어 0, 덱의 새 단어 1, 덱 밖 2, 아는 단어 3 */
  rank: number;
}

/**
 * 빈칸으로 만들 단어 1~2개. 이름과 한 글자 단어는 빼고, 배우는 단어 → 새 단어 → 긴 단어 순서로 고른다.
 * seed가 같으면 늘 같은 단어 (다시 열어도 같은 빈칸). 긴 문장(6단어 이상)이면 2개.
 */
export function pickBlanks(candidates: readonly BlankCandidate[], seed: string, totalWords: number): BlankCandidate[] {
  const usable = candidates.filter((c) => normalizeWord(c.text).length >= 2);
  if (!usable.length) return [];
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const jitter = (c: BlankCandidate) => (Math.imul(h ^ c.start, 2654435761) >>> 0) / 2 ** 32;
  const sorted = [...usable].sort((a, b) => a.rank - b.rank || b.text.length - a.text.length || jitter(a) - jitter(b));
  const count = totalWords >= 6 ? 2 : 1;
  return sorted.slice(0, count).sort((a, b) => a.start - b.start);
}
