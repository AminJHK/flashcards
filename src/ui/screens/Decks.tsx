import { ScreenSync } from '../components/ScreenSync';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { CARD_TYPES, getCardType, hasCardType } from '../../core/cardTypes/registry';
import type { CardType } from '../../core/cardTypes/types';
import type { AutoplaySide, DeckSettings } from '../../core/model/types';
import { db } from '../../adapters/storage/db';
import { loadPinyin } from '../../adapters/pinyin/pinyin';
import { addPackNotes, applyPackChanges, createDeck, deleteDeck, installPack, moveConnectors, updateDeck, updateNote } from '../../adapters/storage/repo';
import { CONNECTOR_DECK_NAME, isConnector } from '../../core/decks/connectors';
import { packAdditions, packChanges, packMissing } from '../../core/packs/update';
import { PARTICLE_WORDS } from '../../core/packs/indonesianParticles';
import { PACKS } from '../../core/packs/registry';
import type { Pack } from '../../core/packs/types';
import { Row, Segmented, Stepper, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { MemoryMini, MemoryPanel, useMemoryByDeck, WordMeter } from '../components/MemoryBar';
import { EMPTY_MEMORY, HARD_LAPSES, hardWords, isHard, LEVELS, wordMemory, type WordMemory } from '../../core/stats/memory';
import type { Card, Note } from '../../core/model/types';
import { useDecks, useNow, useScheduler, useSettings } from '../hooks';
import { speak as deviceSpeak, voicesFor, voicesReady } from '../../adapters/tts/webSpeech';
import { LANGS, langName, noVoiceMessage } from '../langs';
import { go } from '../router';
import { useToast } from '../toast';
import { ask } from '../confirm';

export function DeckList() {
  const decks = useDecks();
  const memory = useMemoryByDeck();
  const counts = useLiveQuery(async () => {
    const notes = await db.notes.toArray();
    const m = new Map<string, number>();
    for (const n of notes) m.set(n.deckId, (m.get(n.deckId) ?? 0) + 1);
    return m;
  }, []);
  if (!decks || !counts) return <div className="screen" />;
  return (
    <div className="screen">
      <ScreenSync />
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
                  {getCardType(d.settings.defaultTypeId).name} · {counts.get(d.id) ?? 0}개
                  {d.settings.forwardEnabled === false ? ' · 역방향만' : d.settings.reverseEnabled ? ' · 양방향' : ''}
                </span>
                <MemoryMini m={memory?.get(d.id)} />
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
    if (decks?.some((d) => d.name === pack.deckName) && !(await ask('같은 이름의 덱이 이미 있어요. 하나 더 만들까요?', '만들기'))) return;
    setBusy(true);
    try {
      const pinyin = await loadPinyin();
      const deck = await installPack(pack, { pinyin });
      toast(`${speak + listen ? '문장' : '단어'} ${pack.notes.length}개를 넣었어요`);
      go(`decks/${deck.id}`, { replace: true });
    } catch {
      toast('덱을 만들지 못했어요. 다시 시도해 주세요');
      setBusy(false);
    }
  };

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <span className="row-text">
        <span className="row-title">{pack.name}</span>
        <span className="row-desc clamp-2">{pack.description}</span>
        <span className="row-desc">
          {speak + listen ? `말하기 ${speak}문장 · 듣기 ${listen}문장` : `단어 ${pack.notes.length}개`} · 하루 {pack.deckSettings.newPerDay}개씩 약 {days}일
        </span>
      </span>
      <button type="button" className="btn-soft" style={{ border: 'none', marginTop: 2 }} onClick={install} disabled={busy} aria-label={`${pack.name} 추가하기`}>
        {busy ? '넣는 중…' : '추가'}
      </button>
    </div>
  );
}

interface InstalledPack {
  deckId: string;
  deckName: string;
  /** 이 덱에 아직 안 들어간 꾸러미의 새 단어 */
  more: Pack['notes'];
}

