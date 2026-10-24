import { useState, type ReactNode } from 'react';
import type { Block } from '../../core/cardTypes/types';
import { Icon } from './Icon';

type SentenceBlock = Extract<Block, { kind: 'sentence' }>;

/**
 * 카드 종류가 만든 블록을 카드 한 장 위에 그린다. 새 카드 종류도 이 블록들만 쓰면 화면 코드를 고칠 필요가 없다.
 *
 * 뒷면은 두 칸이다.
 * - 위(가운데): 첫 예문·표현·메모가 나오기 전까지의 블록 = 정답 (단어 · 뜻 · 영어 뜻 · 꼬리표)
 * - 아래(왼쪽 정렬, 위와 선으로 나눔): 예문(+번역)·자주 쓰는 표현·메모 = 정답을 이해하는 데 쓰는 정보
 * 위 칸이 비면(문장 카드처럼 문장이 곧 정답이면) 앞면처럼 가운데에 크게 그린다.
 */
export function CardFace({ blocks, side = 'front', onSpeak }: { blocks: readonly Block[]; side?: 'front' | 'back'; onSpeak?: () => void }) {
  const content = blocks.filter((b) => b.kind !== 'divider');
  const split = content.findIndex((b) => b.kind === 'sentence' || b.kind === 'memo' || b.kind === 'phrases');
  const zoned = side === 'back' && split > 0;
  if (!zoned) {
    return <span className={`card-sheet ${side}`}>{content.map((b, i) => renderBlock(b, i, onSpeak))}</span>;
  }
  const head = content.slice(0, split);
  const details = content.slice(split);
  return (
    <span className="card-sheet back zoned">
      <span className="cf-head">{head.map((b, i) => renderBlock(b, i, onSpeak))}</span>
      <span className="cf-details">
        {groupExamples(details).map((x, i) =>
          Array.isArray(x) ? (
            <Example key={`ex${i}`} parts={x} />
          ) : x.kind === 'memo' ? (
            <span key={i} className="cf-note">
              <span className="cf-label">참고</span>
              <span className="b-memo">{withQuotes(x.text)}</span>
            </span>
          ) : (
            renderBlock(x, i, onSpeak)
          ),
        )}
      </span>
    </span>
  );
}

/** 예문(main)과 바로 뒤의 번역(sub)을 한 묶음으로 */
function groupExamples(blocks: readonly Block[]): (Block | SentenceBlock[])[] {
  const out: (Block | SentenceBlock[])[] = [];
  for (const b of blocks) {
    if (b.kind !== 'sentence') {
      out.push(b);
      continue;
    }
    const last = out[out.length - 1];
    if (b.emphasis === 'sub' && Array.isArray(last) && last.length === 1 && last[0]!.emphasis === 'main') last.push(b);
    else out.push([b]);
  }
  return out;
}

function Example({ parts }: { parts: SentenceBlock[] }) {
  return (
    <span className="cf-example">
      {parts.map((p, i) => (
        <span key={i} lang={p.lang} className={`${p.emphasis === 'main' ? 'cf-ex-main' : 'cf-ex-sub'}${p.lang.startsWith('zh') ? ' zh' : ''}`}>
          {withHighlight(p.text, p.highlight)}
        </span>
      ))}
    </span>
  );
}

/**
 * 메모 안의 따옴표 친 외국어 표현('Tahan dulu' 잠깐 참아)을 예문처럼 보이게 한다.
 * 라틴 문자가 든 따옴표만 바꾸고, 한국어 따옴표('그러니까!')는 그대로 둔다.
 */
