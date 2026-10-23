import type { Card, Millis, Note } from '../model/types';
import { isHard, wordMemory } from '../stats/memory';
import type { Scheduler } from '../scheduler/types';
import { BASIC_WORDS } from './basicWords';
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
  /** 여러 번 잊어버린 "어려운 단어" (core/stats/memory.ts isHard) */
  hard?: boolean;
  /**
   * 'particle': 어조 말(sih, dong …). 예문마다 노트가 있어도 말 하나로 묶인 항목이다.
   * 'basic': 덱에 없지만 기본 단어라 아는 단어로 친다 (basicWords.ts). 'mine': 읽기에서 사용자가 "이미 알아요"를 누른 단어.
   * basic·mine은 노트가 없다 (noteId '').
   */
  kind?: 'particle' | 'basic' | 'mine';
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

/** 덱 밖이지만 아는 단어로 치는 항목 (기본 단어, 사용자가 "이미 알아요"를 누른 단어) */
export const isExtraWord = (e: VocabEntry): boolean => e.kind === 'basic' || e.kind === 'mine';

/** myKnown: 사용자가 읽기에서 "이미 알아요"를 누른 단어 (Settings.knownWords) */
export function buildLexicon(notes: readonly Note[], cards: readonly Card[], scheduler: Scheduler, now: Millis, myKnown: readonly string[] = []): Lexicon {
  const byNote = new Map<string, Card[]>();
  for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
  const entries: VocabEntry[] = [];
  const sorted = notes.filter((n) => n.typeId === 'id-spoken' && n.fields.word?.trim()).sort((a, b) => a.createdAt - b.createdAt);
  sorted.forEach((n, i) => {
    const m = wordMemory(byNote.get(n.id) ?? [], scheduler, now);
    if (!m) return; // 카드가 모두 숨겨졌거나 보류됨
    const status: VocabStatus = m.level === 'fresh' ? 'deckNew' : m.level !== 'learning' && (m.recall ?? 0) >= KNOWN_RECALL ? 'known' : 'learning';
    entries.push({ noteId: n.id, word: n.fields.word!.trim(), meaning: n.fields.meaning ?? '', standard: n.fields.standard ?? '', root: n.fields.root ?? '', status, recall: m.recall, ...(isHard(m) ? { hard: true } : {}), order: i });
  });
  addParticles(entries, notes, byNote, scheduler, now, sorted.length);
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
    // 같은 말이 어조 말 덱에도 있으면 (같은 상태일 때) 어조 말 쪽을 쓴다: 느낌 설명이 더 쓸모 있고, 이야기에서 따로 다룬다
    const better = !old || STATUS_RANK[e.status] > STATUS_RANK[old.status] || (e.kind === 'particle' && old.kind !== 'particle' && STATUS_RANK[e.status] >= STATUS_RANK[old.status]);
    if (better) forms.set(f, e);
  };
  for (const e of entries) {
    put(e.word, e);
    for (const s of e.standard.split('/')) put(s, e);
    if (e.root) put(e.root, e);
  }
  // 덱에 없는 기본 단어·내가 아는 단어: 덱에 같은 형태가 있으면 덱 쪽을 쓴다
  const extras: [string, string, 'basic' | 'mine'][] = [...myKnown.map((w) => [w, '', 'mine'] as [string, string, 'mine']), ...BASIC_WORDS.map(([w, m]) => [w, m, 'basic'] as [string, string, 'basic'])];
  for (const [w, meaning, kind] of extras) {
    const f = norm(w);
    if (!f || forms.has(f) || phrases.some((p) => p.tokens.join(' ') === f)) continue;
    const e: VocabEntry = { noteId: '', word: f, meaning, standard: '', root: '', status: 'known', kind, order: entries.length };
    entries.push(e);
    put(f, e);
  }
  // 변형: 묶음 안에서 가장 잘 아는 형태를 기준으로 나머지를 채운다
  for (const group of VARIANTS) {
    const best = group.map((g) => forms.get(g)).filter(Boolean).sort((a, b) => STATUS_RANK[b!.status] - STATUS_RANK[a!.status])[0];
    if (best) for (const g of group) if (!forms.has(g) || STATUS_RANK[best.status] > STATUS_RANK[forms.get(g)!.status]) forms.set(g, best);
  }
  phrases.sort((a, b) => b.tokens.length - a.tokens.length);
  return { entries, forms, phrases };
}

/**
 * 어조 말(id-particle)은 예문마다 노트가 있으므로 말(word)별로 하나로 묶는다.
 * - 한 번도 안 본 말이면 deckNew
 * - 본 예문이 둘 이상(또는 전부)이고 모두 복습 단계에서 평균 떠올릴 확률이 KNOWN_RECALL 이상이면 known, 아니면 learning
 * - 읽기에서는 이 말들을 "자연스럽게 섞어 쓸 말"로 따로 다룬다 (planStory)
 */