/** 준비된 덱 중 이미 설치한 것: 그 꾸러미 단어가 가장 많이 든 덱 */
function useInstalledPacks(): Map<string, InstalledPack> | undefined {
  const decks = useDecks();
  const notes = useLiveQuery(() => db.notes.toArray(), []);
  return useMemo(() => {
    if (!decks || !notes) return undefined;
    const out = new Map<string, InstalledPack>();
    for (const pack of PACKS) {
      const tag = `pack:${pack.id}`;
      const byDeck = new Map<string, typeof notes>();
      for (const n of notes) if (n.tags.includes(tag)) byDeck.set(n.deckId, [...(byDeck.get(n.deckId) ?? []), n]);
      const best = [...byDeck].sort((a, b) => b[1].length - a[1].length)[0];
      const deck = best && decks.find((d) => d.id === best[0]);
      if (deck) out.set(pack.id, { deckId: deck.id, deckName: deck.name, more: packAdditions(pack, best[1], notes) });
    }
    return out;
  }, [decks, notes]);
}

/** 이미 추가한 준비된 덱: 한 줄로. 꾸러미에 새 단어가 생겼으면 그 덱에 바로 넣는다 */
function InstalledPackRow({ pack, info }: { pack: Pack; info: InstalledPack }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const n = await addPackNotes(info.deckId, pack, info.more, { pinyin: await loadPinyin() });
      toast(`「${info.deckName}」 덱에 새 단어 ${n}개를 넣었어요`);
    } catch {
      toast('단어를 넣지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <span className="row-text">
        <span className="row-title">{pack.name}</span>
        <span className="row-desc">{info.more.length ? `「${info.deckName}」 덱에 새 단어 ${info.more.length}개를 넣을 수 있어요` : `「${info.deckName}」 덱으로 추가했어요`}</span>
      </span>
      {info.more.length > 0 ? (
        <button type="button" className="btn-soft" style={{ border: 'none' }} disabled={busy} onClick={add}>
          {busy ? '넣는 중…' : '기존 덱에 넣기'}
        </button>
      ) : (
        <button type="button" className="btn-plain" style={{ border: 'none' }} onClick={() => go(`decks/${info.deckId}`)}>
          열기
        </button>
      )}
    </div>
  );
}

