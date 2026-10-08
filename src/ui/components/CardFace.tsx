import type { Block } from '../../core/cardTypes/types';

/** 카드 종류가 만든 블록을 그린다. 새 카드 종류도 이 블록들만 쓰면 화면 코드를 고칠 필요가 없다. */
export function CardFace({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
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
                {b.text}
              </span>
            );
          case 'prompt':
            return (
              <span key={i} className="b-prompt">
                {b.text}
              </span>
            );
          case 'divider':
            return <span key={i} className="b-divider" aria-hidden="true" />;
          case 'memo':
            return (
              <span key={i} className="b-memo">
                {b.text}
              </span>
            );
        }
      })}
    </>
  );
}
