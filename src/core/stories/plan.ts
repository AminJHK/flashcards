import { DIFFICULTIES, type Coverage, type GlossEntry, type StoryBlock, type StoryCharacter, type StoryDifficulty, type StoryQuestion } from './types';
import { chunkSegments } from './chunks';
import { pickSeed, type StorySeed } from './seeds';
import { analyzeText, FALLBACK_MIN_FAMILIAR, isExtraWord, norm, offendingWords, tokenize, type Lexicon, type VocabEntry } from './vocab';

/** 이야기 하나를 만들 때 AI에게 줄 단어 목록 */
export interface StoryPlan {
  difficulty: StoryDifficulty;
  knownTarget: number;
  /** 마음껏 써도 되는 단어 (아는 + 배우는 중) */
  familiar: VocabEntry[];
  /** 복습 겸 꼭 몇 개 넣을 단어 (배우는 중, 기억이 약한 것 중에서 섞어 고름) */
  reinforce: VocabEntry[];
  /** 어려운 단어 (여러 번 잊은 단어). 이야기에서 두 번 이상 쓴다 */
  focus: VocabEntry[];
  /** 이야기 상황 씨앗 (같은 줄거리 반복을 막는다) */
  seed?: StorySeed;
  /** 이번에 새로 소개할 단어 (덱의 다음 단어 = 빈도순) */
  newWords: VocabEntry[];
  /** 어조 말 (sih, dong …) 중 이미 본 것. 기억이 약한 순. 대화에 자연스럽게 1~3개 섞는다 */
  particles: VocabEntry[];
  /** 아직 안 본 어조 말 하나 (덱의 다음 것). 이야기에서 두 번 이상 소개한다 */
  newParticle?: VocabEntry;
  /** 아는 단어가 적을 때 어쩔 수 없으면 써도 되는 덱 단어 */
  deckPool: VocabEntry[];
  fallback: boolean;
}

export class StoryPlanError extends Error {}

const NEW_WORDS: Record<StoryDifficulty, number> = { easy: 2, normal: 4, challenge: 6 };

/** 최근 이야기에서 쓴 것 (다음 이야기는 피한다) */
export interface StoryHistory {
  /** 최근 몇 개 이야기에서 새 단어로 소개한 말 */
  newWords: readonly string[];
  /** 바로 전 이야기의 복습·어려운 단어 */
  reinforce: readonly string[];
  /** 최근 이야기의 상황 씨앗 id */
  seeds: readonly string[];
}

const NO_HISTORY: StoryHistory = { newWords: [], reinforce: [], seeds: [] };

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 이야기에 쓸 단어를 고른다. 매번 같은 단어를 주면 Gemini가 비슷한 줄거리를 써서(사용자 피드백), 
 * 새 단어는 최근에 소개하지 않은 것을 덱 순서대로, 복습 단어는 약한 단어 중에서 섞어서, 어려운 단어는 따로(FOCUS) 고른다.
 * topicKey가 있으면 상황 씨앗도 하나 고른다.
 */
/**
 * AI에게 보내는 아는 단어 목록의 최대 개수. 예전엔 450개였다 (답이 되풀이되며 멈추던 때 응급조치로 줄임,
 * 진짜 원인은 JSON 형식이었고 줄 형식으로 바꾼 뒤엔 필요 없음). 1500단어는 Gemini에게 몇천 토큰이라 무료 한도·속도에 영향이 거의 없다.
 */
export const KNOWN_LIST_MAX = 1500;

