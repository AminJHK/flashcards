import { describe, expect, it } from 'vitest';
import { deck } from '../testUtil';
import { CARD_TYPES, getCardType } from './registry';
import { missingRequired } from './types';

const d = deck('d');
const fakePinyin = (s: string, mode: 'word' | 'sentence') => (mode === 'word' ? `py(${s})` : `py ${s}`);

describe('카드 종류', () => {
  it('모든 카드 종류의 모든 템플릿이 앞면과 뒷면을 만든다', () => {
    for (const t of CARD_TYPES) {
      const fields = Object.fromEntries(t.fields.map((f) => [f.key, `${f.key}값`]));
      for (const tpl of t.templates) {
        const v = t.view(tpl.id, { fields, deck: d });
        expect(v.front.length, `${t.id}/${tpl.id}`).toBeGreaterThan(0);
        expect(v.back.length, `${t.id}/${tpl.id}`).toBeGreaterThan(0);
        if (tpl.answer === 'produce') expect(v.expected?.text).toBeTruthy();
      }
    }
  });

  it('id와 필드 key가 겹치지 않는다', () => {
    expect(new Set(CARD_TYPES.map((t) => t.id)).size).toBe(CARD_TYPES.length);
    for (const t of CARD_TYPES) expect(new Set(t.fields.map((f) => f.key)).size).toBe(t.fields.length);
  });

  it('중국어 단어: 한자를 바꾸면 병음을 채운다', () => {
    const t = getCardType('zh-word');
    expect(t.derive!('hanzi', { hanzi: ' 图书馆 ' }, { pinyin: fakePinyin })).toEqual({ pinyin: 'py(图书馆)' });
    expect(t.derive!('meaning', { hanzi: '图书馆' }, { pinyin: fakePinyin })).toEqual({});
  });

  it('기본: 역방향은 뜻을 먼저 보여주고, 정답에서 배우는 언어로 읽어준다', () => {
    const deck = { id: 'd', name: 'x', createdAt: 0, settings: { defaultTypeId: 'basic', reverseEnabled: true, forwardEnabled: false, newPerDay: 10, autoplay: 'front' as const, langs: { front: 'es-ES', back: 'en-US' } } };
    const v = getCardType('basic').view('reverse', { fields: { front: 'la casa', back: 'house' }, deck });
    expect(v.front).toEqual([{ kind: 'word', text: 'house', size: 'front', lang: 'en-US' }]);
    expect(v.tts.front).toEqual([]);
    expect(v.tts.back).toEqual([{ text: 'la casa', lang: 'es-ES' }]);
    expect(v.autoplay).toBe('back');
  });

  it('중국어 단어: 역방향 앞면은 뜻을 보여주고 읽지 않는다', () => {
    const v = getCardType('zh-word').view('reverse', { fields: { hanzi: '银行', pinyin: 'yínháng', meaning: '은행' }, deck: d });
    expect(v.front).toContainEqual({ kind: 'meaning', text: '은행', size: 'front' });
    expect(v.tts.front).toEqual([]);
    expect(v.tts.back).toEqual([{ text: '银行', lang: 'zh-CN' }]);
  });

  it('TTS 대체 텍스트가 있으면 그걸 읽는다', () => {
    const v = getCardType('zh-word').view('forward', { fields: { hanzi: '行', meaning: '줄' }, deck: d, ttsOverride: { hanzi: '银行' } });
    expect(v.tts.front[0]!.text).toBe('银行');
  });

  it('기본 카드는 덱 언어로 읽는다', () => {
    const v = getCardType('basic').view('forward', { fields: { front: 'besok', back: '내일' }, deck: d });
    expect(v.tts.front).toEqual([{ text: 'besok', lang: 'id-ID' }]);
  });

  it('작문 카드는 정답을 비교용으로 준다', () => {
    const v = getCardType('zh-sentence').view('ko-zh', { fields: { ko: '언제 가?', zh: '你什么时候去？' }, deck: d });
    expect(v.expected).toEqual({ text: '你什么时候去？', lang: 'zh-CN' });
  });

  it('필수 필드 검사', () => {
    expect(missingRequired(getCardType('zh-word'), { hanzi: '书', meaning: ' ' }).map((f) => f.key)).toEqual(['meaning']);
  });

  it('어조 말: 앞면은 예문과 질문, 뒷면에서 예문 뜻·말·느낌·이 문장에서를 보여 주고, 같은 말의 다른 예문은 다른 카드', () => {
    const t = getCardType('id-particle');
    const v = t.view('forward', { fields: { word: 'sih', meaning: '투덜대는 궁금함', example: 'Kenapa sih?', exampleKo: '도대체 왜?', note: '답답함' }, deck: d });
    expect(v.front).toEqual([
      { kind: 'prompt', text: '「sih」는 여기서 어떤 느낌일까?' },
      { kind: 'sentence', text: 'Kenapa sih?', lang: 'id-ID', emphasis: 'main', highlight: 'sih' },
    ]);
    // 뒷면: 말 · 느낌(위) → 예문 · 번역 · 이 문장에서(아래)
    expect(v.back.map((b) => b.kind)).toEqual(['word', 'meaning', 'sentence', 'sentence', 'memo']);
    expect(v.tts.front).toEqual([{ text: 'Kenapa sih?', lang: 'id-ID' }]);
    expect(t.duplicateKey({ word: 'sih', example: 'A' })).not.toBe(t.duplicateKey({ word: 'sih', example: 'B' }));
  });

  it('인도네시아어 구어: "예문 먼저 보기"를 켜면 앞면이 예문이고, 예문이 없으면 단어를 보여 준다', () => {
    const t = getCardType('id-spoken');
    const on = { ...d, settings: { ...d.settings, sentenceFirst: true } };
    const f = { word: 'pokoknya', meaning: '아무튼', example: 'Pokoknya aku ikut!', exampleKo: '아무튼 나도 갈 거야!' };
    expect(t.view('forward', { fields: f, deck: on }).front.map((b) => b.kind)).toEqual(['prompt', 'sentence']);
    expect(t.view('forward', { fields: f, deck: d }).front.map((b) => b.kind)).toEqual(['word']);
    expect(t.view('forward', { fields: { ...f, example: '' }, deck: on }).front.map((b) => b.kind)).toEqual(['word']);
    // 뒷면: 단어 · 뜻 · 꼬리표(표준형·어근·사용역) → 예문(배우는 말 강조) · 번역 · 메모
    const back = t.view('forward', { fields: { ...f, root: 'pokok', register: '구어', note: '말 앞에 온다' }, deck: d }).back;
    expect(back.map((b) => b.kind)).toEqual(['word', 'meaning', 'tags', 'sentence', 'sentence', 'memo']);
    expect(back[2]).toEqual({ kind: 'tags', items: ['어근 pokok', '구어'] });
    expect(back[3]).toMatchObject({ highlight: 'pokoknya' });
  });
});
