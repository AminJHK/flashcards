import type { CardType } from './types';
import { ttsText } from './types';

/**
 * 중국어 듣기 (환자의 말 알아듣기). 앞면은 소리만 들려주고, 뜻을 떠올린 뒤 정답을 본다.
 * 선택 템플릿(읽기)은 소리 없이 글자를 보고 뜻을 떠올린다.
 */
export const zhListen: CardType = {
  id: 'zh-listen',
  version: 1,
  name: '중국어 듣기',
  shortName: '듣기',
  description: '중국어를 소리로 먼저 듣고 뜻을 떠올려요. 필요하면 글자를 볼 수 있어요.',
  ttsField: 'zh',
  fields: [
    { key: 'zh', label: '중국어 문장', required: true, lang: 'zh-CN', input: 'sentence', placeholder: '例如 我胸口很闷' },
    { key: 'pinyin', label: '병음', input: 'latin', autoFrom: 'zh', placeholder: '중국어 문장을 쓰면 자동으로 채워져요' },
    { key: 'ko', label: '뜻', required: true, lang: 'ko-KR', input: 'sentence', placeholder: '예: 가슴이 답답해요' },
    { key: 'memo', label: '메모', input: 'memo', placeholder: '새 단어, 비슷한 표현' },
  ],
  templates: [
    { id: 'listen', label: '듣고 뜻 떠올리기', answer: 'reveal' },
    { id: 'read', label: '글자 보고 뜻 떠올리기', optional: true, answer: 'reveal' },
  ],
  view(templateId, ctx) {
    const f = ctx.fields;
    const memo = f.memo?.trim() ? [{ kind: 'memo' as const, text: f.memo.trim() }] : [];
    const pinyin = f.pinyin?.trim() ? [{ kind: 'pinyin' as const, text: f.pinyin.trim() }] : [];
    const say = { text: ttsText('zh', ctx), lang: 'zh-CN' };
    const zhMain = { kind: 'sentence' as const, text: f.zh ?? '', lang: 'zh-CN', emphasis: 'main' as const };
    const back = [zhMain, ...pinyin, { kind: 'divider' as const }, { kind: 'sentence' as const, text: f.ko ?? '', lang: 'ko-KR', emphasis: 'sub' as const }, ...memo];
    if (templateId === 'read') {
      return { front: [zhMain], back, tts: { front: [], back: [say] }, autoplay: 'back' };
    }
    return {
      front: [{ kind: 'listen', text: f.zh ?? '', lang: 'zh-CN' }],
      back,
      tts: { front: [say], back: [say] },
      autoplay: 'front',
    };
  },
  duplicateKey: (f) => (f.zh ?? '').replace(/[\s\p{P}]/gu, ''),
  summary: (f) => ({ title: f.zh ?? '', sub: f.ko ?? '' }),
  derive(changedKey, fields, deps): Record<string, string> {
    if (changedKey !== 'zh' || !deps.pinyin) return {};
    const zh = (fields.zh ?? '').trim();
    return { pinyin: zh ? deps.pinyin(zh, 'sentence') : '' };
  },
};