export function planStory(lex: Lexicon, difficulty: StoryDifficulty, history: StoryHistory = NO_HISTORY, topicKey?: string, rng: () => number = Math.random): StoryPlan {
  const allParticles = lex.entries.filter((e) => e.kind === 'particle');
  // 어조 말 덱에 있는 말은 단어 목록에서 뺀다 (구어체 덱에 같은 말이 있어도 어조 말로만 다룬다)
  const particleWords = new Set(allParticles.map((e) => norm(e.word)));
  const words = lex.entries.filter((e) => e.kind !== 'particle' && !particleWords.has(norm(e.word)));
  // 기본 단어·내가 아는 단어를 앞에 둔다 (목록이 길어도 잘리지 않게)
  const familiar = words.filter((e) => e.status !== 'deckNew').sort((a, b) => Number(isExtraWord(b)) - Number(isExtraWord(a)) || a.order - b.order);
  const deckNew = words.filter((e) => e.status === 'deckNew').sort((a, b) => a.order - b.order);
  const particles = allParticles.filter((e) => e.status !== 'deckNew').sort((a, b) => (a.recall ?? 0) - (b.recall ?? 0));
  const newParticle = allParticles.filter((e) => e.status === 'deckNew').sort((a, b) => a.order - b.order)[0];
  // 기본 단어·내가 아는 단어는 덱 단어 수에 넣지 않는다 (덱이 없거나 아주 작으면 여전히 덱을 먼저 추가하게)
  const deckFamiliar = familiar.filter((e) => !isExtraWord(e)).length;
  if (deckFamiliar + deckNew.length < 40) throw new StoryPlanError('인도네시아어 단어가 너무 적어요. 먼저 인도네시아어 덱을 추가해 주세요');
  const fallback = deckFamiliar < FALLBACK_MIN_FAMILIAR;
  const seen = (list: readonly string[]) => new Set(list.map(norm));
  // 새 단어: 덱의 다음 단어 24개 중 최근 이야기에서 소개하지 않은 것부터 (모자라면 소개했던 것도)
  const recentNew = seen(history.newWords);
  const window = deckNew.slice(0, 24);
  const n = NEW_WORDS[difficulty];
  const newWords = [...window.filter((e) => !recentNew.has(norm(e.word))), ...window.filter((e) => recentNew.has(norm(e.word)))].slice(0, n).sort((a, b) => a.order - b.order);
  // 어려운 단어(최대 3)와 복습 단어(최대 6): 바로 전 이야기에서 쓴 것은 쉬게 하고 약한 것 중에서 섞어 고른다
  const lastReview = seen(history.reinforce);
  const rested = <T extends VocabEntry>(list: T[]) => (list.filter((e) => !lastReview.has(norm(e.word))).length >= 3 ? list.filter((e) => !lastReview.has(norm(e.word))) : list);
  const weakFirst = (a: VocabEntry, b: VocabEntry) => (a.recall ?? 0) - (b.recall ?? 0);
  const focus = shuffle(rested(familiar.filter((e) => e.hard).sort(weakFirst).slice(0, 10)), rng).slice(0, 3);
  const focusSet = new Set(focus);
  const reinforce = shuffle(rested(familiar.filter((e) => e.status === 'learning' && !focusSet.has(e)).sort(weakFirst).slice(0, 15)), rng).slice(0, 6);
  return {
    difficulty,
    knownTarget: DIFFICULTIES[difficulty].known,
    familiar: familiar.slice(0, KNOWN_LIST_MAX),
    reinforce,
    focus,
    seed: topicKey ? pickSeed(topicKey, history.seeds, rng) : undefined,
    newWords,
    particles,
    newParticle,
    deckPool: fallback ? deckNew.slice(newWords.length, newWords.length + 300) : [],
    fallback,
  };
}

const form = (e: VocabEntry) => (e.standard && norm(e.standard) !== norm(e.word) ? `${e.word}(=${e.standard})` : e.word);

export const STORY_TOPICS: { key: string; label: string; en: string }[] = [
  { key: 'free', label: '자유', en: 'any everyday situation' },
  { key: 'daily', label: '일상', en: 'daily life at home or with friends' },
  { key: 'hospital', label: '병원', en: 'a hospital ward (a nurse, patients, family)' },
  { key: 'travel', label: '여행', en: 'travelling in Indonesia (Bali, Jakarta, transport, hotels)' },
  { key: 'food', label: '음식', en: 'food, a warung, ordering and cooking' },
  { key: 'friends', label: '친구', en: 'friends, dating, a small misunderstanding' },
];

export function systemPrompt(): string {
  return [
    'You write short graded reading stories for a Korean adult learning everyday spoken Indonesian (Jakarta-style but widely understood: aku/kamu, nggak, udah, gimana).',
    'Write natural conversational Indonesian, not textbook Indonesian. Keep sentences short.',
    'The story is a sequence of blocks: narration, dialogue lines and comprehension questions placed between story parts (never all at the end).',
    'Korean is used for translations, questions and explanations. English is used only in glossary meanings.',
    'Write the story in the exact line format the user gives (one item per line, fields separated by " | "). No JSON, no markdown, no extra commentary. Finish with a line containing only END.',
  ].join(' ');
}

