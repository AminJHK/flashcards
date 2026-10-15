import type { Card, Millis, Note } from '../model/types';
import { wordMemory } from '../stats/memory';
import type { Scheduler } from '../scheduler/types';
import type { Coverage, GlossEntry } from './types';

/**
 * 이야기에 쓸 어휘: 덱의 인도네시아어 단어(id-spoken)를 FSRS 상태로 나눈다.
 * - known: 복습 단계이고 지금 떠올릴 확률이 KNOWN_RECALL 이상
 * - learning: 본 적은 있지만 아직 그만큼은 아님
 * - deckNew: 덱에 있지만 아직 안 나온 단어 (덱 순서 = 빈도순)
 */
export type VocabStatus = 'known' | 'learning' | 'deckNew';

export const KNOWN_RECALL = 0.9;
/** 아는(+배우는) 단어가 이보다 적으면 덱의 다음 단어도 어쩔 수 없을 때 쓰게 한다 */
export const FALLBACK_MIN_FAMILIAR = 300;

export interface VocabEntry {
  noteId: string;
  word: string;
  meaning: string;
  standard: string;
  root: string;
  status: VocabStatus;
  recall?: number;
  /** 덱 안의 순서 (작을수록 먼저 나오는 = 자주 쓰는 단어) */
  order: number;
}

export interface Lexicon {
  entries: VocabEntry[];
  /** 한 단어짜리 형태 → 단어 */
  forms: Map<string, VocabEntry>;
  /** 여러 단어짜리 형태 (예: nggak apa-apa, selamat pagi) */
  phrases: { tokens: string[]; entry: VocabEntry }[];
}

/** 구어·표준 변형. 한 묶음 중 하나가 덱에 있으면 나머지도 같은 단어로 본다 */
export const VARIANTS: readonly string[][] = [
  ['nggak', 'gak', 'ga', 'enggak', 'engga', 'ngga', 'tidak', 'tak'],
  ['udah', 'sudah', 'dah'],
  ['gimana', 'bagaimana'],
  ['aja', 'saja'],
  ['kalo', 'kalau'],
  ['emang', 'memang'],
  ['gitu', 'begitu'],
  ['gini', 'begini'],
  ['tau', 'tahu'],
  ['pengen', 'pengin', 'pingin', 'ingin'],
  ['bener', 'benar'],
  ['liat', 'lihat'],
  ['tapi', 'tetapi'],
  ['cuma', 'cuman', 'hanya'],
  ['dateng', 'datang'],
  ['pake', 'pakai'],
  ['ketemu', 'bertemu'],
  ['entar', 'ntar', 'nanti'],
  ['makasih', 'trims'],
  ['gue', 'gua'],
  ['lo', 'lu'],
];

/** 뒤에 붙는 말 (-nya, -lah …). 떼어도 같은 단어로 본다. 뜻이 바뀌는 접사(-kan, -i, me-, ber- …)는 떼지 않는다 */
const CLITICS = ['nya', 'lah', 'kah', 'pun', 'ku', 'mu'];

const STATUS_RANK: Record<VocabStatus, number> = { known: 3, learning: 2, deckNew: 1 };

export const norm = (s: string) => s.toLowerCase().normalize('NFC').trim();

export function buildLexicon(notes: readonly Note[], cards: readonly Card[], scheduler: Scheduler, now: Millis): Lexicon {
  const byNote = new Map<string, Card[]>();
  for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
  const entries: VocabEntry[] = [];
  const sorted = notes.filter((n) => n.typeId === 'id-spoken' && n.fields.word?.trim()).sort((a, b) => a.createdAt - b.createdAt);
  sorted.forEach((n, i) => {
    const m = wordMemory(byNote.get(n.id) ?? [], scheduler, now);
    if (!m) return; // 카드가 모두 숨겨졌거나 보류됨
    const status: VocabStatus = m.level === 'fresh' ? 'deckNew' : m.level !== 'learning' && (m.recall ?? 0) >= KNOWN_RECALL ? 'known' : 'learning';
    entries.push({ noteId: n.id, word: n.fields.word!.trim(), meaning: n.fields.meaning ?? '', standard: n.fields.standard ?? '', root: n.fields.root ?? '', status, recall: m.recall, order: i });
  });

  const forms = new Map<string, VocabEntry>();
  const phrases: Lexicon['phrases'] = [];
  const put = (form: string, e: VocabEntry) => {
    const f = norm(form);
    if (!f) return;
    if (f.includes(' ')) {
      phrases.push({ tokens: f.split(/\s+/), entry: e });
      return;
    }
    const old = forms.get(f);
    if (!old || STATUS_RANK[e.status] > STATUS_RANK[old.status]) forms.set(f, e);
  };
  for (const e of entries) {
    put(e.word, e);
    for (const s of e.standard.split('/')) put(s, e);
    if (e.root) put(e.root, e);
  }
  // 변형: 묶음 안에서 가장 잘 아는 형태를 기준으로 나머지를 채운다
  for (const group of VARIANTS) {
    const best = group.map((g) => forms.get(g)).filter(Boolean).sort((a, b) => STATUS_RANK[b!.status] - STATUS_RANK[a!.status])[0];
    if (best) for (const g of group) if (!forms.has(g) || STATUS_RANK[best.status] > STATUS_RANK[forms.get(g)!.status]) forms.set(g, best);
  }
  phrases.sort((a, b) => b.tokens.length - a.tokens.length);
  return { entries, forms, phrases };
}

