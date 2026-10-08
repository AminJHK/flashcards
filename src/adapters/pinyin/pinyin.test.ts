import { describe, expect, it } from 'vitest';
import { loadPinyin } from './pinyin';

describe('병음 자동 변환', () => {
  it('단어는 붙여 쓰고, 문장은 띄어 쓰되 문장부호 앞은 붙인다', async () => {
    const py = await loadPinyin();
    expect(py('图书馆', 'word')).toBe('túshūguǎn');
    expect(py('银行', 'word')).toBe('yínháng');
    expect(py('你打算什么时候去？', 'sentence')).toBe('nǐ dǎ suàn shén me shí hòu qù?');
    expect(py('我去图书馆，借书。', 'sentence')).toBe('wǒ qù tú shū guǎn, jiè shū.');
  });
});
