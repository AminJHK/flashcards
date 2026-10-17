import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFace, withHighlight } from './CardFace';

const html = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>);

describe('카드 화면', () => {
  it('문장 안의 배우는 말을 강조한다 (대소문자 무시, 낱말 첫머리에서만)', () => {
    expect(html(withHighlight('Pokoknya aku ikut!', 'pokoknya'))).toBe('<mark class="cf-mark">Pokoknya</mark> aku ikut!');
    // 붙는 말(-nya 등)이 뒤에 와도 앞부분은 강조된다
    expect(html(withHighlight('Rumahnya jauh.', 'rumah'))).toBe('<mark class="cf-mark">Rumah</mark>nya jauh.');
    expect(html(withHighlight('Ada apa?', 'ada'))).toContain('<mark class="cf-mark">Ada</mark>');
    expect(html(withHighlight('bukan apa-apa', 'apa'))).toContain('<mark class="cf-mark">apa</mark>');
    expect(html(withHighlight('tanpa', 'pa'))).toBe('tanpa');
  });

  it('뒷면은 위(정답) · 아래(예문·메모) 두 칸, 예문과 번역은 한 묶음', () => {
    const out = renderToStaticMarkup(
      <CardFace
        side="back"
        blocks={[
          { kind: 'word', text: 'pokoknya', size: 'back', lang: 'id-ID' },
          { kind: 'meaning', text: '아무튼', size: 'back' },
          { kind: 'tags', items: ['어근 pokok', '구어'] },
          { kind: 'sentence', text: 'Pokoknya aku ikut!', lang: 'id-ID', emphasis: 'main', highlight: 'pokoknya' },
          { kind: 'sentence', text: '아무튼 나도 갈 거야!', lang: 'ko-KR', emphasis: 'sub' },
          { kind: 'memo', text: '말 앞에 온다' },
        ]}
      />,
    );
    expect(out).toMatch(/class="card-sheet back zoned"><span class="cf-head">.*pokoknya.*아무튼.*cf-tag.*<\/span><span class="cf-details"><span class="cf-example">.*cf-mark.*아무튼 나도 갈 거야!.*<\/span><span class="b-memo">/);
  });

  it('위 칸이 없으면(문장이 곧 정답인 카드) 가운데에 크게', () => {
    const out = renderToStaticMarkup(<CardFace side="back" blocks={[{ kind: 'sentence', text: '你好', lang: 'zh-CN', emphasis: 'main' }]} />);
    expect(out).toContain('class="card-sheet back"');
    expect(out).toContain('b-sentence main zh');
  });
});