function addParticles(entries: VocabEntry[], notes: readonly Note[], byNote: Map<string, Card[]>, scheduler: Scheduler, now: Millis, base: number): void {
  const groups = new Map<string, { notes: Note[]; mems: NonNullable<ReturnType<typeof wordMemory>>[] }>();
  const sorted = notes.filter((n) => n.typeId === 'id-particle' && n.fields.word?.trim()).sort((a, b) => a.createdAt - b.createdAt);
  for (const n of sorted) {
    const m = wordMemory(byNote.get(n.id) ?? [], scheduler, now);
    if (!m) continue;
    const key = norm(n.fields.word!);
    const g = groups.get(key) ?? { notes: [], mems: [] };
    g.notes.push(n);
    g.mems.push(m);
    groups.set(key, g);
  }
  let i = 0;
  for (const g of groups.values()) {
    const seen = g.mems.filter((m) => m.level !== 'fresh');
    let status: VocabStatus = 'deckNew';
    let recall: number | undefined;
    if (seen.length) {
      recall = seen.reduce((sum, m) => sum + (m.recall ?? 0), 0) / seen.length;
      const solid = seen.every((m) => m.level !== 'learning') && recall >= KNOWN_RECALL && (seen.length >= 2 || seen.length === g.mems.length);
      status = solid ? 'known' : 'learning';
    }
    const first = g.notes[0]!;
    entries.push({ noteId: first.id, word: first.fields.word!.trim(), meaning: first.fields.meaning ?? '', standard: '', root: '', status, recall, kind: 'particle', order: base + i++ });
  }
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

/** planned: 이번 이야기에서 소개하려고 고른 새 단어 (norm). 이 단어들은 introduced로 따로 센다 */
export function measureCoverage(texts: readonly string[], lex: Lexicon, names: ReadonlySet<string>, planned: ReadonlySet<string> = new Set()): Coverage {
  const c: Coverage = { tokens: 0, known: 0, learning: 0, deckNew: 0, outside: 0, names: 0, familiar: 1, deckNewWords: [], outsideWords: [], introduced: 0 };
  const dn = new Set<string>();
  const out = new Set<string>();
  for (const text of texts) {
    for (const s of analyzeText(text, lex, names)) {
      if (s.cls === 'name') {
        c.names += s.words;
        continue;
      }
      c.tokens += s.words;
      // 어조 말은 내용어가 아니고 이야기에 꼭 섞어 쓰게 하는 말이라, 아직 안 배운 말이어도 비율에서는 아는 말로 센다
      const cls = s.entry?.kind === 'particle' ? 'known' : s.cls;
      c[cls] += s.words;
      if (cls === 'deckNew') {
        if (planned.has(norm(s.entry!.word))) c.introduced! += s.words;
        else dn.add(s.entry!.word);
      }
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
 * 이번 이야기에서 소개하라고 고른 새 단어(introduced)는 빼고 센다: 넣으라고 해 놓고 세면
 * (예: 쉬움 98%에 새 단어 2개 × 2번 = 160단어 중 2.5%) 목표를 맞출 수 없어서 매번 다시 쓰게 됐다 (2026-10-22).
 * 아는 단어가 적은 초반(fallback)에는 덱의 새 단어는 어쩔 수 없을 때 쓸 수 있고, 덱 밖 단어만 허용치로 센다.
 */
export function meetsTarget(c: Coverage, knownTarget: number, fallback: boolean): boolean {
  if (!c.tokens) return false;
  const allow = 1 - knownTarget + 1e-9;
  if (fallback) return c.outside / c.tokens <= allow;
  return (c.deckNew - (c.introduced ?? 0) + c.outside) / c.tokens <= allow;
}

/** 목표에서 벗어난 단어 (고쳐 달라고 할 때 알려 준다) */
export function offendingWords(c: Coverage, fallback: boolean): string[] {
  return fallback ? c.outsideWords : [...c.outsideWords, ...c.deckNewWords];
}

/** 단어를 눌렀을 때 보여 줄 뜻: 덱의 뜻이 먼저, 없으면 생성할 때 받은 뜻 */
export function glossFor(span: Span, glossary: readonly GlossEntry[]): { ko?: string; en?: string; root?: string; inDeck: boolean } {
  const g = findGloss(span.text, glossary);
  if (span.entry) return { ko: span.entry.meaning || g?.ko, en: g?.en, root: span.entry.root || span.entry.standard || g?.root, inDeck: !isExtraWord(span.entry) };
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
