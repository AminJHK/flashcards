import { newId } from '../../core/model/ids';
import { nameSet, parseDraft, revisionPrompt, STORY_TOPICS, storyTexts, systemPrompt, userPrompt, type StoryDraft, type StoryPlan } from '../../core/stories/plan';
import type { Coverage, Story } from '../../core/stories/types';
import { parseStoryText } from '../../core/stories/textFormat';
import { measureCoverage, meetsTarget, type Lexicon } from '../../core/stories/vocab';
import { GeminiError, generate, generateStream, type StreamResult } from './api';

/** 이야기(글) 모델 (선호 순서). 'latest' 별칭이라 새 모델을 따라간다. */
export const STORY_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
/** 처음 + 고쳐 달라는 요청 2번까지 */
export const MAX_ATTEMPTS = 3;

/** pct: 0~1. 쓰는 중에는 지금까지 받은 글자 수로 어림한 값 (실제 길이는 이야기마다 달라서 어림이다) */
export type StoryStep = { attempt: number; stage: 'writing' | 'checking' | 'revising' | 'retrying' | 'waiting'; pct?: number };

/** 이야기 글의 보통 길이 (글자 수). 진행률을 어림하는 데만 쓴다 */
export const EXPECTED_CHARS = 5000;
/** 이보다 길면 같은 말을 반복하는 등 고장 난 답으로 보고 끊는다 (보통은 4~7천 자) */
export const MAX_CHARS = 20_000;

/** END 줄까지 왔는지 (연결이 안 닫혀도 여기서 끝낸다) */
export function isCompleteStory(text: string): boolean {
  return /^\W*END\W*$/im.test(text);
}

/** 진행률 어림: 글자가 올수록 오르되 100%에는 닿지 않는다 (길이를 미리 알 수 없어서) */
export function progressOf(chars: number): number {
  return Math.min(0.97, 1 - Math.exp(-chars / EXPECTED_CHARS * 1.6));
}

/** 끝부분 200자가 바로 앞 6천 자 안에 3번 넘게 나오면 같은 글을 되풀이하는 것으로 본다 */
export function looksLooping(text: string): boolean {
  if (text.length < 1500) return false;
  const tail = text.slice(-200);
  const win = text.slice(-6000);
  let n = 0;
  for (let at = win.indexOf(tail); at >= 0; at = win.indexOf(tail, at + 1)) if (++n >= 3) return true;
  return false;
}

