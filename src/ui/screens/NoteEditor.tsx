import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_TYPES, getCardType } from '../../core/cardTypes/registry';
import { missingRequired, resolveLang, type CardType, type DeriveDeps, type FieldDef } from '../../core/cardTypes/types';
import type { Deck, Note } from '../../core/model/types';
import { loadPinyin } from '../../adapters/pinyin/pinyin';
import { db } from '../../adapters/storage/db';
import { addNote, deleteNote, restoreNote, updateNote } from '../../adapters/storage/repo';
import { speak } from '../../adapters/tts/webSpeech';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useDecks, useSettings } from '../hooks';
import { langName } from '../langs';
import { go } from '../router';
import { useToast } from '../toast';

const LAST_DECK = 'flashcards:lastDeck';
const emptyFields = (t: CardType) => Object.fromEntries(t.fields.map((f) => [f.key, '']));

function rememberedDeck(): string | null {
  try {
    return localStorage.getItem(LAST_DECK);
  } catch {
    return null;
  }
}

type Props = { mode: 'add' } | { mode: 'edit'; noteId: string; onDone: () => void };

export function NoteEditor(props: Props) {
  const decks = useDecks();
  const note = useLiveQuery(() => (props.mode === 'edit' ? db.notes.get(props.noteId) : undefined), [props.mode === 'edit' ? props.noteId : '']);
  if (!decks || (props.mode === 'edit' && note === undefined)) return <div className="screen" />;
  if (decks.length === 0) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1 className="title">단어 추가</h1>
        </div>
        <div className="panel empty">
          <span className="muted">단어를 넣을 덱이 먼저 필요해요.</span>
          <button type="button" className="btn btn-primary" onClick={() => go('decks/new')}>
            덱 만들기
          </button>
        </div>
      </div>
    );
  }
  return <Editor key={note?.id ?? 'add'} {...props} decks={decks} note={note ?? undefined} />;
}

