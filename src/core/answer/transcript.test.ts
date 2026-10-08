import { describe, expect, it } from 'vitest';
import { mergeTranscripts } from './transcript';

describe('mergeTranscripts', () => {
  it('안드로이드처럼 누적된 조각이 오면 같은 말을 반복하지 않는다 (실제 사례)', () => {
    expect(mergeTranscripts(['请告诉我你的', '请告诉我你的全名和', '请告诉我你的全名和秋香', '请告诉我你的全名和秋香日期'])).toBe('请告诉我你的全名和秋香日期');
  });

  it('서로 다른 조각은 이어 붙인다 (중국어는 띄어쓰기 없이)', () => {
    expect(mergeTranscripts(['你想', '什么时候', '去'])).toBe('你想什么时候去');
  });

  it('끝과 앞이 겹치면 한 번만', () => {
    expect(mergeTranscripts(['我胸口很闷', '很闷，像有块石头'])).toBe('我胸口很闷，像有块石头');
  });

  it('이미 들은 말을 다시 보내면 무시한다', () => {
    expect(mergeTranscripts(['你好', '你好'])).toBe('你好');
    expect(mergeTranscripts(['今天胸口疼', '胸口'])).toBe('今天胸口疼');
  });

  it('영어·인도네시아어는 띄어 쓴다', () => {
    expect(mergeTranscripts(['selamat', 'selamat pagi', 'apa kabar'])).toBe('selamat pagi apa kabar');
  });
});