interface Turn {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/** 서버가 붐빌 때 같은 모델에 다시 시도하는 기다림 (밀리초). 그래도 안 되면 다음 모델로 */
export const BUSY_WAITS = [2_000, 6_000];

async function ask(
  models: readonly string[],
  key: string,
  contents: Turn[],
  sleep: (ms: number) => Promise<void>,
  hooks: { onBusy?: () => void; onProgress?: (chars: number) => void; stream: boolean },
): Promise<StreamResult & { model: string }> {
  let last: unknown;
  for (const model of models) {
    for (let busy = 0; busy <= BUSY_WAITS.length; busy++) {
      const variant = thinkingFor(model);
      try {
        const body = {
          systemInstruction: { parts: [{ text: systemPrompt() }] },
          contents,
          // temperature는 기본값 그대로 (Gemini 3은 낮추면 같은 말을 반복할 수 있다고 안내한다)
          generationConfig: {
            // 생각하는 데 쓴 토큰도 이 상한에 들어간다 (8192로 했더니 생각에 다 써서 이야기가 몇 줄에서 끊겼다).
            // 끝없이 길어지는 건 looksLooping·MAX_CHARS로 따로 끊는다
            maxOutputTokens: 32768,
            ...(THINKING[variant] ? { thinkingConfig: THINKING[variant] } : {}),
          },
        };
        let out: StreamResult;
        if (hooks.stream) out = await generateStream(model, key, body, hooks.onProgress ?? (() => {}), { isComplete: isCompleteStory, maxChars: MAX_CHARS, isRunaway: looksLooping });
        else {
          const r = await generate(model, key, body, 180_000);
          const c = r.candidates?.[0];
          out = { text: (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''), finishReason: c?.finishReason, usage: r.usageMetadata };
        }
        if (!out.text.trim()) throw new GeminiError('Gemini가 빈 답을 보냈어요', 'empty');
        return { ...out, model };
      } catch (e) {
        last = e;
        // 400(잘못된 요청)이면 생각하는 시간 설정 때문일 수 있다: 다음 방식으로 바꿔 같은 모델로 다시 (기다림 횟수는 쓰지 않는다)
        if (e instanceof GeminiError && e.kind === 'other' && /\(400/.test(e.message) && variant < THINKING.length - 1) {
          thinkingIndex.set(model, variant + 1);
          busy--;
          continue;
        }
        if (e instanceof GeminiError && e.kind === 'busy' && busy < BUSY_WAITS.length) {
          hooks.onBusy?.();
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

/**
 * 생각하는 시간(thinking)을 줄이면 훨씬 빠르다. 모델 세대마다 받는 설정이 달라서 차례로 시도하고,
 * 그 모델이 받아들인 방식을 기억한다 (Gemini 2.5: thinkingBudget, Gemini 3 Flash: minimal, Gemini 3 Pro: low, 다 안 되면 설정 없이).
 */
export const THINKING: readonly (Record<string, unknown> | undefined)[] = [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, undefined];
const thinkingIndex = new Map<string, number>();
const thinkingFor = (model: string) => thinkingIndex.get(model) ?? 0;
/** 테스트용 */
export function resetThinkingMemory(): void {
  thinkingIndex.clear();
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
  /** 테스트용: false면 조금씩 받지 않고 한 번에 받는다 */
  stream?: boolean;
}): Promise<Story> {
  const { lex, plan } = opts;
  const topic = STORY_TOPICS.find((t) => t.key === opts.topicKey) ?? STORY_TOPICS[0]!;
  const contents: Turn[] = [{ role: 'user', parts: [{ text: userPrompt(plan, topic.en) }] }];
  let best: Candidate | undefined;
  let model = '';
  let attempts = 0;
  /** 시도마다 왜 못 썼는지 (실패하면 화면에 그대로 보여 줘서 원인을 알 수 있게) */
  const notes: string[] = [];
  let retry = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const stage: StoryStep['stage'] = attempt === 1 ? 'writing' : retry ? 'retrying' : 'revising';
    opts.onStep?.({ attempt, stage });
    let lastPct = -1;
    let res: Awaited<ReturnType<typeof ask>>;
    try {
      res = await ask(opts.models ?? STORY_MODELS, opts.key, contents, opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), {
        stream: opts.stream ?? true,
        onBusy: () => opts.onStep?.({ attempt, stage: 'waiting' }),
        onProgress: (chars) => {
          const pct = progressOf(chars);
          if (Math.round(pct * 100) === lastPct) return;
          lastPct = Math.round(pct * 100);
          opts.onStep?.({ attempt, stage, pct });
        },
      });
    } catch (e) {
      // 고쳐 쓰다가 실패해도 앞에서 받은 이야기는 버리지 않는다
      if (best) {
        attempts = attempt - 1;
        break;
      }
      if (notes.length && e instanceof Error) e.message = `${e.message} (앞의 시도: ${notes.join(' / ')})`;
      throw e;
    }
    model = res.model;
    opts.onStep?.({ attempt, stage: 'checking', pct: 1 });
    const { raw, complete } = parseStoryText(res.text);
    // END까지 안 왔으면 끊긴 답을 살려 쓴 것
    const salvaged = !complete;
    const why = [
      `${res.text.length}자`,
      res.ended === 'tooLong' ? '되풀이·너무 길어서 끊음' : '',
      res.finishReason && res.finishReason !== 'STOP' ? `끝난 이유 ${res.finishReason}` : '',
      res.usage?.thoughtsTokenCount ? `생각 ${res.usage.thoughtsTokenCount}토큰` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const parsed = parseDraft(raw);
    let coverage: Coverage | undefined;
    if (parsed.draft && !parsed.fatal) {
      coverage = measureCoverage(storyTexts(parsed.draft.blocks), lex, nameSet(parsed.draft.characters, parsed.draft.properNouns));
      const ok = meetsTarget(coverage, plan.knownTarget, plan.fallback) && parsed.problems.length === 0;
      const cand: Candidate = { draft: parsed.draft, coverage, ok, problems: parsed.problems };
      if (!best || score(cand, plan) > score(best, plan)) best = cand;
      if (ok) break;
      if (salvaged) {
        // 끊긴 답을 살려 쓴 것: 다시 고쳐 달라고 해도 또 끊기기 쉬우니 여기서 멈춘다
        break;
      }
    } else {
      notes.push(`${attempt}번째: ${parsed.problems.join(', ') || '쓸 수 없는 답'}${complete ? '' : ', 끝(END)까지 안 옴'} [${why}]`);
    }
    retry = !parsed.draft || parsed.fatal;
    if (attempt < MAX_ATTEMPTS && retry) {
      // 끊기거나 깨진 답: 그 답은 대화에 넣지 않고 처음 요청을 짧게 다시 한다
      contents.splice(0, contents.length, { role: 'user', parts: [{ text: `${userPrompt(plan, topic.en)}\n\nIMPORTANT: the previous answer was broken or unusable. Follow the line format exactly, keep it short (120-180 words, at most 18 LINE lines) and finish with END.` }] });
      continue;
    }
    if (attempt < MAX_ATTEMPTS) {
      contents.push({ role: 'model', parts: [{ text: res.text }] }, { role: 'user', parts: [{ text: revisionPrompt(plan, coverage, parsed.problems) }] });
    }
  }
  if (!best) throw new GeminiError(`쓸 수 있는 이야기가 오지 않았어요 (${notes.join(' / ')}). 잠시 뒤에 다시 시도해 주세요`, 'other');
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
