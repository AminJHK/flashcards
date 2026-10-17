import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Speech } from '../../core/cardTypes/types';

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
}

/** 기기 음성을 흉내 낸다. 읽도록 넘긴 것들을 spoken에 모은다. */
function fakeDevice(voices: FakeVoice[], autoEnd = false) {
  const spoken: { text: string; lang: string; voice?: string; rate?: number; pitch?: number }[] = [];
  class Utterance {
    lang = '';
    rate = 1;
    pitch = 1;
    voice: FakeVoice | null = null;
    onend?: () => void;
    constructor(public text: string) {}
  }
  const g = globalThis as Record<string, unknown>;
  g.SpeechSynthesisUtterance = Utterance;
  g.window = {
    speechSynthesis: {
      getVoices: () => voices,
      cancel: () => {},
      speak: (u: Utterance) => {
        spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name, ...(u.rate !== 0.9 ? { rate: u.rate } : {}), ...(u.pitch !== 1 ? { pitch: u.pitch } : {}) });
        if (autoEnd) queueMicrotask(() => u.onend?.());
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };
  return spoken;
}

const EN = { name: 'English US', lang: 'en-US', localService: true };
const ES = { name: 'Spanish Spain', lang: 'es_ES', localService: true };
const ES_MX = { name: 'Spanish Mexico', lang: 'es-MX', localService: true };

type Mod = typeof import('./webSpeech');

