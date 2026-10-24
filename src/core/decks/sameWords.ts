/**
 * 뜻이 거의 같은 구어 짝 (사용자 요청 2026-10-24). 대표(키) = 말할 때 쓸 말, 값 = 같은 뜻의 다른 말 (알아듣기만).
 * 대표는 자막 빈도표 순위와 "인도네시아 전역에서 통하는지"로 골랐다 (자카르타식 kelar·nyampe·bantuin보다 selesai·sampe·bantu).
 * 카드 정답 쪽: 대표가 아닌 카드는 대표를 강조색으로 옆에 (말할 때는 이쪽), 대표 카드는 아래에 작은 회색 "같은 말 …".
 * 이야기: 같은 뜻 말을 골고루 섞어 쓰게 한다 (plan.ts, 알아듣기 연습). 비슷한 말 묶음(synonymGroups.ts)·SPOKEN_OF와 겹치지 않게.
 */
export const SAME_WORDS: Readonly<Record<string, readonly string[]>> = {
  selesai: ['kelar'],
  tanya: ['nanya'],
  perlu: ['butuh'],
  pikir: ['mikir'],
  sampe: ['nyampe'],
  bantu: ['bantuin'],
  coba: ['nyoba'],
  kirim: ['ngirim'],
  jual: ['jualan'],
  pilih: ['milih'],
  taro: ['naro'],
  telpon: ['nelpon'],
  sadar: ['nyadar'],
  berharap: ['ngarep'],
  kunci: ['ngunci'],
  sembuh: ['pulih'],
  seru: ['asik'],
  keren: ['mantap'],
  oke: ['sip'],
  ayo: ['yuk'],
  betul: ['bener'],
  aduh: ['waduh', 'ampun', 'astaga'],
  temen: ['sobat', 'kawan'],
  toilet: ['kamar mandi'],
  diskon: ['potongan'],
  rapat: ['pertemuan'],
  waktu: ['pas', 'saat'],
  jam: ['pukul'],
};

const MAIN_OF = new Map(Object.entries(SAME_WORDS).flatMap(([main, others]) => others.map((o) => [o, main] as const)));

/** 이 말의 대표 (대표가 아니면). 대표면 undefined */
export const sameMainOf = (word: string): string | undefined => MAIN_OF.get(word.trim().toLowerCase());
/** 대표의 같은 뜻 말들 */
export const sameOthersOf = (word: string): readonly string[] => SAME_WORDS[word.trim().toLowerCase()] ?? [];
