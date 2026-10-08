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

export function langName(tag: string): string {
  return LANGS.find(([t]) => t === tag)?.[1] ?? tag;
}