export function userPrompt(plan: StoryPlan, topic: string): string {
  const unknownPct = Math.round((1 - plan.knownTarget) * 100);
  const lines = [
    `Topic: ${topic}.`,
    'MOST IMPORTANT: a natural, fun and logically consistent story. Story quality comes before vocabulary: never force a listed word into a line where a native speaker would not say it. Prefer what a Jakarta native would really say in that moment.',
    'Story: 2 or 3 recurring characters with Indonesian first names, a clear beginning, middle and ending, and a small surprise, joke or twist. Avoid a generic "vocabulary demo" plot.',
    'Consistency: keep the time of day, the place and the order of events consistent. Characters only know what they saw or were told, and every action has a clear reason. A change of place or a twist is fine, but it must be set up earlier and make sense inside the story.',
    'Never leave the key thing of the plot unnamed (e.g. a lost key must be called kunci at least once). If the plot needs a word that is in none of the lists, use it and add a GLOSS line for it; that is better than hiding it with vague words.',
    'Dialogue uses spoken forms consistently (nggak, udah, emang, gimana, ketemu rather than tidak, sudah, memang, bagaimana, ditemukan); narration may be a little more neutral. End with a small payoff (a joke, a reaction or a punchline), not a flat summary sentence.',
    'First plan, then write: before TITLE, write 3 to 5 PLAN lines in English (the learner does not see them): the characters and what each one wants and knows; where and when it happens; cause → main event → result; how the twist is set up. Then write the story so it follows the PLAN exactly.',
    plan.seed ? `Situation (start from this idea and adapt it to the topic; do not build the plot around finding objects on the floor): ${plan.seed.en}.` : '',
    'Length: 120 to 180 Indonesian words in total across narration and dialogue, in 10 to 18 short lines. Use narration sparingly.',
    '',
    'VOCABULARY RULES (very important, they are checked automatically by counting every word occurrence):',
    `- Build the story from the KNOWN WORDS below. At least ${Math.round(plan.knownTarget * 100)}% of all word occurrences must be KNOWN WORDS (character names do not count).`,
    '- You may use the forms in brackets, e.g. "nyari(=mencari)" means both nyari and mencari are known. Adding -nya, -lah, -kah, -ku or -mu to a known word is fine. Other affixes (me-, ber-, di-, -kan, -i) make a NEW word.',
    `- NEW WORDS: use the ones that fit the story naturally, once or twice each, where the situation makes the meaning guessable. Leave out any new word that would make a line unnatural (it comes back in a later story). Apart from them, avoid any word that is not listed.`,
    plan.focus.length || plan.reinforce.length
      ? `- ${[plan.focus.length ? 'FOCUS WORDS (hard for the learner, prefer these)' : '', plan.reinforce.length ? 'REVIEW WORDS (still being learned)' : ''].filter(Boolean).join(' and ')}: use the ones that fit naturally, once or twice each. There is no minimum; it is fine to leave some out.`
      : '',
    plan.particles.length || plan.newParticle
      ? '- PARTICLES are short spoken particles (sih, dong, deh, kok, kan, lho …). Use them naturally in the dialogue lines only (never in narration), where a native speaker really would say them: ' +
        [plan.particles.length ? 'use 1 to 3 of the PARTICLE WORDS, preferring the first ones' : '', plan.newParticle ? 'use the NEW PARTICLE at least twice in different lines so the reader can feel its meaning' : ''].filter(Boolean).join(', and ') +
        '. They never count against the unknown-word limit.'
      : '',
    plan.fallback
      ? `- The learner knows few words yet. If a sentence is impossible with KNOWN WORDS, you may use DECK WORDS. Words outside all lists must stay under ${unknownPct}% of word occurrences.`
      : `- Apart from the NEW WORDS, words that are not KNOWN WORDS must stay under ${unknownPct}% of word occurrences.`,
    '- GLOSS lines: only for words or expressions that are in none of the lists below (the app already knows the meanings of listed words). Usually 0 to 8. Multi-word entries are fine for expressions like "nggak apa-apa".',
    '',
    `KNOWN WORDS: ${plan.familiar.map(form).join(', ')}`,
    plan.reinforce.length ? `REVIEW WORDS: ${plan.reinforce.map(form).join(', ')}` : '',
    plan.focus.length ? `FOCUS WORDS: ${plan.focus.map(form).join(', ')}` : '',
    plan.particles.length ? `PARTICLE WORDS (known, weakest first): ${plan.particles.map(form).join(', ')}` : '',
    plan.newParticle ? `NEW PARTICLE: ${plan.newParticle.word}` : '',
    `NEW WORDS: ${plan.newWords.map(form).join(', ') || '(none)'}`,
    plan.fallback && plan.deckPool.length ? `DECK WORDS (only when necessary): ${plan.deckPool.map(form).join(', ')}` : '',
    '',
    'QUESTIONS: 4 to 6 questions in Korean, placed right after the part of the story they ask about. Use at least three types:',
    '- CHOICE: a comprehension question with exactly 3 options and one clearly correct answer.',
    '- TF: a Korean statement about the story, true or false.',
    '- GAP: copy one story line exactly, replace one word or short phrase with ___, and give 3 Indonesian options (the removed text is correct).',
    '- MATCH: 3 to 5 Indonesian words or expressions that appear in the story, each with its Korean meaning.',
    'Every question except MATCH needs a short Korean explanation.',
    '',
    'FORMAT (one item per line, in story order; answer numbers start at 1; speaker is a character id or narrator):',
    'PLAN: <English planning note>',
    'TITLE: <Indonesian title>',
    'TITLE_KO: <Korean title>',
    'CHARACTER: a | <name>',
    'CHARACTER: b | <name>',
    'PROPER: <place names and other proper nouns, comma separated>',
    'LINE: narrator | <Indonesian> | <Korean translation>',
    'LINE: a | <Indonesian> | <Korean translation>',
    'CHOICE: <Korean question> | <option 1> / <option 2> / <option 3> | <correct number> | <Korean explanation>',
    'TF: <Korean statement> | true | <Korean explanation>',
    'GAP: <story line with ___> | <option 1> / <option 2> / <option 3> | <correct number> | <Korean explanation>',
    'MATCH: <word> = <Korean> / <word> = <Korean> / <word> = <Korean>',
    'GLOSS: <word or expression> | <Korean meaning> | <English meaning> | <root>',
    'END',
  ];
  return lines.filter((l) => l !== '').join('\n');
}

