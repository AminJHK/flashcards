import type { DeriveDeps } from '../../core/cardTypes/types';

const FULLWIDTH: Record<string, string> = { '，': ',', '、': ',', '。': '.', '？': '?', '！': '!', '；': ';', '：': ':' };

/** 병음 사전은 크기 때문에 필요할 때 불러온다. */
let loaded: DeriveDeps['pinyin'] | undefined;
let loading: Promise<DeriveDeps['pinyin']> | undefined;

export function loadPinyin(): Promise<NonNullable<DeriveDeps['pinyin']>> {
  loading ??= import('pinyin-pro').then(({ pinyin }) => {
    const fn = (text: string, mode: 'word' | 'sentence') => {
      const out = pinyin(text, { toneType: 'symbol', nonZh: 'consecutive' });
      if (mode === 'word') return out.replace(/\s+/g, '');
      // 병음에는 영문 문장부호를 쓰고, 문장부호 앞 띄어쓰기는 없앤다
      return out
        .replace(/[，、。？！；：]/g, (ch) => FULLWIDTH[ch] ?? ch)
        .replace(/\s+([,.?!;:])/g, '$1');
    };
    loaded = fn;
    return fn;
  });
  return loading as Promise<NonNullable<DeriveDeps['pinyin']>>;
}

export function pinyinNow(): DeriveDeps['pinyin'] | undefined {
  return loaded;
}
