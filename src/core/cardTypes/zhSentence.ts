import type { CardType } from './types';
import { ttsText } from './types';

/**
 * 중국어 작문 (한국어 문장 → 중국어). 답을 직접 쓰거나 말한 다음 정답과 비교한다.
 * 역방향(중국어 → 한국어)은 읽기·듣기 연습용.
 */
export const zhSentence: CardType = {
  id: 'zh-sentence',
  version: 1,
  name: '중국어 작문',
  shortName: '작문',
  description: '한국어 문장을 보고 중국어로 쓰거나 말해요. 쓴 답을 정답과 비교해 보여줘요.',
  ttsField: 'zh',
  fields: [
    { key: 'ko', label: '한국어 문장', required: true, lang: 'ko-KR', input: 'sentence', placeholder: '예: 언제 갈 생각이야?' },
    { key: 'zh', label: '중국어 문장', required: true, lang: 'zh-CN', input: 'sentence', placeholder: '例如 你打算什么时候去？' },
    { key: 'pinyin', label: '병음', input: 'latin', autoFrom: 'zh', placeholder: '중국어 문장을 쓰면 자동으로 채워져요' },
    { key: 'memo', label: '메모', input: 'memo', placeholder: '문법 포인트, 비슷한 표현' },
  ],
  templates: [
    { id: 'ko-zh', label: '한국어 → 중국어 (쓰기·말하기)', answer: 'produce' },
    { id: 'zh-ko', label: '중국어 → 한국어 (읽기·듣기)', optional: true, answer: 'reveal' },
  ],
  view(templateId, ctx) {
    const f = ctx.fields;
    const memo = f.memo?.trim() ? [{ kind: 'memo' as const, text: f.memo.trim() }] : [];
    const pinyin = f.pinyin?.trim() ? [{ kind: 'pinyin' as const, text: f.pinyin.trim() }] : [];
    const say = { text: ttsText('zh', ctx), lang: 'zh-CN' };
    const zhMain = { kind: 'sentence' as const, text: f.zh ?? '', lang: 'zh-CN', emphasis: 'main' as const };
    const koMain = { kind: 'sentence' as const, text: f.ko ?? '', lang: 'ko-KR', emphasis: 'main' as const };
    const koSub = { kind: 'sentence' as const, text: f.ko ?? '', lang: 'ko-KR', emphasis: 'sub' as const };
    if (templateId === 'zh-ko') {
      return {
        front: [zhMain],
        back: [zhMain, ...pinyin, { kind: 'divider' }, koSub, ...memo],
        tts: { front: [say], back: [say] },
      };
    }
    return {
      front: [{ kind: 'prompt', text: '중국어로 쓰거나 말해보세요' }, koMain],
      back: [zhMain, ...pinyin, { kind: 'divider' }, koSub, ...memo],
      tts: { front: [], back: [say] },
      expected: { text: f.zh ?? '', lang: 'zh-CN' },
    };
  },
  duplicateKey: (f) => (f.zh ?? '').replace(/\s+/g, ''),
  summary: (f) => ({ title: f.ko ?? '', sub: f.zh ?? '' }),
  derive(changedKey, fields, deps): Record<string, string> {
    if (changedKey !== 'zh' || !deps.pinyin) return {};
    const zh = (fields.zh ?? '').trim();
    return { pinyin: zh ? deps.pinyin(zh, 'sentence') : '' };
  },
};