export function DeckNew() {
  const installed = useInstalledPacks();
  const fresh = PACKS.filter((p) => installed && !installed.has(p.id));
  const done = PACKS.filter((p) => installed?.has(p.id));
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
        {fresh.length > 0 && <span className="section-label">준비된 덱</span>}
        {fresh.length > 0 && (
          <div className="group">
            {fresh.map((p) => (
              <PackCard key={p.id} pack={p} />
            ))}
          </div>
        )}
        {done.length > 0 && (
          <>
            <span className="section-label" style={{ paddingTop: 8 }}>
              이미 추가한 준비된 덱
            </span>
            <div className="group">
              {done.map((p) => (
                <InstalledPackRow key={p.id} pack={p} info={installed!.get(p.id)!} />
              ))}
            </div>
          </>
        )}
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
  const settings = useSettings();
  const memory = useMemoryByDeck();
  const toast = useToast();
  const noteCount = useLiveQuery(() => db.notes.where('deckId').equals(id).count(), [id]);
  // 이 덱에 실제로 들어 있는 단어의 카드 종류 (많은 순). "새 단어의 카드 종류"와는 별개다.
  const usedTypes = useLiveQuery(async () => {
    const counts = new Map<string, number>();
    await db.notes.where('deckId').equals(id).each((n) => counts.set(n.typeId, (counts.get(n.typeId) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [id]);
  // 준비된 덱이 고쳐졌으면, 이 덱에 반영할 수 있는 단어들
  const packFixes = useLiveQuery(async () => {
    const notes = await db.notes.where('deckId').equals(id).toArray();
    return PACKS.flatMap((p) => packChanges(p, notes));
  }, [id]);
  // 준비된 덱에 단어가 늘었으면, 이 덱에 더 넣을 수 있는 단어들
  const packMore = useLiveQuery(async () => {
    const notes = await db.notes.where('deckId').equals(id).toArray();
    const all = await db.notes.toArray();
    return PACKS.map((pack) => ({ pack, notes: packAdditions(pack, notes, all) })).filter((x) => x.notes.length > 0);
  }, [id]);
  // 인도네시아어 단어 중 연결어·표현(아무튼, ~하도록, ~인 것 같다 …)이 이 덱에 몇 개 있는지
  // 여러 번 잊어버린 단어 (docs/DESIGN.md §4.6)
  const hardCount = useLiveQuery(async () => hardWords(await db.cards.where('deckId').equals(id).toArray()).size, [id]);
  const connectorCount = useLiveQuery(async () => (await db.notes.where('deckId').equals(id).toArray()).filter(isConnector).length, [id]);
  // 지운 단어: 이 덱의 준비된 덱 원본에는 있는데 지금 어느 덱에도 없는 단어 (중복·어조 말 덱이 맡은 말은 뺀다)
  const missing = useLiveQuery(async () => {
    const mine = await db.notes.where('deckId').equals(id).toArray();
    const all = await db.notes.toArray();
    return PACKS.map((pack) => ({ pack, notes: mine.some((n) => n.tags.includes(`pack:${pack.id}`)) ? packMissing(pack, all, pack.id === 'indonesian-colloquial' ? PARTICLE_WORDS : undefined) : [] })).filter((x) => x.notes.length > 0);
  }, [id]);
  const [skipTags, setSkipTags] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const deck = decks?.find((d) => d.id === id);
  const [name, setName] = useState<string>();

  if (!decks || noteCount === undefined || !usedTypes) return <div className="screen" />;
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
  const defaultType = getCardType(s.defaultTypeId);
  // 방향 설명과 언어 설정은 덱에 실제로 많이 든 카드 종류를 기준으로 한다 (없으면 새 단어의 기본 종류)
  const type = getCardType(usedTypes.find(hasCardType) ?? s.defaultTypeId);
  const set = (patch: Partial<DeckSettings>) => updateDeck(deck.id, { settings: patch });
  const usesLangs = (t: CardType) => t.fields.some((f) => f.lang === 'deck.front' || f.lang === 'deck.back');
  const usesDeckLangs = [defaultType, ...usedTypes.filter(hasCardType).map(getCardType)].some(usesLangs);
  const optional = type.templates.find((t) => t.optional);
  const forward = type.templates.find((t) => !t.optional) ?? type.templates[0]!;

  const remove = async () => {
    if (!(await ask(`"${deck.name}" 덱과 단어 ${noteCount}개를 모두 지울까요? 되돌릴 수 없어요.`, '지우기'))) return;
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

      {hardCount !== undefined && noteCount > 0 && (
        <button type="button" className="list-row with-meter" onClick={() => go(`decks/${deck.id}/hard`)}>
          <span className="row-text">
            <span className="row-title">어려운 단어 {hardCount}개</span>
            <span className="faint small">{hardCount ? '여러 번 틀린 단어예요. 기억 고리를 달아 보세요' : `${HARD_LAPSES}번 이상 틀린 단어가 여기 모여요`}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </button>
      )}

      {!!connectorCount && deck.name !== CONNECTOR_DECK_NAME && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
          <span style={{ fontWeight: 600 }}>연결어·표현 {connectorCount}개를 따로 모을 수 있어요</span>
          <span className="muted small" style={{ lineHeight: 1.6 }}>
            pokoknya(아무튼), supaya(~하도록), kayaknya(~인 것 같아)처럼 뜻이 문장 속에서 정해지는 말이에요. 새 덱 「{CONNECTOR_DECK_NAME}」으로 옮겨서, 예문을 먼저 보며 하루 3개씩 천천히 익혀요. 복습 기록은 그대로 따라가고 읽기(이야기)에서도 똑같이 쓰여요.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 48 }}
            disabled={moving}
            onClick={async () => {
              if (!(await ask(`연결어·표현 ${connectorCount}개를 「${CONNECTOR_DECK_NAME}」 덱으로 옮길까요?`, '옮기기'))) return;
              setMoving(true);
              try {
                const r = await moveConnectors(deck.id);
                toast(`${r.moved}개를 「${r.deck.name}」으로 옮겼어요`);
                go(`decks/${r.deck.id}`);
              } catch {
                toast('옮기지 못했어요. 다시 시도해 주세요');
                setMoving(false);
              }
            }}
          >
            {moving ? '옮기는 중…' : '연결어 따로 모으기'}
          </button>
        </div>
      )}

      {missing?.map(({ pack, notes }) => {
        const groups = [...notes.reduce((m, n) => m.set(n.tags[0]!, (m.get(n.tags[0]!) ?? 0) + 1), new Map<string, number>())];
        const picked = notes.filter((n) => !skipTags.includes(n.tags[0]!));
        return (
          <div key={`missing-${pack.id}`} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
            <span style={{ fontWeight: 600 }}>지운 단어 {notes.length}개를 되살릴 수 있어요</span>
            <span className="muted small" style={{ lineHeight: 1.6 }}>
              「{pack.name}」 원래 목록에는 있는데 지금 덱에 없는 단어예요. 이미 있는 단어는 빼고, 어조 말(dong, sih …)은 「인도네시아어 어조 말」 덱이 맡아서 뺐어요. 되살린 단어는 새 카드로 나와요.
            </span>
            <div className="chip-row" role="group" aria-label="되살릴 종류" style={{ flexWrap: 'wrap', overflowX: 'visible', margin: 0, padding: 0 }}>
              {groups.map(([tag, n]) => (
                <button key={tag} type="button" className="chip-btn" aria-pressed={!skipTags.includes(tag)} onClick={() => setSkipTags((s) => (s.includes(tag) ? s.filter((x) => x !== tag) : [...s, tag]))}>
                  {tag} {n}
                </button>
              ))}
            </div>
            <span className="faint small" style={{ lineHeight: 1.6 }}>
              {picked
                .slice(0, 14)
                .map((n) => n.fields.word)
                .join(', ')}
              {picked.length > 14 ? ` 외 ${picked.length - 14}개` : ''}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 48 }}
              disabled={restoring || !picked.length}
              onClick={async () => {
                setRestoring(true);
                try {
                  const deps = { pinyin: await loadPinyin() };
                  const connDeck = decks.find((d) => d.name === CONNECTOR_DECK_NAME && d.id !== deck.id);
                  const toConn = connDeck ? picked.filter((n) => n.typeId === 'id-spoken' && isConnector({ typeId: n.typeId, fields: n.fields })) : [];
                  const rest = picked.filter((n) => !toConn.includes(n));
                  let count = rest.length ? await addPackNotes(deck.id, pack, rest, deps) : 0;
                  if (connDeck && toConn.length) count += await addPackNotes(connDeck.id, pack, toConn, deps);
                  toast(`단어 ${count}개를 되살렸어요${toConn.length ? ` (연결어 ${toConn.length}개는 「${CONNECTOR_DECK_NAME}」 덱으로)` : ''}`);
                } catch {
                  toast('되살리지 못했어요. 다시 시도해 주세요');
                } finally {
                  setRestoring(false);
                }
              }}
            >
              {restoring ? '되살리는 중…' : `${picked.length}개 되살리기`}
            </button>
          </div>
        );
      })}

      {packMore?.map(({ pack, notes }) => (
        <div key={pack.id} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
          <span style={{ fontWeight: 600 }}>준비된 덱에 새 단어 {notes.length}개가 생겼어요</span>
          <span className="muted small" style={{ lineHeight: 1.6 }}>
            지금 단어 뒤에 이어서 들어가요. 지금까지의 단어와 복습 기록은 그대로예요. 새 카드는 하루 {s.newPerDay}개씩 나와요.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 48 }}
            disabled={adding}
            onClick={async () => {
              setAdding(true);
              try {
                const n = await addPackNotes(deck.id, pack, notes, { pinyin: await loadPinyin() });
                toast(`새 단어 ${n}개를 넣었어요`);
              } catch {
                toast('단어를 넣지 못했어요. 다시 시도해 주세요');
              } finally {
                setAdding(false);
              }
            }}
          >
            {adding ? '넣는 중…' : '새 단어 받기'}
          </button>
        </div>
      ))}

      {packFixes && packFixes.length > 0 && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
          <span style={{ fontWeight: 600 }}>준비된 덱이 고쳐졌어요</span>
          <span className="muted small" style={{ lineHeight: 1.6 }}>
            단어 {packFixes.length}개의 뜻이나 예문이 더 정확하게 바뀌었어요. 내가 직접 고친 단어와 복습 기록은 그대로예요.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 48 }}
            onClick={async () => {
              const n = await applyPackChanges(packFixes);
              toast(`단어 ${n}개를 고쳤어요`);
            }}
          >
            고친 내용 받기
          </button>
        </div>
      )}

      <div className="panel" style={{ padding: 20 }}>
        <MemoryPanel m={memory?.get(deck.id) ?? EMPTY_MEMORY} title="기억 상태" />
      </div>

      <div className="group">
        <Row col title="새 단어의 카드 종류" desc={`${defaultType.description} 새로 추가하는 단어에만 적용돼요. 이미 있는 단어는 그대로예요.`}>
          <Segmented wrap label="카드 종류" options={CARD_TYPES.map((t) => [t.id, t.shortName] as const)} value={s.defaultTypeId} onChange={(v) => set({ defaultTypeId: v })} />
        </Row>
        {optional && (
          <Row title="정방향 카드" desc={`${type.id === 'basic' ? `${langName(s.langs.front)} 단어 보고 ${langName(s.langs.back)} 뜻 떠올리기` : forward.label}. 끄면 숨겨져요 (복습 기록은 그대로).`}>
            <Switch
              label="정방향 카드"
              checked={s.forwardEnabled !== false}
              onChange={(v) => {
                if (!v && !s.reverseEnabled) return toast('정방향과 역방향 중 하나는 켜 두어야 해요');
                void set({ forwardEnabled: v }).then(() => toast(v ? '정방향 카드를 켰어요' : '정방향 카드를 숨겼어요 · 기록은 그대로예요'));
              }}
            />
          </Row>
        )}
        <Row
          title="역방향 카드"
          desc={optional ? `${type.id === 'basic' ? `${langName(s.langs.back)} 뜻 보고 ${langName(s.langs.front)} 단어 떠올리기` : optional.label}. 끄면 숨겨져요 (복습 기록은 그대로).` : '이 카드 종류에는 역방향이 없어요.'}
        >
          <Switch
            label="역방향 카드"
            checked={s.reverseEnabled}
            onChange={(v) => {
              if (!v && s.forwardEnabled === false) return toast('정방향과 역방향 중 하나는 켜 두어야 해요');
              void set({ reverseEnabled: v }).then(() => toast(v ? '역방향 카드를 켰어요' : '역방향 카드를 숨겼어요 · 기록은 그대로예요'));
            }}
          />
        </Row>
        {type.id === 'id-spoken' && (
          <Row title="예문 먼저 보기" desc="앞면에 단어 대신 예문을 보여 줘요. 뜻이 문맥에 따라 달라지는 연결어·표현(pokoknya, supaya …)에 좋아요.">
            <Switch label="예문 먼저 보기" checked={s.sentenceFirst === true} onChange={(v) => void set({ sentenceFirst: v })} />
          </Row>
        )}
        <Row title="하루 새 카드">
          <Stepper label="하루 새 카드" value={s.newPerDay} min={0} max={200} step={s.newPerDay <= 10 ? 1 : 5} onChange={(v) => set({ newPerDay: v })} />
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
            <Row title="배우는 언어" desc="단어를 이 언어 발음으로 읽어요 (예: 스페인어). 어느 쪽이 먼저 보이는지와는 상관없어요.">
              <LangSelect value={s.langs.front} onChange={(v) => set({ langs: { ...s.langs, front: v } })} label="배우는 언어" />
            </Row>
            <Row title="뜻 언어" desc="뜻을 적은 언어 (예: 영어, 한국어)">
              <LangSelect value={s.langs.back} onChange={(v) => set({ langs: { ...s.langs, back: v } })} label="뜻 언어" />
            </Row>
            <Row title="기기 음성으로 읽어 보기" desc="이 덱의 첫 단어를 폰에 설치된 음성으로 읽어 봐요 (Gemini 아님).">
              <button
                type="button"
                className="btn-plain"
                onClick={async () => {
                  const n = await db.notes.where('deckId').equals(id).first();
                  const text = (n?.fields.front ?? n?.fields.verb ?? '').trim();
                  if (!text) return toast('읽어 볼 단어가 없어요');
                  await voicesReady();
                  const ok = deviceSpeak([{ text, lang: s.langs.front }], settings?.voices);
                  const voice = voicesFor(s.langs.front)[0];
                  toast(ok ? `${langName(s.langs.front)} 음성으로 읽어요${voice ? ` · ${voice.name}` : ''} · "${text}"` : noVoiceMessage([s.langs.front]));
                }}
              >
                읽어 보기
              </button>
            </Row>
          </>
        )}
      </div>
      <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.6 }}>
        {usesDeckLangs ? '배우는 언어·뜻 언어는 기본, 동사 변화 카드에 써요. 먼저 보이는 쪽은 위의 카드 방향 스위치로 정해요. ' : ''}중국어 카드(중국어 단어·작문·듣기)는 설정과 상관없이 항상 중국어로 읽어요.
      </span>

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

