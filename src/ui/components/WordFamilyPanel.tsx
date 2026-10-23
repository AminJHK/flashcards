import { useMemo, useState } from 'react';
import type { Card, Note } from '../../core/model/types';
import { findWordFamily } from '../../core/decks/wordFamily';
import { Icon } from './Icon';

/** 정답을 본 후에만 표시하는 어근 가족. 복습 상태를 읽기만 한다. */
export function WordFamilyPanel({ current, notes, cards }: { current: Note; notes: readonly Note[]; cards: readonly Card[] }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const family = useMemo(() => findWordFamily(current, notes), [current, notes]);
  const statuses = useMemo(() => {
    const out = new Map<string, boolean>();
    for (const card of cards) {
      if (!card.hidden && !card.suspended) out.set(card.noteId, (out.get(card.noteId) ?? false) || !card.isNew);
    }
    return out;
  }, [cards]);

  if (!family.relatives.length) return null;
  const visible = showAll ? family.relatives : family.relatives.slice(0, 4);
  const selected = family.relatives.find((n) => n.id === selectedId);
  const info = selected?.fields;

  return (
    <section className="word-family" aria-label="같은 어근 단어">
      <button type="button" className="word-family-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <span>같은 어근 · <strong lang="id">{family.root}</strong> <span className="word-family-count">{family.relatives.length}개</span></span>
        <Icon name="chevronDown" size={18} />
      </button>
      {expanded && (
        <div className="word-family-content">
          {visible.map((related) => {
            const active = selectedId === related.id;
            return (
              <button
                type="button"
                key={related.id}
                className="word-family-item"
                aria-expanded={active}
                onClick={() => setSelectedId(active ? undefined : related.id)}
              >
                <span className="word-family-name" lang="id">{related.fields.word}</span>
                <span className="word-family-meaning">{related.fields.meaning}</span>
                <span className="word-family-status">{statuses.get(related.id) ? '학습함' : '새 단어'}</span>
              </button>
            );
          })}
          {family.relatives.length > 4 && (
            <button type="button" className="word-family-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? '접기' : `나머지 ${family.relatives.length - 4}개 더 보기`}
            </button>
          )}
          {info && selected && (
            <div className="word-family-detail" aria-live="polite">
              <strong lang="id">{info.word}</strong>
              <span>{info.meaning}</span>
              {info.standard && info.standard.toLowerCase() !== (info.word ?? '').toLowerCase() && (
                <span className="word-family-muted">표준형: <span lang="id">{info.standard}</span></span>
              )}
              {info.register && <span className="word-family-muted">사용역: {info.register}</span>}
              {info.example && <span lang="id">{info.example}</span>}
              {info.exampleKo && <span className="word-family-muted">{info.exampleKo}</span>}
            </div>
          )}
          <p className="word-family-hint">관련 단어를 누르면 뜻과 예문을 볼 수 있어요. 복습 기록에는 영향 없어요.</p>
        </div>
      )}
    </section>
  );
}
