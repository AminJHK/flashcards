import type { DeckSettings } from '../model/types';

/** 앱에 들어 있는 "준비된 덱". 버튼 하나로 덱과 단어가 한꺼번에 만들어진다. */
export interface PackNote {
  typeId: string;
  fields: Record<string, string>;
  tags: string[];
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  deckName: string;
  deckSettings: DeckSettings;
  notes: PackNote[];
}

/** 장면(태그)별로 묶어서 쓰기 위한 도우미 */
export function section(tag: string, notes: Omit<PackNote, 'tags'>[]): PackNote[] {
  return notes.map((n) => ({ ...n, tags: [tag] }));
}

/** 간호사가 할 말: 한국어 → 중국어 (말하기·쓰기) */
export function say(ko: string, zh: string, memo = ''): Omit<PackNote, 'tags'> {
  return { typeId: 'zh-sentence', fields: { ko, zh, memo } };
}

/** 환자의 말: 듣고 알아듣기 */
export function hear(zh: string, ko: string, memo = ''): Omit<PackNote, 'tags'> {
  return { typeId: 'zh-listen', fields: { zh, ko, memo } };
}
