import { getCardType } from '../cardTypes/registry';
import type { CardType } from '../cardTypes/types';
import type { Scheduler } from '../scheduler/types';
import { withState } from '../scheduler/queue';
import { newId } from './ids';
import type { Card, Deck, Millis, Note } from './types';

export function trimFields(type: CardType, fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of type.fields) out[f.key] = (fields[f.key] ?? '').trim();
  return out;
}

export function createNote(deck: Deck, typeId: string, fields: Record<string, string>, now: Millis, scheduler: Scheduler): { note: Note; cards: Card[] } {
  const type = getCardType(typeId);
  const note: Note = {
    id: newId(),
    deckId: deck.id,
    typeId,
    typeVersion: type.version,
    fields: trimFields(type, fields),
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  return { note, cards: cardsForNote(note, [], deck, now, scheduler) };
}

/**
 * 노트에 필요한 카드를 맞춘다. 없는 템플릿 카드는 만들고, 선택 템플릿은 덱 설정에 따라 숨기거나 보인다.
 * 이미 있는 카드는 기록을 유지한 채 hidden만 바뀐다. 반환값은 새로 만들거나 바뀐 카드만.
 */
export function cardsForNote(note: Note, existing: readonly Card[], deck: Deck, now: Millis, scheduler: Scheduler): Card[] {
  const type = getCardType(note.typeId);
  const changed: Card[] = [];
  type.templates.forEach((tpl, ord) => {
    const hidden = !!tpl.optional && !deck.settings.reverseEnabled;
    const have = existing.find((c) => c.templateId === tpl.id);
    if (have) {
      if (have.hidden !== hidden || have.deckId !== note.deckId) changed.push({ ...have, hidden, deckId: note.deckId });
      return;
    }
    const base: Card = {
      id: newId(),
      noteId: note.id,
      deckId: note.deckId,
      templateId: tpl.id,
      ord,
      hidden,
      suspended: false,
      createdAt: now,
      isNew: true,
      due: now,
      phase: 'new',
      reps: 0,
      lapses: 0,
    };
    changed.push(withState(base, scheduler.initial(now), scheduler.id));
  });
  return changed;
}
