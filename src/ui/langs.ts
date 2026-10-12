export const LANGS: [string, string][] = [
  ['id-ID', '인도네시아어'],
  ['zh-CN', '중국어'],
  ['ko-KR', '한국어'],
  ['en-US', '영어'],
  ['ja-JP', '일본어'],
  ['vi-VN', '베트남어'],
  ['th-TH', '태국어'],
  ['es-ES', '스페인어'],
  ['fr-FR', '프랑스어'],
  ['de-DE', '독일어'],
];

/** 음성이 없을 때 보여줄 안내 */
export function noVoiceMessage(langs: readonly string[] | undefined): string {
  const names = (langs?.length ? langs : ['이']).map((l) => (l === '이' ? l : langName(l))).join('·');
  return `이 기기에 ${names} 음성이 없어서 읽지 못했어요. 휴대폰 설정 › 텍스트 음성 변환에서 ${names === '이' ? '해당 언어' : names} 음성 데이터를 설치하거나, 설정에서 자연스러운 음성(Gemini)을 연결해 보세요`;
}

export function langName(tag: string): string {
  return LANGS.find(([t]) => t === tag)?.[1] ?? tag;
}
