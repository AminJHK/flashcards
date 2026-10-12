import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { CARD_TYPES, getCardType, hasCardType } from '../../core/cardTypes/registry';
import type { CardType } from '../../core/cardTypes/types';
import type { AutoplaySide, DeckSettings } from '../../core/model/types';
import { db } from '../../adapters/storage/db';
import { loadPinyin } from '../../adapters/pinyin/pinyin';
import { createDeck, deleteDeck, installPack, updateDeck } from '../../adapters/storage/repo';
import { PACKS } from '../../core/packs/registry';
import type { Pack } from '../../core/packs/types';
import { Row, Segmented, Stepper, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { MemoryMini, MemoryPanel, useMemoryByDeck, WordMeter } from '../components/MemoryBar';
import { EMPTY_MEMORY, LEVELS, wordMemory, type WordMemory } from '../../core/stats/memory';
import type { Card } from '../../core/model/types';
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
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 20 }}>
      <span style={{ fontSize: 17, fontWeight: 600 }}>{pack.name}</span>
      <span className="muted small" style={{ lineHeight: 1.55 }}>
        {pack.description}
      </span>
      <span className="faint small">
        {speak + listen ? `말하기 ${speak}문장 · 듣기 ${listen}문장` : `단어 ${pack.notes.length}개`} · 하루 {pack.deckSettings.newPerDay}개씩 약 {days}일
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

      <div className="panel" style={{ padding: 20 }}>
        <MemoryPanel m={memory?.get(deck.id) ?? EMPTY_MEMORY} title="기억 상태" />
      </div>

      <div className="group">
        <Row col title="새 단어의 카드 종류" desc={`${defaultType.description} 새로 추가하는 단어에만 적용돼요. 이미 있는 단어는 그대로예요.`}>
          <Segmented label="카드 종류" options={CARD_TYPES.map((t) => [t.id, t.shortName] as const)} value={s.defaultTypeId} onChange={(v) => set({ defaultTypeId: v })} />
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

export function NoteList({ deckId }: { deckId: string }) {
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
    return notes
      .filter((n) => !qy || Object.values(n.fields).some((v) => v.toLowerCase().includes(qy)))
      .sort((a, b) => {
        if (order === 'recent') return b.createdAt - a.createdAt;
        const sa = strength(memory.get(a.id));
        const sb = strength(memory.get(b.id));
        if (sa === sb) return b.createdAt - a.createdAt;
        if (sa === Infinity) return 1;
        if (sb === Infinity) return -1;
        return order === 'weak' ? sa - sb : sb - sa;
      });
  }, [notes, query, order, memory, now]);

  if (!decks || !notes || !cards) return <div className="screen" />;

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
      <div>
        {shown.map((n) => {
          const t = getCardType(n.typeId);
          const { title, sub } = t.summary(n.fields);
          return (
            <button key={n.id} type="button" className="list-row with-meter" onClick={() => go(`notes/${n.id}/edit/decks/${deckId}/notes`)}>
              <span className="row-text">
                <span className={`list-title${t.id === 'zh-word' ? ' zh' : ''}`}>{title}</span>
                <span className="faint small">{sub}</span>
              </span>
              {memory.get(n.id) && <WordMeter m={memory.get(n.id)!} now={now} />}
            </button>
          );
        })}
        {shown.length === 0 && <div className="faint" style={{ textAlign: 'center', padding: 24 }}>{notes.length ? '찾는 단어가 없어요' : '아직 단어가 없어요'}</div>}
      </div>
    </div>
  );
}
