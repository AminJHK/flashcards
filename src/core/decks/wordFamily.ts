import type { Note } from '../model/types';

/**
 * 기존 카드의 어근 정보를 이용해 관련 단어를 연결한다.
 * 임의로 접사를 잘라 어근을 추측하지 않는다. 우연히 철자가 비슷한 단어를
 * 연결하지 않기 위해 덱에 적힌 root 또는 실제 기본형만 사용한다.
 */
const SPOKEN_STEMS: Record<string, string> = {
  denger: 'dengar',
  bener: 'benar',
  temen: 'teman',
  seneng: 'senang',
  dapet: 'dapat',
  pake: 'pakai',
  cepet: 'cepat',
  inget: 'ingat',
  laper: 'lapar',
  pedes: 'pedas',
  rame: 'ramai',
  seger: 'segar',
  bosen: 'bosan',
  kesel: 'kesal',
};

export function familyRoot(note: Pick<Note, 'fields'>): string {
  const writtenRoot = (note.fields.root ?? '').trim().toLowerCase();
  const word = (note.fields.word ?? '').trim().toLowerCase();
  const candidate = writtenRoot || word;
  // 여러 단어로 된 표현은 root에 명시된 경우에만 연결한다.
  if (!writtenRoot && !/^[a-z]+$/.test(candidate)) return '';
  if (!/^[a-z]+$/.test(candidate)) return '';
  return SPOKEN_STEMS[candidate] ?? candidate;
}

export interface WordFamily {
  root: string;
  relatives: Note[];
}

/** 같은 덱에 실제로 설치된 카드만 연결한다. 어떤 복습 기록도 변경하지 않는다. */
export function findWordFamily(current: Note, notes: readonly Note[]): WordFamily {
  if (current.typeId !== 'id-spoken') return { root: '', relatives: [] };
  const root = familyRoot(current);
  if (!root) return { root: '', relatives: [] };
  const relatives = notes.filter(
    (candidate) =>
      candidate.id !== current.id &&
      candidate.deckId === current.deckId &&
      candidate.typeId === 'id-spoken' &&
      familyRoot(candidate) === root,
  );
  return { root, relatives };
}
