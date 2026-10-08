import { useState } from 'react';
import type { Block } from '../../core/cardTypes/types';
import { Icon } from './Icon';

/** 카드 종류가 만든 블록을 그린다. 새 카드 종류도 이 블록들만 쓰면 화면 코드를 고칠 필요가 없다. */
export function CardFace({ blocks, onSpeak }: { blocks: readonly Block[]; onSpeak?: () => void }) {
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
          case 'listen':
            return <ListenBlock key={i} text={b.text} lang={b.lang} onSpeak={onSpeak} />;
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
