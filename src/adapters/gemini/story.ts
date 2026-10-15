import { newId } from '../../core/model/ids';
import { nameSet, parseDraft, revisionPrompt, STORY_SCHEMA, STORY_TOPICS, storyTexts, systemPrompt, userPrompt, type StoryDraft, type StoryPlan } from '../../core/stories/plan';
import type { Coverage, Story } from '../../core/stories/types';
import { measureCoverage, meetsTarget, type Lexicon } from '../../core/stories/vocab';
import { GeminiError, generate } from './api';

/** 이야기(글) 모델 (선호 순서). 'latest' 별칭이라 새 모델을 따라간다. */
export const STORY_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
/** 처음 + 고쳐 달라는 요청 2번까지 */
export const MAX_ATTEMPTS = 3;

export type StoryStep = { attempt: number; stage: 'writing' | 'checking' | 'revising' | 'waiting' };

interface Turn {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/** 서버가 붐빌 때 같은 모델에 다시 시도하는 기다림 (밀리초). 그래도 안 되면 다음 모델로 */
export const BUSY_WAITS = [2_000, 6_000];

async function ask(models: readonly string[], key: string, contents: Turn[], sleep: (ms: number) => Promise<void>, onBusy?: () => void): Promise<{ text: string; model: string }> {
  let last: unknown;
  for (const model of models) {
    for (let busy = 0; busy <= BUSY_WAITS.length; busy++) {
      try {
        const r = await generate(
          model,
          key,
          {
            systemInstruction: { parts: [{ text: systemPrompt() }] },
            contents,
            generationConfig: { temperature: 0.9, responseMimeType: 'application/json', responseSchema: STORY_SCHEMA },
          },
          90_000,
        );
        const text = (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
        if (!text.trim()) throw new GeminiError('Gemini가 빈 답을 보냈어요', 'empty');
        return { text, model };
      } catch (e) {
        last = e;
        if (e instanceof GeminiError && e.kind === 'busy' && busy < BUSY_WAITS.length) {
          onBusy?.();
          await sleep(BUSY_WAITS[busy]!);
          continue;
        }
        // 모델이 없거나 한도·붐빔·빈 답이면 다음 모델로
        if (!(e instanceof GeminiError) || (e.kind !== 'model' && e.kind !== 'quota' && e.kind !== 'empty' && e.kind !== 'busy')) throw e;
        break;
      }
    }
  }
  throw last;
}

interface Candidate {
  draft: StoryDraft;
  coverage: Coverage;
  ok: boolean;
  problems: string[];
}

/**
 * 이야기를 만든다: 쓰기 → 앱이 직접 검사(단어 비율·질문) → 모자라면 고쳐 달라고 다시 요청 (최대 MAX_ATTEMPTS번).
 * 끝까지 목표를 못 맞추면 가장 나은 결과를 warning과 함께 돌려준다. 쓸 수 있는 결과가 하나도 없으면 오류.
 */
export async function createStory(opts: {
  lex: Lexicon;
  plan: StoryPlan;
  topicKey: string;
  key: string;
  models?: readonly string[];
  onStep?: (s: StoryStep) => void;
  now?: number;
  /** 테스트용: 기다림을 건너뛴다 */
  sleep?: (ms: number) => Promise<void>;
}): Promise<Story> {
  const { lex, plan } = opts;
  const topic = STORY_TOPICS.find((t) => t.key === opts.topicKey) ?? STORY_TOPICS[0]!;
  const contents: Turn[] = [{ role: 'user', parts: [{ text: userPrompt(plan, topic.en) }] }];
  let best: Candidate | undefined;
  let model = '';
  let attempts = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    opts.onStep?.({ attempt, stage: attempt === 1 ? 'writing' : 'revising' });
    const res = await ask(opts.models ?? STORY_MODELS, opts.key, contents, opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), () => opts.onStep?.({ attempt, stage: 'waiting' }));
    model = res.model;
    opts.onStep?.({ attempt, stage: 'checking' });
    let raw: unknown;
    try {
      raw = JSON.parse(res.text);
    } catch {
      raw = undefined;
    }
    const parsed = parseDraft(raw);
    let coverage: Coverage | undefined;
    if (parsed.draft && !parsed.fatal) {
      coverage = measureCoverage(storyTexts(parsed.draft.blocks), lex, nameSet(parsed.draft.characters, parsed.draft.properNouns));
      const ok = meetsTarget(coverage, plan.knownTarget, plan.fallback) && parsed.problems.length === 0;
      const cand: Candidate = { draft: parsed.draft, coverage, ok, problems: parsed.problems };
      if (!best || score(cand, plan) > score(best, plan)) best = cand;
      if (ok) break;
    }
    if (attempt < MAX_ATTEMPTS) {
      contents.push({ role: 'model', parts: [{ text: res.text }] }, { role: 'user', parts: [{ text: revisionPrompt(plan, coverage, parsed.problems) }] });
    }
  }
  if (!best) throw new GeminiError('이야기를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요', 'other');
  const target = Math.round(plan.knownTarget * 100);
  const actual = Math.round(best.coverage.familiar * 100);
  const warning = best.ok
    ? undefined
    : !meetsTarget(best.coverage, plan.knownTarget, plan.fallback)
      ? `목표는 아는 단어 ${target}%였는데 실제로는 ${actual}%예요. 아는 단어가 더 늘면 맞추기 쉬워져요. "도전"을 고르면 모르는 단어를 더 허용해요.`
      : `몇 가지를 고치지 못했어요: ${best.problems.join(' / ')}`;
  return {
    id: newId(),
    createdAt: opts.now ?? Date.now(),
    lang: 'id-ID',
    difficulty: plan.difficulty,
    topic: topic.key,
    ...best.draft,
    coverage: best.coverage,
    usedDeckFallback: plan.fallback && best.coverage.deckNew > 0,
    snapshot: {
      known: lex.entries.filter((e) => e.status === 'known').length,
      learning: lex.entries.filter((e) => e.status === 'learning').length,
      deckNew: lex.entries.filter((e) => e.status === 'deckNew').length,
    },
    model,
    attempts,
    warning,
  };
}

/** 목표를 지킨 것 > 비율이 높은 것 > 문제가 적은 것 */
function score(c: Candidate, plan: StoryPlan): number {
  return (meetsTarget(c.coverage, plan.knownTarget, plan.fallback) ? 1000 : 0) + c.coverage.familiar * 100 - c.problems.length;
}
