import { useMemo } from 'react';
import type { Card, Note } from '../../core/model/types';
import { findRegisterPairs } from '../../core/decks/registerPairs';

/** 정답 화면: 같은 뜻의 구어형·표준형 짝 카드 (읽기 전용, 복습 기록과 상관없음) */
export function RegisterPairs({ current, notes, cards }: { current: Note; notes: readonly Note[]; cards: readonly Card[] }) {
  const pairs = useMemo(() => findRegisterPairs(current, notes), [current, notes]);
  if (!pairs.length) return null;
  const studied = (id: string) => cards.some((c) => c.noteId === id && !c.isNew && !c.hidden);
  return (
    <section className="register-pairs" aria-label="같은 뜻의 구어형·표준형">
      {pairs.map(({ note, kind }) => (
        <div key={note.id} className="register-pair">
          <span className="register-pair-label">{kind === 'spoken' ? '말할 때는' : '글·뉴스에서는'}</span>
          <strong lang="id">{note.fields.word}</strong>
          <span className="register-pair-status">{studied(note.id) ? '학습함' : '새 단어'}</span>
        </div>
      ))}
    </section>
  );
}
