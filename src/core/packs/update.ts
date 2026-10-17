import { getCardType } from '../cardTypes/registry';
import type { Note } from '../model/types';
import type { Pack } from './types';

/** 준비된 덱이 고쳐졌을 때, 이미 넣어 둔 단어에 반영할 내용 */
export interface PackChange {
  noteId: string;
  fields: Record<string, string>;
}

/**
 * 이미 설치한 덱의 단어 중, 덱 꾸러미에서 내용이 바뀐 것을 찾는다.
 * - 같은 꾸러미에서 온 단어만 (태그 pack:<id>), 같은 카드 종류·같은 단어(duplicateKey)끼리 맞춘다.
 * - 사용자가 직접 고친 단어(updatedAt ≠ createdAt)는 건드리지 않는다.
 * - 꾸러미에 적힌 칸만 바꾸고, 나머지 칸(자동 병음 등)은 그대로 둔다. 복습 기록과는 상관없다.
 */
export function packChanges(pack: Pack, notes: readonly Note[]): PackChange[] {
  const tag = `pack:${pack.id}`;
  const byKey = new Map(pack.notes.map((pn) => [`${pn.typeId}|${getCardType(pn.typeId).duplicateKey(pn.fields)}`, pn]));
  const out: PackChange[] = [];
  for (const n of notes) {
    if (!n.tags.includes(tag) || n.updatedAt !== n.createdAt) continue;
    const pn = byKey.get(`${n.typeId}|${getCardType(n.typeId).duplicateKey(n.fields)}`);
    if (!pn) continue;
    const changed = Object.entries(pn.fields).some(([k, v]) => (n.fields[k] ?? '') !== v.trim());
    if (changed) out.push({ noteId: n.id, fields: { ...n.fields, ...Object.fromEntries(Object.entries(pn.fields).map(([k, v]) => [k, v.trim()])) } });
  }
  return out;
}

/**
 * 준비된 덱에 단어가 늘었을 때, 이미 설치한 덱에 더 넣을 단어를 찾는다.
 * - 이 덱(notes)에 그 꾸러미 단어가 하나도 없으면 없음 (다른 덱). 받은 단어인지는 모든 덱(everywhere)에서 본다.
 * - 이미 받은 단어 중 꾸러미에서 가장 뒤에 있는 것 다음부터만 본다. 그래서 사용자가 지운 단어는 다시 넣지 않는다.
 */
export function packAdditions(pack: Pack, notes: readonly Note[], everywhere: readonly Note[] = notes): Pack['notes'] {
  const tag = `pack:${pack.id}`;
  const keyOf = (typeId: string, fields: Record<string, string>) => `${typeId}|${getCardType(typeId).duplicateKey(fields)}`;
  if (!notes.some((n) => n.tags.includes(tag))) return [];
  // 다른 덱으로 옮긴 단어(예: 연결어·표현 덱)도 "이미 받은 단어"로 센다. 안 그러면 옮긴 단어가 새 단어로 다시 들어온다
  const have = new Set(everywhere.filter((n) => n.tags.includes(tag)).map((n) => keyOf(n.typeId, n.fields)));
  let last = -1;
  pack.notes.forEach((pn, i) => {
    if (have.has(keyOf(pn.typeId, pn.fields))) last = i;
  });
  return pack.notes.slice(last + 1).filter((pn) => !have.has(keyOf(pn.typeId, pn.fields)));
}

/**
 * 꾸러미에는 있는데 지금 어느 덱에도 없는 단어 (지운 단어). 이미 있는 말은 뺀다:
 * 같은 카드 종류·같은 단어(duplicateKey)가 어느 덱에든 있으면 있는 것으로 보고,
 * 인도네시아어 구어 단어는 단어 철자만 같아도 있는 것으로 본다. skipWords의 말(다른 덱이 맡은 말)도 뺀다.
 */
export function packMissing(pack: Pack, allNotes: readonly Note[], skipWords: ReadonlySet<string> = new Set()): Pack['notes'] {
  const keyOf = (typeId: string, fields: Record<string, string>) => `${typeId}|${getCardType(typeId).duplicateKey(fields)}`;
  const have = new Set(allNotes.map((n) => keyOf(n.typeId, n.fields)));
  const haveWords = new Set(allNotes.filter((n) => n.typeId === 'id-spoken').map((n) => (n.fields.word ?? '').trim().toLowerCase()));
  return pack.notes.filter((pn) => {
    if (have.has(keyOf(pn.typeId, pn.fields))) return false;
    if (pn.typeId === 'id-spoken') {
      const w = (pn.fields.word ?? '').trim().toLowerCase();
      if (haveWords.has(w) || skipWords.has(w)) return false;
    }
    return true;
  });
}
