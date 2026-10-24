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
    // 뒷면: 말 · 느낌(위) → 예문 · 번역 · 이 문장에서(아래). 이 문장에서의 자리(문두·문중·문미)는 예문을 보고 자동으로 붙는다
    expect(v.back.map((b) => b.kind)).toEqual(['word', 'meaning', 'tags', 'sentence', 'sentence', 'memo']);
    expect(v.back[2]).toEqual({ kind: 'tags', items: ['이 문장에서 · 문미'] });
    expect(v.tts.front).toEqual([{ text: 'Kenapa sih?', lang: 'id-ID' }]);
    // 붙는 자리 칸이 있으면 같이 보인다. 예전 단어(칸 없음)는 자동 표시만
    const withPos = t.view('forward', { fields: { word: 'kok', meaning: '왜', position: '문두 · 문미', example: 'Kok sepi?', exampleKo: '왜 조용해?' }, deck: d });
    expect(withPos.back[2]).toEqual({ kind: 'tags', items: ['붙는 자리 · 문두 · 문미', '이 문장에서 · 문두'] });
    expect(t.version).toBe(2);
    expect(t.migrate!(1, { word: 'sih' })).toEqual({ word: 'sih', position: '' });
    expect(t.duplicateKey({ word: 'sih', example: 'A' })).not.toBe(t.duplicateKey({ word: 'sih', example: 'B' }));
  });

  it('인도네시아어 구어: "예문 먼저 보기"를 켜면 앞면이 예문이고, 예문이 없으면 단어를 보여 준다', () => {
    const t = getCardType('id-spoken');
    const on = { ...d, settings: { ...d.settings, sentenceFirst: true } };
    const f = { word: 'pokoknya', meaning: '아무튼', example: 'Pokoknya aku ikut!', exampleKo: '아무튼 나도 갈 거야!' };
    expect(t.view('forward', { fields: f, deck: on }).front.map((b) => b.kind)).toEqual(['prompt', 'sentence']);
    // 연결어(pokoknya)는 덱 설정과 상관없이 예문 먼저, 다른 단어는 덱 설정을 따른다
    expect(t.view('forward', { fields: f, deck: d }).front.map((b) => b.kind)).toEqual(['prompt', 'sentence']);
    const kurang = { word: 'kurang', meaning: '부족한', example: 'Bisa kurang?', exampleKo: '깎아 줄 수 있어요?' };
    expect(t.view('forward', { fields: kurang, deck: d }).front.map((b) => b.kind)).toEqual(['word']);
    expect(t.view('forward', { fields: kurang, deck: on }).front.map((b) => b.kind)).toEqual(['prompt', 'sentence']);
    expect(t.view('forward', { fields: { ...f, example: '' }, deck: on }).front.map((b) => b.kind)).toEqual(['word']);
    // 뒷면: 단어 · 뜻 · 꼬리표(표준형·어근·사용역) → 예문·표현 목록(예문이 맨 위, 배우는 말 강조) · 메모
    const back = t.view('forward', { fields: { ...f, root: 'pokok', register: '구어', note: '말 앞에 온다' }, deck: d }).back;
    // pokoknya는 비슷한 말 묶음(아무튼·요점은)이 있어서 표가 붙는다
    expect(back.map((b) => b.kind)).toEqual(['word', 'meaning', 'tags', 'phrases', 'similar', 'memo']);
    expect(back[4]).toMatchObject({ kind: 'similar', current: 'pokoknya', title: '아무튼 · 요점은' });
    expect(back[2]).toEqual({ kind: 'tags', items: ['어근 pokok', '구어'] });
    expect(back[3]).toMatchObject({ highlight: 'pokoknya', label: '예문·표현', items: [{ text: 'Pokoknya aku ikut!', ko: '아무튼 나도 갈 거야!' }] });
  });

  it('인도네시아어 구어: 영어 뜻은 뜻 바로 아래, 자주 쓰는 표현은 예문 다음에 나온다', async () => {
    const { parsePhrases } = await import('./idSpoken');
    expect(parsePhrases('kurang tidur = 잠이 부족하다\nkurang suka → 별로 안 좋아하다\n\n뜻 없는 줄')).toEqual([
      { text: 'kurang tidur', ko: '잠이 부족하다' },
      { text: 'kurang suka', ko: '별로 안 좋아하다' },
    ]);
    const t = getCardType('id-spoken');
    expect(t.version).toBe(2);
    expect(t.migrate!(1, { word: 'kurang' })).toEqual({ word: 'kurang', en: '', phrases: '' });
    const f = { word: 'kurang', meaning: '부족한', en: 'less / not enough', example: 'Bisa kurang?', exampleKo: '깎아 줄 수 있어요?', phrases: 'kurang tidur = 잠이 부족하다', note: '메모' };
    const back = t.view('forward', { fields: f, deck: d }).back;
    expect(back.map((b) => b.kind)).toEqual(['word', 'meaning', 'gloss', 'phrases', 'memo']);
    expect(back[2]).toEqual({ kind: 'gloss', text: 'less / not enough', lang: 'en-US' });
    // 예문은 따로 상자 없이 목록 맨 위, 그다음 자주 쓰는 표현
    expect(back[3]).toEqual({ kind: 'phrases', items: [{ text: 'Bisa kurang?', ko: '깎아 줄 수 있어요?' }, { text: 'kurang tidur', ko: '잠이 부족하다' }], lang: 'id-ID', highlight: 'kurang', label: '예문·표현' });
    // 예전 단어(빈 칸)는 예문만
    expect(t.view('forward', { fields: { ...f, en: '', phrases: '' }, deck: d }).back.map((b) => b.kind)).toEqual(['word', 'meaning', 'phrases', 'memo']);
  });

  it('인도네시아어 구어: 같은 뜻의 짝(표준어 ↔ 구어)은 정답 쪽 단어 옆에만 나오고, 표준어 단어의 사용역은 "표준어"', () => {
    const t = getCardType('id-spoken');
    const pria = t.view('forward', { fields: { word: 'pria', meaning: '남자', standard: 'pria', register: '일반' }, deck: d });
    expect(pria.front).toEqual([{ kind: 'word', text: 'pria', size: 'front', lang: 'id-ID' }]);
    expect(pria.back[0]).toEqual({ kind: 'word', text: 'pria', size: 'back', lang: 'id-ID', pair: { text: 'cowok', label: '구어' } });
    expect(pria.back.find((b) => b.kind === 'tags')).toEqual({ kind: 'tags', items: ['표준어'] });
    const namun = t.view('forward', { fields: { word: 'namun', meaning: '그러나', register: '격식' }, deck: d });
    expect(namun.back.find((b) => b.kind === 'tags')).toEqual({ kind: 'tags', items: ['표준어 · 격식'] });
    // 구어 단어: 표준어 짝, 같은 표준형 꼬리표는 겹치지 않게 뺀다
    const dengerin = t.view('forward', { fields: { word: 'dengerin', meaning: '귀 기울여 듣다', standard: 'mendengarkan', root: 'dengar', register: '구어' }, deck: d });
    expect(dengerin.back[0]).toMatchObject({ pair: { text: 'mendengarkan', label: '표준어' } });
    expect(dengerin.back.find((b) => b.kind === 'tags')).toEqual({ kind: 'tags', items: ['어근 dengar', '구어'] }); // 표준형 꼬리표는 짝과 겹쳐서 뺀다
    expect(t.view('forward', { fields: { word: 'makan', meaning: '먹다' }, deck: d }).back[0]).not.toHaveProperty('pair');
    // sehingga(표준어) → jadi(구어) (카드 참고의 "구어는 jadi"를 짝으로)
    expect(t.view('forward', { fields: { word: 'sehingga', meaning: '그래서', register: '격식' }, deck: d }).back[0]).toMatchObject({ pair: { text: 'jadi', label: '구어' } });
    // 구어 단어는 표준형 칸이 짝: nyari · mencari
    expect(t.view('forward', { fields: { word: 'nyari', meaning: '찾다', standard: 'mencari', register: '구어' }, deck: d }).back[0]).toMatchObject({ pair: { text: 'mencari', label: '표준어' } });
    // 그 자체로 표준어인 기본 단어(sekarang, 사용역 일반)는 짝을 붙이지 않는다 (kini → sekarang은 kini 카드에서만)
    const sekarang = t.view('forward', { fields: { word: 'sekarang', meaning: '지금', standard: 'sekarang', register: '일반' }, deck: d });
    expect(sekarang.back[0]).not.toHaveProperty('pair');
    expect(sekarang.back.find((b) => b.kind === 'tags')).toEqual({ kind: 'tags', items: ['일반'] });
  });

  it('어조 말 자리 계산: 문두·문중·문미, 쉼표·문장부호는 단어에 안 센다', async () => {
    const { particlePlace } = await import('./idParticle');
    expect(particlePlace('Lho, kamu belum pulang?', 'lho')).toBe('문두');
    expect(particlePlace('Kamu suka pedas, kan?', 'kan')).toBe('문미');
    expect(particlePlace('Dia kan lagi sibuk.', 'kan')).toBe('문중');
    expect(particlePlace('Ya udah deh, aku ikut.', 'deh')).toBe('문중');
    expect(particlePlace('Tidak ada', 'sih')).toBeUndefined();
  });
});

