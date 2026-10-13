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
