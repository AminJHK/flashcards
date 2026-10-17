import { useState, type ReactNode } from 'react';
import type { Block } from '../../core/cardTypes/types';
import { Icon } from './Icon';

type SentenceBlock = Extract<Block, { kind: 'sentence' }>;

/**
 * 카드 종류가 만든 블록을 카드 한 장 위에 그린다. 새 카드 종류도 이 블록들만 쓰면 화면 코드를 고칠 필요가 없다.
 *
 * 뒷면은 두 칸이다.
 * - 위(가운데): 첫 예문·메모가 나오기 전까지의 블록 = 정답 (단어 · 뜻 · 꼬리표)
 * - 아래(왼쪽 정렬, 위와 선으로 나눔): 예문(+번역)과 메모 = 정답을 이해하는 데 쓰는 정보
 * 위 칸이 비면(문장 카드처럼 문장이 곧 정답이면) 앞면처럼 가운데에 크게 그린다.
 */
export function CardFace({ blocks, side = 'front', onSpeak }: { blocks: readonly Block[]; side?: 'front' | 'back'; onSpeak?: () => void }) {
  const content = blocks.filter((b) => b.kind !== 'divider');
  const split = content.findIndex((b) => b.kind === 'sentence' || b.kind === 'memo');
  const zoned = side === 'back' && split > 0;
  if (!zoned) {
    return <span className={`card-sheet ${side}`}>{content.map((b, i) => renderBlock(b, i, onSpeak))}</span>;
  }
  const head = content.slice(0, split);
  const details = content.slice(split);
  return (
    <span className="card-sheet back zoned">
      <span className="cf-head">{head.map((b, i) => renderBlock(b, i, onSpeak))}</span>
      <span className="cf-details">{groupExamples(details).map((x, i) => (Array.isArray(x) ? <Example key={`ex${i}`} parts={x} /> : renderBlock(x, i, onSpeak)))}</span>
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
          {b.text}
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