export interface StoryDraft {
  title: string;
  titleKo: string;
  characters: StoryCharacter[];
  properNouns: string[];
  blocks: StoryBlock[];
  glossary: GlossEntry[];
}

/** 비교용: 소문자, 문장부호·여러 칸 공백 정리 */
const flat = (s: string) =>
  norm(s)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function cleanOptions(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const o = v.map(str).filter(Boolean);
  if (o.length < 2 || o.length > 4 || new Set(o.map(flat)).size !== o.length) return undefined;
  return o;
}

/**
 * AI가 준 이야기(parseStoryText로 읽은 것)를 검사한다.
 * - 틀린 질문(정답 번호가 없음, 빈칸 문장이 이야기에 없음, 짝 맞추기 단어가 이야기에 없음 등)은 빼고 problems에 적는다.
 * - fatal이면 쓸 수 없는 결과 (줄이나 질문이 너무 적음).
 */
export function parseDraft(raw: unknown): { draft?: StoryDraft; problems: string[]; blocking: string[]; fatal: boolean } {
  const problems: string[] = [];
  if (!raw || typeof raw !== 'object') return { problems: ['이야기 형식이 아니에요'], blocking: ['이야기 형식이 아니에요'], fatal: true };
  const r = raw as Record<string, unknown>;
  const chars: StoryCharacter[] = (Array.isArray(r.characters) ? r.characters : [])
    .map((c, i) => ({ id: str((c as Record<string, unknown>)?.id) || `c${i}`, name: str((c as Record<string, unknown>)?.name), color: i % 6 }))
    .filter((c) => c.name)
    .slice(0, 4);
  const ids = new Set(chars.map((c) => c.id));
  const blocks: StoryBlock[] = [];
  const lineTexts: string[] = [];
  for (const b of Array.isArray(r.blocks) ? r.blocks : []) {
    const x = (b ?? {}) as Record<string, unknown>;
    const type = str(x.type);
    if (type === 'line') {
      const text = str(x.text);
      if (!text) continue;
      const speaker = ids.has(str(x.speaker)) ? str(x.speaker) : chars.find((c) => norm(c.name) === norm(str(x.speaker)))?.id ?? 'narrator';
      // 의미 단위: 실제로 문장 안에 있는 것만 (없으면 화면이 단어 단위로 보여 준다)
      const chunks = (Array.isArray(x.chunks) ? x.chunks : [])
        .map((c) => ({ text: str((c as Record<string, unknown>)?.text), ko: str((c as Record<string, unknown>)?.ko) }))
        .filter((c) => c.text && c.ko);
      const found = chunkSegments(text, chunks).length;
      blocks.push({ kind: 'line', speaker, text, ko: str(x.ko), ...(found ? { chunks } : {}) });
      lineTexts.push(text);
      continue;
    }
    const q = toQuestion(type, x, problems);
    if (q) blocks.push(q);
  }
  // 질문은 그 내용이 나온 뒤에 있어야 한다: 빈칸·짝 맞추기는 앞에 나온 줄만 보고 확인
  const checked: StoryBlock[] = [];
  const seen: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'line') {
      seen.push(flat(b.text));
      checked.push(b);
      continue;
    }
    const before = seen.join(' \n ');
    if (b.kind === 'gap') {
      const filled = flat(b.sentence.replace('___', b.options[b.answer]!));
      if (!seen.some((s) => s === filled || s.includes(filled))) {
        problems.push(`빈칸 문제의 문장이 앞의 이야기와 같지 않아요: "${b.sentence}"`);
        continue;
      }
    }
    if (b.kind === 'match') {
      const missing = b.pairs.filter((p) => !` ${before} `.includes(` ${flat(p.id)} `) && !before.includes(flat(p.id)));
      if (missing.length) {
        problems.push(`짝 맞추기 단어가 앞의 이야기에 없어요: ${missing.map((p) => p.id).join(', ')}`);
        continue;
      }
    }
    if (!seen.length) {
      problems.push('첫 줄보다 앞에 질문이 있어요');
      continue;
    }
    checked.push(b);
  }
  const lines = checked.filter((b) => b.kind === 'line').length;
  const questions = checked.length - lines;
  const words = lineTexts.reduce((n, t) => n + tokenize(t).length, 0);
  // 여기까지는 질문 하나를 빼면 되는 작은 문제. 아래는 이야기 전체를 다시 써야 하는 문제 (blocking)
  const blocking: string[] = [];
  if (lines < 6) blocking.push(`줄이 너무 적어요 (${lines}줄)`);
  if (questions < 3) blocking.push(`쓸 수 있는 질문이 너무 적어요 (${questions}개)`);
  if (chars.length < 2) blocking.push('등장인물이 2명보다 적어요');
  if (words < 80 || words > 260) blocking.push(`길이가 맞지 않아요 (${words}단어, 120~180단어 필요)`);
  problems.push(...blocking);
  const glossary: GlossEntry[] = (Array.isArray(r.glossary) ? r.glossary : [])
    .map((g) => {
      const x = (g ?? {}) as Record<string, unknown>;
      return { text: str(x.text), ko: str(x.ko), en: str(x.en) || undefined, root: str(x.root) || undefined };
    })
    .filter((g) => g.text && g.ko);
  // 질문이 모자란 건 고쳐 달라고 하면 되지만, 줄이 너무 적으면 이야기로 쓸 수 없다
  const fatal = lines < 6 || !str(r.title);
  return {
    draft: {
      title: str(r.title) || '이야기',
      titleKo: str(r.titleKo),
      characters: chars,
      properNouns: (Array.isArray(r.properNouns) ? r.properNouns : []).map(str).filter(Boolean),
      blocks: checked,
      glossary,
    },
    problems,
    blocking,
    fatal,
  };
}

