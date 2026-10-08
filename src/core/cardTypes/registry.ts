import { basic } from './basic';
import type { CardType } from './types';
import { zhSentence } from './zhSentence';
import { zhWord } from './zhWord';

/** 새 카드 종류는 모듈을 하나 만들고 여기에 한 줄 추가하면 된다. */
export const CARD_TYPES: readonly CardType[] = [zhWord, basic, zhSentence];

const byId = new Map(CARD_TYPES.map((t) => [t.id, t]));

export function getCardType(id: string): CardType {
  const t = byId.get(id);
  if (!t) throw new Error(`알 수 없는 카드 종류: ${id}`);
  return t;
}

export function hasCardType(id: string): boolean {
  return byId.has(id);
}