/** 단어 목록. hard면 어려운 단어(여러 번 틀린 단어)만 많이 틀린 순으로 보여주고, 그 자리에서 참고 메모를 쓸 수 있다. */
export function NoteList({ deckId, hard = false }: { deckId: string; hard?: boolean }) {
  const decks = useDecks();
  const notes = useLiveQuery(() => db.notes.where('deckId').equals(deckId).toArray(), [deckId]);
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(deckId).toArray(), [deckId]);
  const scheduler = useScheduler(useSettings());
  const now = useNow(60_000);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'recent' | 'weak' | 'strong'>('recent');
  const deck = decks?.find((d) => d.id === deckId);

  const memory = useMemo(() => {
    const byNote = new Map<string, Card[]>();
    for (const c of cards ?? []) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
    return new Map([...byNote].map(([id, cs]) => [id, wordMemory(cs, scheduler, now)] as const));
  }, [cards, scheduler, now]);

  const shown = useMemo(() => {
    if (!notes) return [];
    const qy = query.trim().toLowerCase();
    // 약한 순: 본 단어 중 단계가 낮고, 기억할 확률이 낮고, 다음 복습이 가까운 것부터. 새 카드는 맨 뒤
    const strength = (m: WordMemory | undefined) =>
      !m || m.recall === undefined ? Infinity : LEVELS.indexOf(m.level) * 10 + Math.round(m.recall * 100) / 100 + Math.min(m.due ?? 0, now + 3650 * 86_400_000) / 1e15;
    const found = notes.filter((n) => !qy || Object.values(n.fields).some((v) => v.toLowerCase().includes(qy)));
    if (hard) {
      // 많이 틀린 순, 같으면 기억이 약한 순
      return found.filter((n) => isHard(memory.get(n.id))).sort((a, b) => memory.get(b.id)!.lapses - memory.get(a.id)!.lapses || strength(memory.get(a.id)) - strength(memory.get(b.id)));
    }
    return found
      .sort((a, b) => {
        if (order === 'recent') return b.createdAt - a.createdAt;
        const sa = strength(memory.get(a.id));
        const sb = strength(memory.get(b.id));
        if (sa === sb) return b.createdAt - a.createdAt;
        if (sa === Infinity) return 1;
        if (sb === Infinity) return -1;
        return order === 'weak' ? sa - sb : sb - sa;
      });
  }, [notes, query, order, memory, now, hard]);

  if (!decks || !notes || !cards) return <div className="screen" />;

  return (
    <div className="screen">
      <button type="button" className="back-btn" onClick={() => go(`decks/${deckId}`)}>
        <Icon name="chevronLeft" size={20} />
        {deck?.name ?? '덱'}
      </button>
      <div className="screen-head">
        <h1 className="title">{hard ? `어려운 단어 ${shown.length}개` : `단어 ${notes.length}개`}</h1>
      </div>
      {hard ? (
        <div className="panel hard-tip">
          <span>
            {HARD_LAPSES}번 이상 틀린 단어예요. 같은 카드를 더 보는 것보다 <b>떠올릴 고리</b>를 하나 달아 두면 훨씬 잘 외워져요.
          </span>
          <span className="muted small">
            · 소리가 비슷한 한국어로 장면 만들기 (tahan → "참았다")
            <br />· 헷갈리는 단어 적어 두기 ("sedang이랑 헷갈림")
            <br />· 내가 실제로 쓸 문장 하나
          </span>
          <span className="faint small">단어를 누르고 참고에 적으면 복습 정답 화면 아래에 보여요. 기억이 탄탄해지면 이 목록에서 저절로 빠져요.</span>
        </div>
      ) : (
        <>
          <input className="input search" type="search" placeholder="찾기" aria-label="단어 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Segmented
            label="정렬"
            options={[
              ['recent', '최근 추가'],
              ['weak', '기억 약한 순'],
              ['strong', '기억 강한 순'],
            ]}
            value={order}
            onChange={setOrder}
          />
        </>
      )}
      <div>
        {shown.map((n) => {
          if (hard) return <HardRow key={n.id} note={n} lapses={memory.get(n.id)!.lapses} deckId={deckId} />;
          const t = getCardType(n.typeId);
          const { title, sub } = t.summary(n.fields);
          return (
            <button key={n.id} type="button" className="list-row with-meter" onClick={() => go(`notes/${n.id}/edit/decks/${deckId}/notes`)}>
              <span className="row-text">
                <span className="list-title-line">
                  <span className={`list-title${t.id === 'zh-word' ? ' zh' : ''}`}>{title}</span>
                  {isHard(memory.get(n.id)) && <span className="chip chip-hard">어려움</span>}
                </span>
                <span className="faint small">{sub}</span>
              </span>
              {memory.get(n.id) && <WordMeter m={memory.get(n.id)!} now={now} />}
            </button>
          );
        })}
        {shown.length === 0 && <div className="faint" style={{ textAlign: 'center', padding: 24 }}>{hard ? '아직 어려운 단어가 없어요' : notes.length ? '찾는 단어가 없어요' : '아직 단어가 없어요'}</div>}
      </div>
    </div>
  );
}