function toQuestion(type: string, x: Record<string, unknown>, problems: string[]): StoryQuestion | undefined {
  const explain = str(x.explain);
  if (type === 'choice') {
    const options = cleanOptions(x.options);
    const answer = Number(x.answer);
    if (!str(x.prompt) || !options || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      problems.push('내용 질문의 선택지나 정답 번호가 맞지 않아요');
      return undefined;
    }
    return { kind: 'choice', prompt: str(x.prompt), options, answer, explain };
  }
  if (type === 'truefalse') {
    if (!str(x.statement) || typeof x.answerTrue !== 'boolean') {
      problems.push('맞다/틀리다 질문에 문장이나 정답이 없어요');
      return undefined;
    }
    return { kind: 'truefalse', statement: str(x.statement), answer: x.answerTrue, explain };
  }
  if (type === 'gap') {
    const sentence = str(x.sentence).replace(/_{2,}/g, '___');
    const options = cleanOptions(x.options);
    const answer = Number(x.answer);
    if (sentence.split('___').length !== 2 || !options || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      problems.push('빈칸 문제의 빈칸이나 정답이 맞지 않아요');
      return undefined;
    }
    return { kind: 'gap', sentence, options, answer, explain };
  }
  if (type === 'match') {
    const pairs = (Array.isArray(x.pairs) ? x.pairs : [])
      .map((p) => ({ id: str((p as Record<string, unknown>)?.id), ko: str((p as Record<string, unknown>)?.ko) }))
      .filter((p) => p.id && p.ko);
    if (pairs.length < 3 || pairs.length > 5 || new Set(pairs.map((p) => flat(p.id))).size !== pairs.length || new Set(pairs.map((p) => p.ko)).size !== pairs.length) {
      problems.push('짝 맞추기는 서로 다른 3~5쌍이어야 해요');
      return undefined;
    }
    return { kind: 'match', pairs };
  }
  problems.push(`모르는 블록 종류: ${type || '(없음)'}`);
  return undefined;
}

