import type { Id, Millis } from '../model/types';

/**
 * AI 읽기 이야기 (듀오링고 Stories 같은 대화형 읽기). 내 덱의 단어와 FSRS 기억 상태로 만든다.
 * 이야기를 읽는 것은 복습(ReviewLog)이 아니다. 읽기 기록은 StoryProgress에만 남긴다.
 */

export type StoryDifficulty = 'easy' | 'normal' | 'challenge';

/** 난이도별 아는 단어 비율 목표 (단어 등장 횟수 기준) */
export const DIFFICULTIES: Record<StoryDifficulty, { label: string; known: number }> = {
  easy: { label: '쉬움', known: 0.98 },
  normal: { label: '보통', known: 0.95 },
  challenge: { label: '도전', known: 0.9 },
};

export interface StoryCharacter {
  id: string;
  name: string;
  /** 아바타 색 번호 (0~5) */
  color: number;
}

/** 내레이션(speaker = 'narrator') 또는 인물의 대사 */
export interface StoryLine {
  kind: 'line';
  speaker: string;
  text: string;
  /** 한국어 번역 (단어를 눌렀을 때 "이 문장에서의 뜻") */
  ko: string;
}

export interface ChoiceQuestion {
  kind: 'choice';
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface TrueFalseQuestion {
  kind: 'truefalse';
  statement: string;
  answer: boolean;
  explain: string;
}

/** 이야기 속 문장 하나에서 단어·표현 하나를 ___로 비운 것 */
export interface GapQuestion {
  kind: 'gap';
  sentence: string;
  options: string[];
  answer: number;
  explain: string;
}

/** 인도네시아어 ↔ 한국어 짝 맞추기 */
export interface MatchQuestion {
  kind: 'match';
  pairs: { id: string; ko: string }[];
}

export type StoryQuestion = ChoiceQuestion | TrueFalseQuestion | GapQuestion | MatchQuestion;
export type StoryBlock = StoryLine | StoryQuestion;

/** 생성할 때 같이 받아 둔 단어 뜻 (누를 때마다 AI를 부르지 않는다) */
export interface GlossEntry {
  text: string;
  ko: string;
  en?: string;
  root?: string;
}

/** 단어 등장 횟수 기준의 실제 비율 (이름은 빼고 센다) */
export interface Coverage {
  tokens: number;
  known: number;
  learning: number;
  /** 덱에 있지만 아직 안 배운 단어 */
  deckNew: number;
  /** 덱에 없는 단어 */
  outside: number;
  names: number;
  /** (known + learning) / tokens */
  familiar: number;
  deckNewWords: string[];
  outsideWords: string[];
}

export interface Story {
  id: Id;
  createdAt: Millis;
  lang: 'id-ID';
  difficulty: StoryDifficulty;
  topic?: string;
  title: string;
  titleKo: string;
  characters: StoryCharacter[];
  properNouns: string[];
  blocks: StoryBlock[];
  glossary: GlossEntry[];
  coverage: Coverage;
  /** 아는 단어가 적어서 덱의 다음 단어를 섞었는지 */
  usedDeckFallback: boolean;
  /** 만들 때의 어휘 상태 (아는/배우는/덱의 새 단어 수) */
  snapshot: { known: number; learning: number; deckNew: number };
  model: string;
  attempts: number;
  /** 목표 비율을 못 맞췄을 때 등 */
  warning?: string;
}

export interface StoryProgress {
  storyId: Id;
  /** 보여 준 블록 수 (1부터) */
  position: number;
  /** 블록 번호 → 처음 답에서 맞혔는지 */
  answers: Record<number, boolean>;
  completedAt?: Millis;
  readCount: number;
  updatedAt: Millis;
}
