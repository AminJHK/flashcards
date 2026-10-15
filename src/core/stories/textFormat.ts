/**
 * 이야기를 주고받는 줄 형식. JSON 스키마(구조화 출력)로 받았더니 Gemini가 첫 줄도 쓰기 전에
 * 같은 글을 되풀이하다 멈추는 일이 잦아서, 한 줄에 하나씩 쓰는 단순한 글로 바꿨다.
 * 줄 단위라 중간에 끊겨도 끝까지 온 줄은 그대로 쓸 수 있다.
 *
 * TITLE: 인도네시아어 제목
 * TITLE_KO: 한국어 제목
 * CHARACTER: a | Budi
 * PROPER: Jakarta
 * LINE: a | 인도네시아어 문장 | 한국어 번역        (말하는 사람 id 또는 narrator)
 * CHOICE: 한국어 질문 | 선택지1 / 선택지2 / 선택지3 | 정답 번호(1부터) | 설명
 * TF: 한국어 문장 | true 또는 false | 설명
 * GAP: ___가 들어간 이야기 문장 | 선택지1 / 선택지2 / 선택지3 | 정답 번호 | 설명
 * MATCH: kopi = 커피 / teh = 차 / nasi = 밥
 * GLOSS: 단어나 표현 | 한국어 뜻 | 영어 뜻 | 원형
 * END
 */

/** parseDraft가 읽는 모양 (예전 JSON과 같다) */
export interface RawStory {
  title?: string;
  titleKo?: string;
  characters: { id: string; name: string }[];
  properNouns: string[];
  blocks: Record<string, unknown>[];
  glossary: { text: string; ko: string; en?: string; root?: string }[];
}

const split = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim());

/** 정답: 번호(1부터)가 보통이지만 선택지 글자를 그대로 쓴 경우도 받아 준다 */
function answerIndex(v: string | undefined, options: string[]): number {
  const t = (v ?? '').trim();
  const n = Number(t.replace(/[^\d]/g, ''));
  if (/^\D*\d+\D*$/.test(t) && n >= 1 && n <= options.length) return n - 1;
  const i = options.findIndex((o) => o.toLowerCase() === t.toLowerCase());
  return i >= 0 ? i : -1;
}

/** 받은 글을 이야기 모양으로. complete: END 줄까지 왔는지 */
export function parseStoryText(text: string): { raw: RawStory; complete: boolean } {
  const raw: RawStory = { characters: [], properNouns: [], blocks: [], glossary: [] };
  let complete = false;
  const all = text.replace(/\r\n/g, '\n').split('\n');
  // 마지막 줄은 끊겨서 덜 왔을 수 있다 (END가 없으면 버린다)
  const endless = !all.some((l) => /^\W*END\W*$/i.test(l.trim()));
  const lines = endless ? all.slice(0, -1) : all;
  for (const rawLine of lines) {
    // 앞의 "- ", "1. ", "**" 같은 꾸밈은 무시
    const l = rawLine.replace(/\*\*/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (/^END\W*$/i.test(l)) {
      complete = true;
      break;
    }
    const m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(l);
    if (!m) continue;
    const tag = m[1]!.toUpperCase();
    const body = m[2]!.trim();
    const f = split(body, /\s*\|\s*/);
    if (tag === 'TITLE') raw.title = body;
    else if (tag === 'TITLE_KO') raw.titleKo = body;
    else if (tag === 'CHARACTER' && f[1]) raw.characters.push({ id: f[0]!, name: f[1] });
    else if (tag === 'PROPER') raw.properNouns.push(...split(body, /\s*[,/|]\s*/).filter(Boolean));
    else if (tag === 'LINE' && f.length >= 2) raw.blocks.push({ type: 'line', speaker: f.length >= 3 ? f[0] : 'narrator', text: f.length >= 3 ? f[1] : f[0], ko: f.length >= 3 ? f.slice(2).join(' | ') : f[1] });
    else if (tag === 'CHOICE' || tag === 'GAP') {
      const options = split(f[1] ?? '', /\s+\/\s+/).filter(Boolean);
      raw.blocks.push({ type: tag === 'CHOICE' ? 'choice' : 'gap', [tag === 'CHOICE' ? 'prompt' : 'sentence']: f[0], options, answer: answerIndex(f[2], options), explain: f.slice(3).join(' | ') });
    } else if (tag === 'TF') {
      const a = (f[1] ?? '').toLowerCase();
      raw.blocks.push({ type: 'truefalse', statement: f[0], answerTrue: /^(true|benar|o|맞)/.test(a) ? true : /^(false|salah|x|틀)/.test(a) ? false : undefined, explain: f.slice(2).join(' | ') });
    } else if (tag === 'MATCH') {
      const pairs = split(body, /\s*[/|]\s*/)
        .map((p) => split(p, /\s*=\s*/))
        .filter((p) => p[0] && p[1])
        .map((p) => ({ id: p[0]!, ko: p.slice(1).join(' = ') }));
      raw.blocks.push({ type: 'match', pairs });
    } else if (tag === 'GLOSS' && f[1]) raw.glossary.push({ text: f[0]!, ko: f[1], en: f[2] || undefined, root: f[3] || undefined });
  }
  return { raw, complete };
}

/** 이야기를 줄 형식으로 (테스트·예시용) */
export function formatStoryText(story: Partial<Omit<RawStory, 'blocks'>> & { blocks?: readonly unknown[] }): string {
  const s = { characters: [], properNouns: [], glossary: [], ...story, blocks: (story.blocks ?? []).filter(Boolean) as Record<string, unknown>[] } as RawStory;
  const out = [`TITLE: ${s.title ?? ''}`, `TITLE_KO: ${s.titleKo ?? ''}`];
  for (const c of s.characters) out.push(`CHARACTER: ${c.id} | ${c.name}`);
  if (s.properNouns.length) out.push(`PROPER: ${s.properNouns.join(', ')}`);
  for (const b of s.blocks) {
    const opts = (b.options as string[] | undefined)?.join(' / ') ?? '';
    const ans = typeof b.answer === 'number' ? b.answer + 1 : '';
    if (b.type === 'line') out.push(`LINE: ${b.speaker as string} | ${b.text as string} | ${b.ko as string}`);
    else if (b.type === 'choice') out.push(`CHOICE: ${b.prompt as string} | ${opts} | ${ans} | ${(b.explain as string) ?? ''}`);
    else if (b.type === 'gap') out.push(`GAP: ${b.sentence as string} | ${opts} | ${ans} | ${(b.explain as string) ?? ''}`);
    else if (b.type === 'truefalse') out.push(`TF: ${b.statement as string} | ${String(b.answerTrue)} | ${(b.explain as string) ?? ''}`);
    else if (b.type === 'match') out.push(`MATCH: ${(b.pairs as { id: string; ko: string }[]).map((p) => `${p.id} = ${p.ko}`).join(' / ')}`);
  }
  for (const g of s.glossary) out.push(`GLOSS: ${g.text} | ${g.ko} | ${g.en ?? ''} | ${g.root ?? ''}`);
  out.push('END');
  return out.join('\n');
}