function Editor(props: Props & { decks: Deck[]; note?: Note }) {
  const { decks, note } = props;
  const editing = props.mode === 'edit';
  const settings = useSettings();
  const toast = useToast();

  const initialDeck = note?.deckId ?? decks.find((d) => d.id === rememberedDeck())?.id ?? decks[0]!.id;
  const [deckId, setDeckId] = useState(initialDeck);
  const deck = decks.find((d) => d.id === deckId) ?? decks[0]!;
  const [typeId, setTypeId] = useState(note?.typeId ?? deck.settings.defaultTypeId);
  const type = getCardType(typeId);
  const [fields, setFields] = useState<Record<string, string>>(() => note?.fields ?? emptyFields(type));
  const [manual, setManual] = useState<Set<string>>(() => new Set(editing ? type.fields.filter((f) => f.autoFrom).map((f) => f.key) : []));
  const [ttsOverride, setTtsOverride] = useState(note?.ttsOverride?.[type.ttsField] ?? '');
  const [deps, setDeps] = useState<DeriveDeps>({});
  const [added, setAdded] = useState(0);
  const firstRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    loadPinyin().then((pinyin) => alive && setDeps({ pinyin }));
    return () => {
      alive = false;
    };
  }, []);

  // 병음 사전이 늦게 도착하면, 이미 쓴 한자에 대해 다시 채운다
  useEffect(() => {
    if (!deps.pinyin || editing) return;
    setFields((cur) => derived(type, cur, manual, deps, null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);

  const sameType = useLiveQuery(() => db.notes.where('typeId').equals(typeId).toArray(), [typeId]);
  const dup = useMemo(() => {
    const key = type.duplicateKey(fields);
    if (!key || !sameType) return undefined;
    const other = sameType.find((n) => n.id !== note?.id && type.duplicateKey(n.fields) === key);
    return other ? (decks.find((d) => d.id === other.deckId)?.name ?? '다른 덱') : undefined;
  }, [fields, sameType, type, note?.id, decks]);

  const missing = missingRequired(type, fields);
  const canSave = missing.length === 0;

  const changeDeck = (id: string) => {
    setDeckId(id);
    if (!editing) {
      const nd = decks.find((d) => d.id === id);
      if (nd && nd.settings.defaultTypeId !== typeId) changeType(nd.settings.defaultTypeId);
      try {
        localStorage.setItem(LAST_DECK, id);
      } catch {
        /* 무시 */
      }
    }
  };

  const changeType = (id: string) => {
    const nt = getCardType(id);
    setTypeId(id);
    setFields(emptyFields(nt));
    setManual(new Set());
  };

  const onField = (f: FieldDef, value: string) => {
    const nextManual = new Set(manual);
    if (f.autoFrom) {
      if (value.trim()) nextManual.add(f.key);
      else nextManual.delete(f.key);
      setManual(nextManual);
    }
    setFields(derived(type, { ...fields, [f.key]: value }, nextManual, deps, f.key));
  };

  const save = async () => {
    if (!canSave) {
      toast(`${missing.map((m) => m.label).join(', ')}을(를) 적어주세요`);
      return;
    }
    if (props.mode === 'edit') {
      const override = ttsOverride.trim() ? { ...note?.ttsOverride, [type.ttsField]: ttsOverride.trim() } : omit(note?.ttsOverride, type.ttsField);
      await updateNote(props.noteId, { fields, deckId, ttsOverride: override });
      toast('고쳤어요');
      props.onDone();
      return;
    }
    const saved = await addNote(deckId, typeId, fields);
    const word = type.summary(saved.fields).title;
    setFields(emptyFields(type));
    setManual(new Set());
    setAdded((n) => n + 1);
    toast(`저장했어요 · ${word}`, () => {
      deleteNote(saved.id);
      setAdded((n) => n - 1);
    });
    firstRef.current?.focus();
  };

  const remove = async () => {
    if (props.mode !== 'edit' || !note) return;
    if (!window.confirm('이 단어를 지울까요? 이 단어의 카드도 함께 지워져요.')) return;
    const cards = await db.cards.where('noteId').equals(note.id).toArray();
    await deleteNote(note.id);
    toast('지웠어요', () => restoreNote(note, cards));
    props.onDone();
  };

  const listen = (f: FieldDef) => {
    const text = (f.key === type.ttsField && ttsOverride.trim()) || fields[f.key] || '';
    if (!text.trim()) return;
    if (!speak([{ text, lang: resolveLang(f.lang, deck) }], settings?.voices)) toast('이 기기에 이 언어의 음성이 없을 수 있어요');
  };

  return (
    <>
      <div className="screen">
        <div className="screen-head">
          {props.mode === 'edit' && (
            <button type="button" className="icon-btn" aria-label="닫기" onClick={props.onDone} style={{ margin: '-10px 0 -10px -12px' }}>
              <Icon name="close" />
            </button>
          )}
          <h1 className="title">{editing ? '단어 고치기' : '단어 추가'}</h1>
          {!editing && added > 0 && <span className="faint small">이번에 {added}개 추가</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="deck-chip">
            <span>{deck.name}</span>
            <Icon name="chevronDown" size={18} />
            <select aria-label="덱" value={deckId} onChange={(e) => changeDeck(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {!editing && (
            <Segmented large label="카드 종류" options={CARD_TYPES.map((t) => [t.id, t.shortName] as const)} value={typeId} onChange={changeType} />
          )}
        </div>

        {type.fields.map((f, i) => {
          const lang = f.lang ? resolveLang(f.lang, deck) : undefined;
          const label = f.lang === 'deck.front' || f.lang === 'deck.back' ? `${f.label} · ${langName(lang!)}` : f.label;
          const auto = !!f.autoFrom && !manual.has(f.key) && !!fields[f.key];
          const common = {
            id: `f-${f.key}`,
            value: fields[f.key] ?? '',
            lang,
            autoComplete: 'off',
            placeholder: f.placeholder,
            onChange: (e: { target: { value: string } }) => onField(f, e.target.value),
            ref: i === 0 ? firstRef : undefined,
          };
          return (
            <div key={f.key} className="field">
              <div className="field-label">
                <label htmlFor={`f-${f.key}`}>
                  {label}
                  {!f.required && !f.autoFrom && <span style={{ fontWeight: 400 }} className="faint"> (선택)</span>}
                </label>
                {auto && <span className="badge">자동 입력됨</span>}
                {f.key === type.ttsField && (fields[f.key] ?? '').trim() && (
                  <button type="button" className="link-btn" style={{ padding: '0 4px', marginLeft: 'auto', fontSize: 13 }} onClick={() => listen(f)}>
                    들어보기
                  </button>
                )}
              </div>
              {f.input === 'sentence' || f.input === 'memo' ? (
                <textarea {...common} rows={2} className={`input${f.input === 'sentence' ? ' input-sentence' : ''}`} style={lang?.startsWith('zh') ? { fontFamily: 'var(--font-hanzi)' } : undefined} />
              ) : (
                <input {...common} className={`input${f.input === 'hanzi' ? ' input-hanzi' : f.input === 'latin' ? ' input-latin' : ''}`} />
              )}
              {i === 0 && dup && (
                <div className="warn" role="status">
                  <Icon name="alert" size={18} />
                  이미 있는 단어예요 · {dup}
                </div>
              )}
            </div>
          );
        })}

        {editing && (
          <div className="field">
            <div className="field-label">
              <label htmlFor="f-tts">읽을 텍스트 (발음이 틀릴 때만)</label>
            </div>
            <input
              id="f-tts"
              className="input"
              value={ttsOverride}
              placeholder={fields[type.ttsField] || ''}
              onChange={(e) => setTtsOverride(e.target.value)}
              autoComplete="off"
            />
            <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.5 }}>
              다음자(多音字)를 잘못 읽으면, 같은 소리가 나는 다른 글자나 단어를 적어주세요.
            </span>
          </div>
        )}

        {editing && (
          <button type="button" className="btn btn-danger" onClick={remove}>
            이 단어 지우기
          </button>
        )}
      </div>
      <div className="bottom-bar">
        <button type="button" className="btn btn-primary" aria-disabled={!canSave} onClick={save}>
          {editing ? '저장' : '저장하고 다음 단어'}
        </button>
      </div>
    </>
  );
}

/** 자동 채움 필드를 다시 계산한다. changed가 null이면 모든 원본 필드 기준으로. */
function derived(type: CardType, fields: Record<string, string>, manual: Set<string>, deps: DeriveDeps, changed: string | null): Record<string, string> {
  if (!type.derive) return fields;
  const sources = changed ? [changed] : [...new Set(type.fields.map((f) => f.autoFrom).filter(Boolean) as string[])];
  let out = fields;
  for (const src of sources) {
    const patch = type.derive(src, out, deps);
    const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => !manual.has(k)));
    out = { ...out, ...allowed };
  }
  return out;
}

function omit(o: Record<string, string> | undefined, key: string): Record<string, string> | undefined {
  if (!o) return undefined;
  const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
  return Object.keys(rest).length ? rest : undefined;
}