/** 한 단어의 뜻을 찾는다: 그대로 → -nya 같은 붙는 말을 떼고 → 반복형(anak-anak)은 앞부분으로 */
export function lookupForm(lex: Lexicon, token: string): VocabEntry | undefined {
  const t = norm(token);
  const direct = lex.forms.get(t);
  if (direct) return direct;
  for (const c of CLITICS) {
    if (t.endsWith(c) && t.length - c.length >= 3) {
      const hit = lookupForm(lex, t.slice(0, -c.length));
      if (hit) return hit;
    }
  }
  const m = /^([a-z]+)-\1$/.exec(t);
  if (m) return lex.forms.get(m[1]!);
  return undefined;
}

export interface Token {
  text: string;
  start: number;
  end: number;
}

/** 글자(하이픈으로 이은 것 포함)만 단어로 본다. 숫자·문장부호는 뺀다 */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/\p{L}+(?:[-']\p{L}+)*/gu)) out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

export type TokenClass = VocabStatus | 'outside' | 'name';

/** 화면과 비율 계산이 같이 쓰는 단위: 단어 하나 또는 여러 단어 표현 하나 */
export interface Span {
  text: string;
  start: number;
  end: number;
  /** 이 묶음에 든 단어 수 */
  words: number;
  cls: TokenClass;
  entry?: VocabEntry;
}

export function analyzeText(text: string, lex: Lexicon, names: ReadonlySet<string>): Span[] {
  const toks = tokenize(text);
  const out: Span[] = [];
  for (let i = 0; i < toks.length; ) {
    const t = toks[i]!;
    if (names.has(norm(t.text))) {
      out.push({ text: t.text, start: t.start, end: t.end, words: 1, cls: 'name' });
      i++;
      continue;
    }
    const phrase = lex.phrases.find((p) => p.tokens.every((pt, k) => toks[i + k] && norm(toks[i + k]!.text) === pt));
    if (phrase) {
      const last = toks[i + phrase.tokens.length - 1]!;
      out.push({ text: text.slice(t.start, last.end), start: t.start, end: last.end, words: phrase.tokens.length, cls: phrase.entry.status, entry: phrase.entry });
      i += phrase.tokens.length;
      continue;
    }
    const e = lookupForm(lex, t.text);
    out.push({ text: t.text, start: t.start, end: t.end, words: 1, cls: e ? e.status : 'outside', entry: e });
    i++;
  }
  return out;
}

export function measureCoverage(texts: readonly string[], lex: Lexicon, names: ReadonlySet<string>): Coverage {
  const c: Coverage = { tokens: 0, known: 0, learning: 0, deckNew: 0, outside: 0, names: 0, familiar: 1, deckNewWords: [], outsideWords: [] };
  const dn = new Set<string>();
  const out = new Set<string>();
  for (const text of texts) {
    for (const s of analyzeText(text, lex, names)) {
      if (s.cls === 'name') {
        c.names += s.words;
        continue;
      }
      c.tokens += s.words;
      c[s.cls] += s.words;
      if (s.cls === 'deckNew') dn.add(s.entry!.word);
      if (s.cls === 'outside') out.add(norm(s.text));
    }
  }
  c.familiar = c.tokens ? (c.known + c.learning) / c.tokens : 1;
  c.deckNewWords = [...dn];
  c.outsideWords = [...out];
  return c;
}

/**
 * 목표를 지켰는지. 보통은 (덱의 새 단어 + 덱 밖 단어)가 허용치 이하여야 한다.
 * 아는 단어가 적은 초반(fallback)에는 덱의 새 단어는 어쩔 수 없을 때 쓸 수 있고, 덱 밖 단어만 허용치로 센다.
 */
export function meetsTarget(c: Coverage, knownTarget: number, fallback: boolean): boolean {
  if (!c.tokens) return false;
  const allow = 1 - knownTarget + 1e-9;
  if (fallback) return c.outside / c.tokens <= allow;
  return (c.deckNew + c.outside) / c.tokens <= allow;
}

/** 목표에서 벗어난 단어 (고쳐 달라고 할 때 알려 준다) */
export function offendingWords(c: Coverage, fallback: boolean): string[] {
  return fallback ? c.outsideWords : [...c.outsideWords, ...c.deckNewWords];
}

/** 단어를 눌렀을 때 보여 줄 뜻: 덱의 뜻이 먼저, 없으면 생성할 때 받은 뜻 */
export function glossFor(span: Span, glossary: readonly GlossEntry[]): { ko?: string; en?: string; root?: string; inDeck: boolean } {
  const g = findGloss(span.text, glossary);
  if (span.entry) return { ko: span.entry.meaning, en: g?.en, root: span.entry.root || span.entry.standard || g?.root, inDeck: true };
  return { ko: g?.ko, en: g?.en, root: g?.root, inDeck: false };
}

export function findGloss(text: string, glossary: readonly GlossEntry[]): GlossEntry | undefined {
  const t = norm(text);
  const direct = glossary.find((g) => norm(g.text) === t);
  if (direct) return direct;
  for (const c of CLITICS) if (t.endsWith(c) && t.length - c.length >= 3) {
    const hit = glossary.find((g) => norm(g.text) === t.slice(0, -c.length));
    if (hit) return hit;
  }
  return undefined;
}
