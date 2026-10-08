import type { DeriveDeps } from '../../core/cardTypes/types';

const FULLWIDTH: Record<string, string> = { '，': ',', '、': ',', '。': '.', '？': '?', '！': '!', '；': ';', '：': ':' };

/**
 * pinyin-pro가 자주 틀리는 말 (경성, 得/地, 다음자). 학습자가 보는 병음이라 바로잡는다.
 * 값은 글자마다 띄어 쓴다.
 */
const FIXES: Record<string, string> = {
  // 경성
  告诉: 'gào su',
  时候: 'shí hou',
  晚上: 'wǎn shang',
  早上: 'zǎo shang',
  舒服: 'shū fu',
  东西: 'dōng xi',
  衣服: 'yī fu',
  休息: 'xiū xi',
  意思: 'yì si',
  知道: 'zhī dao',
  认识: 'rèn shi',
  明白: 'míng bai',
  喜欢: 'xǐ huan',
  清楚: 'qīng chu',
  下巴: 'xià ba',
  胳膊: 'gē bo',
  咳嗽: 'ké sou',
  枕头: 'zhěn tou',
  舌头: 'shé tou',
  石头: 'shí tou',
  骨头: 'gǔ tou',
  丈夫: 'zhàng fu',
  力气: 'lì qi',
  麻烦: 'má fan',
  谢谢: 'xiè xie',
  // 得 · 地 (구조조사)
  睡得: 'shuì de',
  跳得: 'tiào de',
  弯得: 'wān de',
  说得: 'shuō de',
  吃得: 'chī de',
  走得: 'zǒu de',
  疼得: 'téng de',
  有力地: 'yǒu lì de',
  一阵一阵地: 'yí zhèn yí zhèn de',
  一阵一阵的: 'yí zhèn yí zhèn de',
  慢慢地: 'màn màn de',
  // 다음자
  尿量: 'niào liàng',
  引流量: 'yǐn liú liàng',
  的量: 'de liàng',
  只吃: 'zhǐ chī',
  只有: 'zhǐ yǒu',
  只是: 'zhǐ shì',
  抽血: 'chōu xiě',
  漏跳: 'lòu tiào',
};

/** "子"가 경성이 아닌 말 */
const ZI_FULL_TONE = new Set(['电子', '原子', '分子', '质子', '粒子', '女子', '男子', '君子', '孔子', '因子', '种子']);

interface Item {
  origin: string;
  pinyin: string;
  isZh: boolean;
}

type PinyinFn = NonNullable<DeriveDeps['pinyin']>;

/** 병음 사전은 크기 때문에 필요할 때 불러온다. */
let loaded: PinyinFn | undefined;
let loading: Promise<PinyinFn> | undefined;

export function loadPinyin(): Promise<PinyinFn> {
  loading ??= import('pinyin-pro').then(({ pinyin, customPinyin }) => {
    customPinyin(FIXES);
    const fn: PinyinFn = (text, mode) => {
      const items = pinyin(text, { type: 'all', toneType: 'symbol' }) as Item[];
      const tokens: { text: string; zh: boolean; punct: boolean }[] = [];
      items.forEach((it, i) => {
        if (it.isZh) {
          const prev = items[i - 1];
          const py = it.origin === '子' && prev?.isZh && !ZI_FULL_TONE.has(prev.origin + '子') ? 'zi' : it.pinyin;
          tokens.push({ text: py, zh: true, punct: false });
          return;
        }
        const ch = FULLWIDTH[it.origin] ?? it.origin;
        if (/\s/.test(ch)) return;
        const punct = /[\p{P}\p{S}]/u.test(ch);
        const last = tokens[tokens.length - 1];
        // 영문·숫자는 이어 붙여서 한 덩어리로
        if (last && !last.zh && !last.punct && !punct) last.text += ch;
        else tokens.push({ text: ch, zh: false, punct });
      });
      if (mode === 'word') return tokens.map((t) => t.text).join('');
      // 문장: 글자마다 띄우고, 문장부호는 앞말에 붙인다
      return tokens.reduce((out, t) => (t.punct || !out ? out + t.text : `${out} ${t.text}`), '');
    };
    loaded = fn;
    return fn;
  });
  return loading;
}

export function pinyinNow(): DeriveDeps['pinyin'] | undefined {
  return loaded;
}
