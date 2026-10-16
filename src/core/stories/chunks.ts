/**
 * 의미 단위 (듀오링고처럼 단어 묶음을 누르면 뜻이 짧게 나온다).
 * 이야기를 만들 때 줄마다 "di stasiun kereta = 기차역에서 / nunggu = 기다리다"처럼 받는다.
 */
export interface Chunk {
  text: string;
  ko: string;
}

/** "a = 뜻 / b c = 뜻" → 묶음 목록 */
export function parseChunks(s: string | undefined): Chunk[] {
  if (!s || !s.includes('=')) return [];
  return s
    .split(/\s+\/\s+|\s*;\s*/)
    .map((p) => {
      const at = p.indexOf('=');
      return at < 0 ? undefined : { text: p.slice(0, at).trim(), ko: p.slice(at + 1).trim() };
    })
    .filter((c): c is Chunk => !!c && !!c.text && !!c.ko);
}

export function formatChunks(chunks: readonly Chunk[]): string {
  return chunks.map((c) => `${c.text} = ${c.ko}`).join(' / ');
}

export interface ChunkSegment {
  start: number;
  end: number;
  ko: string;
}

const fold = (s: string) => s.toLowerCase();

/**
 * 문장 안에서 묶음 위치를 앞에서부터 차례로 찾는다 (겹치지 않게). 못 찾은 묶음은 건너뛴다.
 * 낱말 중간에 걸리지 않게, 묶음 앞뒤가 글자가 아닌 곳에서만 맞춘다.
 */
export function chunkSegments(text: string, chunks: readonly Chunk[]): ChunkSegment[] {
  const t = fold(text);
  const out: ChunkSegment[] = [];
  let from = 0;
  const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);
  for (const c of chunks) {
    const needle = fold(c.text.replace(/[.,!?…]+$/u, '').trim());
    if (!needle) continue;
    let at = t.indexOf(needle, from);
    while (at >= 0 && (isLetter(t[at - 1]) || isLetter(t[at + needle.length]))) at = t.indexOf(needle, at + 1);
    if (at < 0) continue;
    out.push({ start: at, end: at + needle.length, ko: c.ko });
    from = at + needle.length;
  }
  return out;
}
