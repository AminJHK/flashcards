import type { DeckSettings, Note } from '../model/types';

/**
 * "연결어·표현": 뜻이 한 단어로 딱 떨어지지 않고 문맥에서 정해지는 말 (아무튼, 분명히, ~하도록, ~인 것 같다 …).
 * 인도네시아어 구어체 덱의 단어 중 이런 말만 따로 모아, 예문 먼저 보기로 천천히 공부하게 한다.
 */
export const CONNECTOR_DECK_NAME = '연결어·표현';

export const CONNECTOR_DECK_SETTINGS: DeckSettings = {
  defaultTypeId: 'id-spoken',
  reverseEnabled: false,
  newPerDay: 3,
  sentenceFirst: true,
  autoplay: 'front',
  langs: { front: 'id-ID', back: 'ko-KR' },
};

/**
 * 옮길 말 (직접 고른 목록). 뜻이 한 단어로 딱 떨어지지 않고 문장 속에서 정해지는 말만 넣었다.
 * yang, di, ke, dari, dan, tapi, atau 같은 기본 단어는 뜻이 고정돼 있어서 일반 덱에서 빨리 익히는 게 낫다.
 */
export const CONNECTOR_WORDS = [
  // 아무튼·분명히·사실은 같은 말
  'pokoknya', 'pasti', 'tentu', 'sebenernya', 'sebenarnya', 'sungguh', 'bahkan', 'malah', 'apalagi', 'kebetulan', 'ternyata', 'akhirnya', 'emang', 'berarti', 'jadi',
  'omong-omong', 'terserah', 'entah', 'mending', 'daripada', 'bukannya', 'katanya', 'menurut',
  // ~하도록·~인 것 같다·~했어야 (바람·추측·당위)
  'supaya', 'biar', 'demi', 'kayaknya', 'rasanya', 'harusnya', 'sebaiknya', 'mungkin',
  // 이유·양보·때 (문맥에 따라 쓰임이 갈리는 것)
  'soalnya', 'gara-gara', 'walaupun', 'meski', 'sementara', 'pas', 'abis', 'terus', 'sebelumnya', 'selanjutnya',
];
const WORD_SET = new Set(CONNECTOR_WORDS);

/** 이 노트가 연결어·표현에 들어갈 말인지 (인도네시아어 구어 단어만) */
export function isConnector(note: Pick<Note, 'typeId' | 'fields'> & Partial<Pick<Note, 'tags'>>): boolean {
  return note.typeId === 'id-spoken' && WORD_SET.has((note.fields.word ?? '').trim().toLowerCase());
}