export function withQuotes(text: string): ReactNode {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(/'([^'\n]+)'/g)) {
    if (!/[A-Za-z]/.test(m[1]!)) continue;
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push(
      <span key={m.index} className="cf-quote" lang="und-Latn">
        {m[1]}
      </span>,
    );
    at = m.index! + m[0].length;
  }
  if (!out.length) return text;
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** 문장 안의 배우는 말을 강조한다 (대소문자 무시, 낱말 첫머리에서만 맞춘다: kamu ≠ kamus의 중간) */
export function withHighlight(text: string, word?: string): ReactNode {
  const w = word?.trim();
  if (!w) return text;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}`, 'giu');
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push(
      <mark key={m.index} className="cf-mark">
        {m[0]}
      </mark>,
    );
    at = m.index! + m[0].length;
  }
  if (!out.length) return text;
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function renderBlock(b: Block, i: number, onSpeak?: () => void): ReactNode {
  switch (b.kind) {
    case 'hanzi':
      return (
        <span key={i} lang="zh-CN" className={`b-hanzi ${b.size}`}>
          {b.text}
        </span>
      );
    case 'pinyin':
      return (
        <span key={i} className="b-pinyin">
          {b.text}
        </span>
      );
    case 'word':
      // 구어가 주인공: 구어 카드면 표준어를 아래에 작은 회색 한 줄로
      if (b.pair?.label === '표준어')
        return (
          <span key={i} className="b-word-std-wrap">
            <span lang={b.lang} className={`b-word ${b.size}`}>
              {b.text}
            </span>
            <span className="b-word-std">
              표준어 <span lang={b.lang}>{b.pair.text}</span>
            </span>
          </span>
        );
      // 표준어 카드면 이 단어는 회색, 구어 짝을 같은 크기 강조색으로
      if (b.pair)
        return (
          <span key={i} className="b-word-pair">
            <span lang={b.lang} className={`b-word ${b.size} b-word-dim`}>
              {b.text}
            </span>
            <span className={`b-word ${b.size} b-word-dot`} aria-hidden="true">
              ·
            </span>
            <span className="b-word-mate">
              <span lang={b.lang} className={`b-word ${b.size} b-word-alt`}>
                {b.pair.text}
              </span>
              <span className="b-word-mate-label">{b.pair.label}</span>
            </span>
          </span>
        );
      return (
        <span key={i} lang={b.lang} className={`b-word ${b.size}`}>
          {b.text}
        </span>
      );
    case 'meaning':
      return (
        <span key={i} className={`b-meaning ${b.size}`}>
          {b.text}
        </span>
      );
    case 'sentence':
      return (
        <span key={i} lang={b.lang} className={`b-sentence ${b.emphasis}${b.lang.startsWith('zh') ? ' zh' : ''}`}>
          {withHighlight(b.text, b.highlight)}
        </span>
      );
    case 'gloss':
      return (
        <span key={i} lang={b.lang} className="b-gloss">
          {b.text}
        </span>
      );
    case 'phrases':
      return (
        <span key={i} className="cf-phrases">
          <span className="cf-label">{b.label ?? '자주 쓰는 표현'}</span>
          {b.items.map((p, j) => (
            <span key={j} className="cf-phrase">
              <span lang={b.lang} className="cf-phrase-text">
                {withHighlight(p.text, b.highlight)}
              </span>
              <span className="cf-phrase-ko">{p.ko}</span>
            </span>
          ))}
        </span>
      );
    case 'tags':
      return (
        <span key={i} className="cf-tags">
          {b.items.map((t) => (
            <span key={t} className="cf-tag">
              {t}
            </span>
          ))}
        </span>
      );
    case 'prompt':
      return (
        <span key={i} className="b-prompt">
          {b.text}
        </span>
      );
    case 'divider':
      return null;
    case 'listen':
      return <ListenBlock key={i} text={b.text} lang={b.lang} onSpeak={onSpeak} />;
    case 'memo':
      return (
        <span key={i} className="b-memo">
          {withQuotes(b.text)}
        </span>
      );
  }
}

/** 듣기 카드 앞면: 큰 재생 버튼. 글자는 원할 때만 보여준다. */
function ListenBlock({ text, lang, onSpeak }: { text: string; lang: string; onSpeak?: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <span className="b-prompt">듣고 뜻을 떠올려 보세요</span>
      <button type="button" className="listen-btn" aria-label="다시 듣기" onClick={onSpeak}>
        <Icon name="speaker" size={44} strokeWidth={1.6} />
      </button>
      {shown ? (
        <span lang={lang} className="b-sentence main zh">
          {text}
        </span>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShown(true)}>
          글자 보기
        </button>
      )}
    </>
  );
}