/** 다시 써 달라고 할 때의 요청 (지난 결과의 문제와 실제 비율을 알려 준다) */
export function revisionPrompt(plan: StoryPlan, coverage: Coverage | undefined, problems: readonly string[]): string {
  const parts = ['Revise the story you just wrote and write the whole story again in the same line format, ending with END.'];
  if (coverage) {
    const words = offendingWords(coverage, plan.fallback);
    parts.push(
      `Measured: ${Math.round(coverage.familiar * 100)}% of ${coverage.tokens} word occurrences are known words; the target is ${Math.round(plan.knownTarget * 100)}%.`,
      words.length ? `Replace these words with KNOWN WORDS where possible (keep at most the planned new words): ${words.join(', ')}.` : '',
      'When you replace words, rewrite the whole sentence so it still sounds natural. You may drop listed words that do not fit.',
    );
  }
  if (problems.length) parts.push(`Fix these problems (they are written in Korean): ${problems.join(' / ')}`);
  parts.push('Keep the same characters and plot if they are fine, and keep the story logically consistent (time, place, who knows what, cause and result).');
  return parts.filter(Boolean).join('\n');
}

/**
 * 고른 단어 중 이야기에 실제로 나온 것만 (기록용). AI가 어울리지 않아 뺀 단어는 기록하지 않아서
 * 다음 이야기에서 쉬지 않고 다시 후보가 된다.
 */
export function usedWords(entries: readonly VocabEntry[], blocks: readonly StoryBlock[], lex: Lexicon, names: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const t of storyTexts(blocks)) for (const sp of analyzeText(t, lex, names)) if (sp.entry) found.add(norm(sp.entry.word));
  return entries.filter((e) => found.has(norm(e.word))).map((e) => e.word);
}

/** 이야기 안의 모든 인도네시아어 줄 */
export function storyTexts(blocks: readonly StoryBlock[]): string[] {
  return blocks.filter((b) => b.kind === 'line').map((b) => (b as { text: string }).text);
}

/** 비율 계산에서 뺄 이름 (인물 이름, 고유명사) */
export function nameSet(characters: readonly StoryCharacter[], properNouns: readonly string[]): Set<string> {
  const s = new Set<string>();
  for (const n of [...characters.map((c) => c.name), ...properNouns]) for (const t of tokenize(n)) s.add(norm(t.text));
  return s;
}
