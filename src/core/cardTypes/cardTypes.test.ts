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
});
