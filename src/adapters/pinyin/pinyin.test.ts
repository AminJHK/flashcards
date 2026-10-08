import { describe, expect, it } from 'vitest';
import { loadPinyin } from './pinyin';

describe('병음 자동 변환', () => {
  it('단어는 붙여 쓴다', async () => {
    const py = await loadPinyin();
    expect(py('图书馆', 'word')).toBe('túshūguǎn');
    expect(py('银行', 'word')).toBe('yínháng');
    expect(py('舒服', 'word')).toBe('shūfu');
  });

  it('문장은 띄어 쓰고, 문장부호는 영문으로 바꿔 앞말에 붙인다', async () => {
    const py = await loadPinyin();
    expect(py('我去图书馆，借书。', 'sentence')).toBe('wǒ qù tú shū guǎn, jiè shū.');
    expect(py('做ECG吗？', 'sentence')).toBe('zuò ECG ma?');
  });

  it('경성·得·다음자를 바로잡는다', async () => {
    const py = await loadPinyin();
    expect(py('请告诉我', 'sentence')).toBe('qǐng gào su wǒ');
    expect(py('您昨天晚上睡得好吗？', 'sentence')).toBe('nín zuó tiān wǎn shang shuì de hǎo ma?');
    expect(py('喝水的量', 'sentence')).toBe('hē shuǐ de liàng');
    expect(py('只吃了几口。', 'sentence')).toBe('zhǐ chī le jǐ kǒu.');
    expect(py('什么时候', 'sentence')).toBe('shén me shí hou');
  });

  it('명사 뒤 子는 경성, 전자 같은 말은 그대로', async () => {
    const py = await loadPinyin();
    expect(py('袋子', 'word')).toBe('dàizi');
    expect(py('肚子', 'word')).toBe('dùzi');
    expect(py('电子', 'word')).toBe('diànzǐ');
  });
});