/** 어려운 단어 한 줄. 누르면 펼쳐져서 참고(메모) 칸을 그 자리에서 고친다. */
function HardRow({ note, lapses, deckId }: { note: Note; lapses: number; deckId: string }) {
  const toast = useToast();
  const t = getCardType(note.typeId);
  const { title, sub } = t.summary(note.fields);
  const memoKey = t.fields.find((f) => f.input === 'memo')?.key;
  const saved = memoKey ? (note.fields[memoKey] ?? '') : '';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>();
  const value = text ?? saved;

  const save = async () => {
    if (!memoKey) return;
    await updateNote(note.id, { fields: { ...note.fields, [memoKey]: value } });
    setText(undefined);
    toast('참고를 저장했어요 · 다음 복습 때 보여요');
  };

  return (
    <div className="list-row hard-row">
      <button type="button" className="hard-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="row-text">
          <span className={`list-title${t.id === 'zh-word' ? ' zh' : ''}`}>{title}</span>
          <span className="faint small">{sub}</span>
        </span>
        <span className="chip chip-hard">{lapses}번 틀림</span>
      </button>
      {open && memoKey && (
        <div className="hard-edit">
          <textarea
            className="input"
            rows={3}
            aria-label={`${title} 참고`}
            placeholder="떠올릴 고리를 적어 보세요 (소리가 비슷한 말, 헷갈리는 단어, 나만의 문장)"
            value={value}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="hard-actions">
            <button type="button" className="link-btn" onClick={() => go(`notes/${note.id}/edit/decks/${deckId}/hard`)}>
              단어 전체 고치기
            </button>
            <button type="button" className="btn btn-primary hard-save" disabled={value.trim() === saved.trim()} onClick={() => void save()}>
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
