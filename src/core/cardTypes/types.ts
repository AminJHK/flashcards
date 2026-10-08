import type { AutoplaySide, Deck, Lang } from '../model/types';

/**
 * 카드 종류 시스템 (docs/DESIGN.md §5).
 *
 * 카드 종류 하나 = 이 인터페이스를 구현한 모듈 하나. 화면은 카드 종류의 내부를 모르고,
 * view()가 돌려주는 Block 목록만 그린다. 그래서 새 카드 종류를 추가할 때 화면 코드를 고칠 필요가 없다.
 *
 * 규칙: id와 필드 key는 한 번 정하면 바꾸지 않는다. 구조가 바뀌면 version을 올리고 migrate를 쓴다.
 */

/** 필드의 언어. 'deck.front' / 'deck.back'이면 덱 설정의 언어를 따른다. */
export type FieldLang = Lang | 'deck.front' | 'deck.back';

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  lang?: FieldLang;
  /** 입력칸 모양 */
  input: 'hanzi' | 'latin' | 'text' | 'sentence' | 'memo';
  placeholder?: string;
  /** 다른 필드에서 자동으로 채워지는 필드면 표시 (예: 병음) */
  autoFrom?: string;
}

/**
 * 답하는 방식.
 * - reveal: 떠올린 뒤 정답을 본다
 * - produce: 답을 직접 쓰거나 말한 다음 정답과 비교한다 (작문, 말하기)
 */
export type AnswerMode = 'reveal' | 'produce';

export interface TemplateDef {
  id: string;
  label: string;
  /** true면 덱 설정의 "역방향 카드" 스위치로 켜고 끈다 */
  optional?: boolean;
  answer: AnswerMode;
}

export type BlockSize = 'front' | 'back';

/** 카드 화면을 이루는 블록. 화면(UI)은 이 종류만 알면 어떤 카드든 그릴 수 있다. */
export type Block =
  | { kind: 'hanzi'; text: string; size: BlockSize }
  | { kind: 'pinyin'; text: string }
  | { kind: 'word'; text: string; size: BlockSize; lang: Lang }
  | { kind: 'meaning'; text: string; size: BlockSize }
  | { kind: 'sentence'; text: string; lang: Lang; emphasis: 'main' | 'sub' }
  | { kind: 'prompt'; text: string }
  | { kind: 'divider' }
  | { kind: 'memo'; text: string }
  /** 소리만 먼저 들려준다. 화면에는 재생 버튼과 "글자 보기"가 나온다 (듣기 카드) */
  | { kind: 'listen'; text: string; lang: Lang };

export interface Speech {
  text: string;
  lang: Lang;
}

export interface CardView {
  front: Block[];
  back: Block[];
  tts: { front: Speech[]; back: Speech[] };
  /** answer가 'produce'일 때 비교할 정답 */
  expected?: Speech;
  /** 덱의 자동 재생 설정 대신 이 카드가 정하는 재생 시점 (듣기 카드는 항상 앞면) */
  autoplay?: AutoplaySide;
}

export interface ViewContext {
  fields: Record<string, string>;
  deck: Deck;
  ttsOverride?: Record<string, string>;
}

/** 순수 함수로 주입받는 도우미. 무거운 라이브러리(병음 사전)를 core에 직접 넣지 않기 위해서다. */
export interface DeriveDeps {
  pinyin?: (text: string, mode: 'word' | 'sentence') => string;
}

export interface CardType {
  id: string;
  version: number;
  name: string;
  /** 좁은 버튼에 들어갈 짧은 이름 */
  shortName: string;
  description: string;
  fields: FieldDef[];
  /** 발음을 읽는 대표 필드. 다음자 교정(ttsOverride)도 이 필드에 건다 */
  ttsField: string;
  templates: TemplateDef[];
  view(templateId: string, ctx: ViewContext): CardView;
  /** 중복 검사 기준. 빈 문자열이면 검사하지 않는다 */
  duplicateKey(fields: Record<string, string>): string;
  /** 목록에 보여줄 제목과 부제 */
  summary(fields: Record<string, string>): { title: string; sub: string };
  /** 필드 하나가 바뀌었을 때 자동으로 채울 다른 필드 (예: 한자 → 병음) */
  derive?(changedKey: string, fields: Record<string, string>, deps: DeriveDeps): Record<string, string>;
  /** 이전 version의 필드를 현재 구조로 옮긴다 */
  migrate?(fromVersion: number, fields: Record<string, string>): Record<string, string>;
}

export function resolveLang(lang: FieldLang | undefined, deck: Deck): Lang {
  if (lang === 'deck.front') return deck.settings.langs.front;
  if (lang === 'deck.back') return deck.settings.langs.back;
  return lang ?? 'ko-KR';
}

export function ttsText(key: string, ctx: ViewContext): string {
  return (ctx.ttsOverride?.[key] || ctx.fields[key] || '').trim();
}

export function missingRequired(type: CardType, fields: Record<string, string>): FieldDef[] {
  return type.fields.filter((f) => f.required && !(fields[f.key] ?? '').trim());
}
