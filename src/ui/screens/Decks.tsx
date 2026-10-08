import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { CARD_TYPES, getCardType } from '../../core/cardTypes/registry';
import type { AutoplaySide, DeckSettings } from '../../core/model/types';
import { db } from '../../adapters/storage/db';
import { loadPinyin } from '../../adapters/pinyin/pinyin';
import { createDeck, deleteDeck, installPack, updateDeck } from '../../adapters/storage/repo';
import { PACKS } from '../../core/packs/registry';
import type { Pack } from '../../core/packs/types';
import { Row, Segmented, Stepper, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useDecks } from '../hooks';
import { LANGS, langName } from '../langs';
import { go } from '../router';
import { useToast } from '../toast';

export function DeckList() {
  const decks = useDecks();
  const counts = useLiveQuery(async () => {
    const notes = await db.notes.toArray();
    const m = new Map<string, number>();
    for (const n of notes) m.set(n.deckId, (m.get(n.deckId) ?? 0) + 1);
    return m;
  }, []);
  if (!decks || !counts) return <div className="screen" />;
  return (
    <div className="screen">
      <div className="screen-head">
        <h1 className="title">덱</h1>
      </div>
      {decks.length > 0 && (
        <div>
          {decks.map((d) => (
            <button key={d.id} type="button" className="deck-row" onClick={() => go(`decks/${d.id}`)} style={{ paddingRight: 14 }}>
              <span className="row-text">
                <span style={{ fontSize: 17, fontWeight: 600 }}>{d.name}</span>
                <span className="faint small">
                  {getCardType(d.settings.defaultTypeId).name} · {counts.get(d.id) ?? 0}개{d.settings.reverseEnabled ? ' · 역방향 켜짐' : ''}
                </span>
              </span>
              <span className="faint">
                <Icon name="chevronRight" size={20} />
              </span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-dashed" onClick={() => go('decks/new')}>
        새 덱 만들기
      </button>
    </div>
  );
}

interface Preset {
  key: string;
  name: string;
  desc: string;
  settings: DeckSettings;
}

const base = { reverseEnabled: false, newPerDay: 20 };
const PRESETS: Preset[] = [
  {
    key: 'zh',
    name: '중국어 단어',
    desc: '한자 → 병음 · 뜻. 병음은 자동으로 채워져요.',
    settings: { ...base, defaultTypeId: 'zh-word', autoplay: 'back', langs: { front: 'zh-CN', back: 'ko-KR' } },
  },
  {
    key: 'id',
    name: '인도네시아어 단어',
    desc: '인도네시아어 → 한국어 뜻. 앞면을 읽어줘요.',
    settings: { ...base, defaultTypeId: 'basic', autoplay: 'front', langs: { front: 'id-ID', back: 'ko-KR' } },
  },
  {
    key: 'zh-s',
    name: '중국어 작문',
    desc: '한국어 문장을 보고 중국어로 쓰거나 말해요.',
    settings: { ...base, defaultTypeId: 'zh-sentence', newPerDay: 10, autoplay: 'back', langs: { front: 'zh-CN', back: 'ko-KR' } },
  },
  {
    key: 'custom',
    name: '',
    desc: '앞/뒤 카드. 언어는 다음 화면에서 고를 수 있어요.',
    settings: { ...base, defaultTypeId: 'basic', autoplay: 'front', langs: { front: 'en-US', back: 'ko-KR' } },
  },
];

function PackCard({ pack }: { pack: Pack }) {
  const toast = useToast();
  const decks = useDecks();
  const [busy, setBusy] = useState(false);
  const speak = pack.notes.filter((n) => n.typeId === 'zh-sentence').length;
  const listen = pack.notes.filter((n) => n.typeId === 'zh-listen').length;
  const days = Math.ceil(pack.notes.length / pack.deckSettings.newPerDay);

  const install = async () => {
    if (decks?.some((d) => d.name === pack.deckName) && !window.confirm('같은 이름의 덱이 이미 있어요. 하나 더 만들까요?')) return;
    setBusy(true);
    try {
      const pinyin = await loadPinyin();
      const deck = await installPack(pack, { pinyin });
      toast(`문장 ${pack.notes.length}개를 넣었어요`);
      go(`decks/${deck.id}`, { replace: true });
    } catch {
      toast('덱을 만들지 못했어요. 다시 시도해 주세요');
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 20 }}>
      <span style={{ fontSize: 17, fontWeight: 600 }}>{pack.name}</span>
      <span className="muted small" style={{ lineHeight: 1.55 }}>
        {pack.description}
      </span>
      <span className="faint small">
        말하기 {speak}문장 · 듣기 {listen}문장 · 하루 {pack.deckSettings.newPerDay}개씩 약 {days}일
      </span>
      <button type="button" className="btn btn-primary" style={{ height: 52 }} onClick={install} disabled={busy}>
        {busy ? '넣는 중…' : '이 덱 추가하기'}
      </button>
    </div>
  );
}

export function DeckNew() {
  const [preset, setPreset] = useState(PRESETS[0]!);
  const [name, setName] = useState(PRESETS[0]!.name);
  const toast = useToast();

  const create = async () => {
    if (!name.trim()) {
      toast('덱 이름을 적어주세요');
      return;
    }
    const d = await createDeck(name, preset.settings);
    toast('덱을 만들었어요');
    go(`decks/${d.id}`, { replace: true });
  };

  return (
    <>
      <div className="screen">
        <button type="button" className="back-btn" onClick={() => go('decks')}>
          <Icon name="chevronLeft" size={20} />
          덱 목록
        </button>
        <div className="screen-head">
          <h1 className="title">새 덱</h1>
        </div>
        <span className="section-label">준비된 덱</span>
        {PACKS.map((p) => (
          <PackCard key={p.id} pack={p} />
        ))}
        <span className="section-label" style={{ paddingTop: 8 }}>
          빈 덱 만들기
        </span>
        <div>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="preset"
              aria-pressed={p.key === preset.key}
              onClick={() => {
                setPreset(p);
                if (!name.trim() || PRESETS.some((x) => x.name === name)) setName(p.name);
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 600 }}>{p.name || '직접 정하기'}</span>
              <span className="faint small" style={{ lineHeight: 1.5 }}>
                {p.desc}
              </span>
            </button>
          ))}
        </div>
        <div className="field">
          <div className="field-label">
            <label htmlFor="deck-name">덱 이름</label>
          </div>
          <input id="deck-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: HSK 3급" autoComplete="off" />
        </div>
      </div>
      <div className="bottom-bar">
        <button type="button" className="btn btn-primary" aria-disabled={!name.trim()} onClick={create}>
          만들기
        </button>
      </div>
    </>
  );
}

export function DeckDetail({ id }: { id: string }) {
  const decks = useDecks();
  const toast = useToast();
  const noteCount = useLiveQuery(() => db.notes.where('deckId').equals(id).count(), [id]);
  const deck = decks?.find((d) => d.id === id);
  const [name, setName] = useState<string>();

  if (!decks || noteCount === undefined) return <div className="screen" />;
  if (!deck) {
    return (
      <div className="screen">
        <span className="muted">덱을 찾을 수 없어요.</span>
        <button type="button" className="btn btn-plain" onClick={() => go('decks')}>
          덱 목록으로
        </button>
      </div>
    );
  }

  const s = deck.settings;
  const type = getCardType(s.defaultTypeId);
  const set = (patch: Partial<DeckSettings>) => updateDeck(deck.id, { settings: patch });
  const usesDeckLangs = type.fields.some((f) => f.lang === 'deck.front' || f.lang === 'deck.back');
  const optional = type.templates.find((t) => t.optional);

  const remove = async () => {
    if (!window.confirm(`"${deck.name}" 덱과 단어 ${noteCount}개를 모두 지울까요? 되돌릴 수 없어요.`)) return;
    await deleteDeck(deck.id);
    toast('덱을 지웠어요');
    go('decks', { replace: true });
  };

  return (
    <div className="screen">
      <button type="button" className="back-btn" onClick={() => go('decks')}>
        <Icon name="chevronLeft" size={20} />
        덱 목록
      </button>
      <input
        aria-label="덱 이름"
        className="title"
        value={name ?? deck.name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name !== undefined && name.trim() && name !== deck.name) updateDeck(deck.id, { name });
          setName(undefined);
        }}
        style={{ border: 'none', background: 'transparent', padding: '0 4px', width: '100%' }}
      />

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1, height: 52 }} onClick={() => go(`review/${deck.id}`)}>
          이 덱 복습
        </button>
        <button type="button" className="btn btn-plain" style={{ flex: 1, height: 52, width: 'auto' }} onClick={() => go(`decks/${deck.id}/notes`)}>
          단어 {noteCount}개 보기
        </button>
      </div>

      <div className="group">
        <Row col title="새 단어의 카드 종류" desc={type.description}>
          <Segmented label="카드 종류" options={CARD_TYPES.map((t) => [t.id, t.shortName] as const)} value={s.defaultTypeId} onChange={(v) => set({ defaultTypeId: v })} />
        </Row>
        <Row
          title="역방향 카드"
          desc={optional ? `${optional.label} 카드도 만들어요. 꺼도 기록은 남아요.` : '이 카드 종류에는 역방향이 없어요.'}
        >
          <Switch label="역방향 카드" checked={s.reverseEnabled} onChange={(v) => set({ reverseEnabled: v }).then(() => toast(v ? '역방향 카드를 켰어요' : '역방향 카드를 숨겼어요 · 기록은 그대로예요'))} />
        </Row>
        <Row title="하루 새 카드">
          <Stepper label="하루 새 카드" value={s.newPerDay} min={0} max={200} step={5} onChange={(v) => set({ newPerDay: v })} />
        </Row>
        <Row col title="발음 자동 재생">
          <Segmented<AutoplaySide>
            label="발음 자동 재생"
            options={[
              ['front', '앞면에서'],
              ['back', '정답에서'],
              ['off', '끄기'],
            ]}
            value={s.autoplay}
            onChange={(v) => set({ autoplay: v })}
          />
        </Row>
        {usesDeckLangs && (
          <>
            <Row title="앞면 언어">
              <LangSelect value={s.langs.front} onChange={(v) => set({ langs: { ...s.langs, front: v } })} label="앞면 언어" />
            </Row>
            <Row title="뒷면 언어">
              <LangSelect value={s.langs.back} onChange={(v) => set({ langs: { ...s.langs, back: v } })} label="뒷면 언어" />
            </Row>
          </>
        )}
      </div>
      {!usesDeckLangs && (
        <span className="faint small" style={{ padding: '0 4px' }}>
          발음: {type.id.startsWith('zh') ? '중국어(zh-CN)로 읽어요' : `앞면 ${langName(s.langs.front)}`}
        </span>
      )}

      <button type="button" className="btn btn-danger" onClick={remove}>
        덱 지우기
      </button>
    </div>
  );
}

function LangSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {LANGS.map(([tag, n]) => (
        <option key={tag} value={tag}>
          {n}
        </option>
      ))}
    </select>
  );
}

export function NoteList({ deckId }: { deckId: string }) {
  const decks = useDecks();
  const notes = useLiveQuery(() => db.notes.where('deckId').equals(deckId).toArray(), [deckId]);
  const [query, setQuery] = useState('');
  const deck = decks?.find((d) => d.id === deckId);

  const shown = useMemo(() => {
    if (!notes) return [];
    const qy = query.trim().toLowerCase();
    return notes
      .filter((n) => !qy || Object.values(n.fields).some((v) => v.toLowerCase().includes(qy)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [notes, query]);

  if (!decks || !notes) return <div className="screen" />;

  return (
    <div className="screen">
      <button type="button" className="back-btn" onClick={() => go(`decks/${deckId}`)}>
        <Icon name="chevronLeft" size={20} />
        {deck?.name ?? '덱'}
      </button>
      <div className="screen-head">
        <h1 className="title">단어 {notes.length}개</h1>
      </div>
      <input className="input search" type="search" placeholder="찾기" aria-label="단어 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div>
        {shown.map((n) => {
          const t = getCardType(n.typeId);
          const { title, sub } = t.summary(n.fields);
          return (
            <button key={n.id} type="button" className="list-row" onClick={() => go(`notes/${n.id}/edit/decks/${deckId}/notes`)}>
              <span className={`list-title${t.id === 'zh-word' ? ' zh' : ''}`}>{title}</span>
              <span className="faint small">{sub}</span>
            </button>
          );
        })}
        {shown.length === 0 && <div className="faint" style={{ textAlign: 'center', padding: 24 }}>{notes.length ? '찾는 단어가 없어요' : '아직 단어가 없어요'}</div>}
      </div>
    </div>
  );
}