describe('기기 음성', () => {
  let speak: Mod['speak'];
  let missingVoiceLangs: Mod['missingVoiceLangs'];
  // 음성 목록은 모듈 안에 기억해 두므로, 테스트마다 새로 불러온다
  const load = async () => ({ speak, missingVoiceLangs } = await import('./webSpeech'));
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.window;
    delete g.SpeechSynthesisUtterance;
  });

  it('목소리를 고르지 않았으면 목소리를 정하지 않고 언어만 알려서 휴대폰 엔진의 기본 목소리로 읽는다', async () => {
    const spoken = fakeDevice([EN, ES]);
    await load();
    expect(speak([{ text: 'la casa', lang: 'es-ES' }])).toBe(true);
    expect(spoken).toEqual([{ text: 'la casa', lang: 'es_ES', voice: undefined }]);
  });

  it('고른 목소리가 있으면 그 목소리로, 엔진을 바꿔서 사라졌으면 기본 목소리로 읽는다', async () => {
    const spoken = fakeDevice([EN, ES, { name: 'Spanish Spain 2', lang: 'es-ES', localService: true }]);
    await load();
    speak([{ text: 'la casa', lang: 'es-ES' }], { 'es-ES': 'Spanish Spain 2' });
    speak([{ text: 'el gato', lang: 'es-ES' }], { 'es-ES': 'Google español' });
    expect(spoken).toEqual([
      { text: 'la casa', lang: 'es-ES', voice: 'Spanish Spain 2' },
      { text: 'el gato', lang: 'es_ES', voice: undefined },
    ]);
  });

  it('속도와 높낮이를 앱 설정 값으로 보낸다 (휴대폰 설정 값은 브라우저가 덮어쓴다)', async () => {
    const spoken = fakeDevice([ES]);
    await load();
    speak([{ text: 'la casa', lang: 'es-ES' }], {}, 0.7, 0.8);
    expect(spoken).toEqual([{ text: 'la casa', lang: 'es_ES', voice: undefined, rate: 0.7, pitch: 0.8 }]);
  });

  it('같은 스페인어면 지역이 달라도 가까운 음성의 언어로 읽는다 (es-ES가 먼저)', async () => {
    const spoken = fakeDevice([ES_MX, EN]);
    await load();
    expect(speak([{ text: 'la casa', lang: 'es-ES' }])).toBe(true);
    expect(spoken[0]!.lang).toBe('es-MX');
  });

  it('스페인어 음성이 없으면 영어 음성으로 억지로 읽지 않고 없다고 알린다', async () => {
    const spoken = fakeDevice([EN]);
    await load();
    expect(speak([{ text: 'la casa', lang: 'es-ES' }])).toBe(false);
    expect(spoken).toEqual([]);
    expect(missingVoiceLangs([{ text: 'la casa', lang: 'es-ES' }])).toEqual(['es-ES']);
  });

  it('읽을 수 있는 문장만 읽는다', async () => {
    const spoken = fakeDevice([EN]);
    await load();
    speak([
      { text: 'la casa', lang: 'es-ES' },
      { text: 'the house', lang: 'en-US' },
    ]);
    expect(spoken.map((s) => s.text)).toEqual(['the house']);
  });

  it('목록에서는 기기에 저장된 음성(인터넷 없이 나오는 것)이 먼저 나온다', async () => {
    fakeDevice([{ name: 'Google español (network)', lang: 'es-ES', localService: false }, { name: 'Samsung Spanish', lang: 'es-ES', localService: true }, EN]);
    await load();
    const { voicesFor } = await import('./webSpeech');
    expect(voicesFor('es-ES')[0]!.name).toBe('Samsung Spanish');
  });

  it('음성 목록이 늦게 도착해도 기다렸다가 고른 음성으로 읽는다', async () => {
    const voices: FakeVoice[] = [];
    const spoken = fakeDevice(voices);
    const synth = (globalThis as unknown as { window: { speechSynthesis: { addEventListener: (e: string, f: () => void) => void } } }).window.speechSynthesis;
    let fire: () => void = () => {};
    synth.addEventListener = (_e, f) => (fire = f);
    await load();
    const { voicesReady } = await import('./webSpeech');
    const ready = voicesReady(1000);
    voices.push(EN, ES); // 이제 도착
    fire();
    await ready;
    speak([{ text: 'la casa', lang: 'es-ES' }], { 'es-ES': 'Spanish Spain' });
    expect(spoken).toEqual([{ text: 'la casa', lang: 'es_ES', voice: 'Spanish Spain' }]);
  });

  it('"휴대폰 기본 목소리"를 고르면 노출된 음성이 있어도 voice를 지정하지 않고 언어만 보낸다', async () => {
    const spoken = fakeDevice([{ name: 'Indonesian (Indonesia)', lang: 'id-ID', localService: true }]);
    await load();
    const { SYSTEM_DEFAULT_VOICE } = await import('./webSpeech');
    expect(speak([{ text: 'Apa kabar?', lang: 'id-ID' }], { 'id-ID': SYSTEM_DEFAULT_VOICE })).toBe(true);
    expect(spoken).toEqual([{ text: 'Apa kabar?', lang: 'id-ID', voice: undefined }]);
  });

  it('브라우저에 언어 음성이 없어도 "휴대폰 기본 목소리"를 골랐으면 기본 엔진에 재생을 요청한다', async () => {
    const spoken = fakeDevice([EN]);
    await load();
    const { SYSTEM_DEFAULT_VOICE } = await import('./webSpeech');
    const sample: Speech = { text: 'Apa kabar?', lang: 'id-ID' };
    expect(speak([sample], { 'id-ID': SYSTEM_DEFAULT_VOICE })).toBe(true);
    expect(spoken).toEqual([{ text: 'Apa kabar?', lang: 'id-ID', voice: undefined }]);
    expect(missingVoiceLangs([sample], { 'id-ID': SYSTEM_DEFAULT_VOICE })).toEqual([]);
    expect(missingVoiceLangs([sample])).toEqual(['id-ID']);
  });

  it('전체 이야기 다시 듣기(끝날 때까지 기다리기)에서도 같은 규칙과 높낮이를 쓴다', async () => {
    const spoken = fakeDevice([{ name: 'Indonesian (Indonesia)', lang: 'id-ID', localService: true }], true);
    await load();
    const { speakAndWait } = await import('./webSpeech');
    const ok = await speakAndWait({ text: 'Aku di sini.', lang: 'id-ID' }, {}, 0.85, 0.9);
    expect(ok).toBe(true);
    expect(spoken).toEqual([{ text: 'Aku di sini.', lang: 'id-ID', voice: undefined, rate: 0.85, pitch: 0.9 }]);
  });

  it('음성 목록이 아직 도착하지 않았으면 언어 태그를 믿고 기기에 맡긴다', async () => {
    const spoken = fakeDevice([]);
    await load();
    expect(speak([{ text: 'la casa', lang: 'es-ES' }])).toBe(true);
    expect(spoken).toEqual([{ text: 'la casa', lang: 'es-ES', voice: undefined }]);
    expect(missingVoiceLangs([{ text: 'la casa', lang: 'es-ES' }])).toEqual([]);
  });
});
