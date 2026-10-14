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
 * - 이 덱에 그 꾸러미 단어가 하나도 없으면 없음 (다른 덱).
 * - 이미 받은 단어 중 꾸러미에서 가장 뒤에 있는 것 다음부터만 본다. 그래서 사용자가 지운 단어는 다시 넣지 않는다.
 */
export function packAdditions(pack: Pack, notes: readonly Note[]): Pack['notes'] {
  const tag = `pack:${pack.id}`;
  const keyOf = (typeId: string, fields: Record<string, string>) => `${typeId}|${getCardType(typeId).duplicateKey(fields)}`;
  const have = new Set(notes.filter((n) => n.tags.includes(tag)).map((n) => keyOf(n.typeId, n.fields)));
  if (!have.size) return [];
  let last = -1;
  pack.notes.forEach((pn, i) => {
    if (have.has(keyOf(pn.typeId, pn.fields))) last = i;
  });
  return pack.notes.slice(last + 1).filter((pn) => !have.has(keyOf(pn.typeId, pn.fields)));
}
