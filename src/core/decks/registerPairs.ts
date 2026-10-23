import type { Note } from '../model/types';
import { SPOKEN_OF } from '../stories/formalForms';

/**
 * 같은 뜻의 구어형·표준형 카드 짝 (예: kasih ↔ memberikan, dengerin ↔ mendengarkan).
 * 1001~1500장에 표준형 카드가 따로 들어와서, 복습할 때 서로를 보여 주려고 만들었다 (2026-10-23).
 * - formalForms.ts의 SPOKEN_OF(표준형 → 구어형)
 * - 카드의 표준형 칸(standard)이 다른 카드의 단어와 같을 때
 * 두 카드의 복습 기록·일정은 따로다 (알아듣는 것과 글에서 읽는 것은 따로 익힌다). 읽기 전용.
 */
export interface RegisterPair {
  note: Note;
  /** 'spoken': 짝이 구어형 / 'written': 짝이 표준형·글말 */
  kind: 'spoken' | 'written';
}

const low = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const standards = (n: Note) => low(n.fields.standard).split('/').map((x) => x.trim()).filter(Boolean);

export function findRegisterPairs(current: Note, notes: readonly Note[]): RegisterPair[] {
  if (current.typeId !== 'id-spoken') return [];
  const word = low(current.fields.word);
  if (!word) return [];
  const out = new Map<string, RegisterPair>();
  for (const n of notes) {
    if (n.id === current.id || n.typeId !== 'id-spoken') continue;
    const other = low(n.fields.word);
    if (!other || other === word) continue;
    // 상대가 구어형: 내가 표준형이고 SPOKEN_OF가 상대를 가리키거나, 상대의 표준형 칸이 나
    if (SPOKEN_OF[word] === other || standards(n).includes(word)) out.set(n.id, { note: n, kind: 'spoken' });
    // 상대가 표준형: 상대의 SPOKEN_OF가 나를 가리키거나, 내 표준형 칸이 상대
    else if (SPOKEN_OF[other] === word || standards(current).includes(other)) out.set(n.id, { note: n, kind: 'written' });
  }
  return [...out.values()];
}
