import type { Pack, PackNote } from './types';

/**
 * 인도네시아어 어조 말 (문장 끝·중간에 붙는 말) 60장. 말마다 예문 6개.
 * 한국어 한 단어로 옮겨지지 않는 말이라 뜻을 외우지 않고, 여러 예문을 계속 보면서 느낌을 익힌다.
 * 예문과 설명은 직접 써서 현지인 검증은 하지 않았다. 어색한 문장이 있으면 알려 주면 고친다.
 * 이미 설치한 덱에는 뒤의 카드만 이어서 넣는다 (packAdditions): 순서를 바꾸거나 중간에 끼워 넣지 말고 뒤에 붙일 것.
 */
type Ex = [example: string, exampleKo: string, note?: string];

function particle(word: string, meaning: string, examples: Ex[]): PackNote[] {
  return examples.map(([example, exampleKo, note]) => ({
    typeId: 'id-particle',
    fields: { word, meaning, example, exampleKo, note: note ?? '' },
    tags: ['어조 말', word],
  }));
}

export const indonesianParticles: Pack = {
  id: 'indonesian-particles',
  name: '인도네시아어 어조 말 · 예문 60장',
  description: 'sih, dong, deh, kok, kan, lho, nih, tuh, yah, nah. 뜻을 외우지 않고, 예문을 계속 보면서 말투의 느낌을 익혀요.',
  deckName: '인도네시아어 어조 말',
  deckSettings: {
    defaultTypeId: 'id-particle',
    reverseEnabled: false,
    newPerDay: 5,
    autoplay: 'front',
    langs: { front: 'id-ID', back: 'ko-KR' },
  },
  notes: [
    ...particle('sih', '투덜대는 궁금함 · ~긴 한데', [
      ['Kenapa sih kamu telat terus?', '도대체 넌 왜 계속 늦어?', '질문에 sih가 붙으면 궁금함에 답답함·짜증이 섞인 "도대체".'],
      ['Itu apa sih?', '그게 도대체 뭐야?', '궁금한데 살짝 답답한 느낌.'],
      ['Enak sih, tapi mahal.', '맛있긴 한데 비싸.', '평서문의 sih는 "~긴 한데". 뒤에 tapi(그런데)가 자주 온다.'],
      ['Aku sih nggak masalah.', '나는 상관없는데.', '"다른 사람은 몰라도 나는"처럼 내 입장을 살짝 밝힌다.'],
      ['Siapa sih dia?', '걔 도대체 누구야?'],
      ['Bagus sih filmnya.', '영화는 괜찮긴 했어.', '완전히 칭찬은 아니고 "괜찮긴 한데…" 하는 여운.'],
    ]),
    ...particle('dong', '조르기 · 당연하지', [
      ['Bantuin dong!', '좀 도와줘!', '부탁을 부드럽게 조르는 느낌.'],
      ['Iya dong, pasti.', '당연하지, 물론이야.', '"당연하지"라고 힘주어 말할 때.'],
      ['Jangan gitu dong.', '그러지 좀 마.', '말릴 때도 부드럽게 조르듯 말한다.'],
      ['Cepetan dong, udah telat.', '빨리 좀 해, 늦었어.'],
      ['Kasih tahu dong!', '좀 알려 줘!'],
      ['Ya bisa dong!', '당연히 되지!'],
    ]),
    ...particle('deh', '가볍게 결정·권유 · ~할게, ~해 봐', [
      ['Ya udah deh, aku ikut.', '그래 알았어, 나도 갈게.', '못 이기는 척 받아들일 때.'],
      ['Coba deh kamu cicipi.', '한번 먹어 봐.', '"한번 ~해 봐"라고 권한다.'],
      ['Yang ini aja deh.', '이걸로 할게.', '고민 끝에 가볍게 정할 때.'],
      ['Aku pulang dulu deh.', '나 먼저 갈게.'],
      ['Syukur deh kamu udah sembuh.', '네가 나아서 다행이야.', 'syukur deh = 다행이다.'],
      ['Terserah deh.', '마음대로 해.', '살짝 포기한 듯한 느낌.'],
    ]),
    ...particle('kok', '의외·놀람 · 왜, ~인걸', [
      ['Kok kamu belum tidur?', '너 왜 아직 안 잤어?', '예상과 달라서 "어째서?" 하는 느낌.'],
      ['Kok bisa gitu?', '어떻게 그럴 수가 있어?'],
      ['Nggak apa-apa kok.', '괜찮아, 정말로.', '문장 끝의 kok는 부드럽게 안심시키거나 반박한다.'],
      ['Aku nggak marah kok.', '나 화 안 났는데?'],
      ['Kok mahal banget?', '왜 이렇게 비싸?'],
      ['Bukan salah kamu kok.', '네 잘못 아니야.'],
    ]),
    ...particle('kan', '확인 · ~잖아, ~지?', [
      ['Kan aku udah bilang.', '내가 말했잖아.', '상대도 아는 사실을 상기시킨다.'],
      ['Kamu suka pedas, kan?', '너 매운 거 좋아하지?', '문장 끝 ", kan?" = "~지?"'],
      ['Dia kan lagi sibuk.', '걔 지금 바쁘잖아.'],
      ['Hari ini libur, kan?', '오늘 쉬는 날이지?'],
      ['Kan udah janji!', '약속했잖아!'],
      ['Kamu kan perawat, pasti tahu.', '넌 간호사잖아, 분명 알겠지.'],
    ]),
    ...particle('lho', '놀람 · 어?, ~거든(~라니까)', [
      ['Lho, kamu belum pulang?', '어, 너 아직 안 갔어?', '예상 밖이라 놀랄 때. loh라고도 쓴다.'],
      ['Ini enak lho!', '이거 맛있다니까!', '"몰랐지? 진짜야" 하는 강조.'],
      ['Lho, kok udah habis?', '어, 왜 벌써 다 떨어졌어?'],
      ['Aku nggak bohong lho.', '나 거짓말 아니거든.'],
      ['Bagus lho filmnya.', '그 영화 좋아, 진짜.'],
      ['Lho, bukannya kamu yang minta?', '어, 네가 부탁한 거 아니야?'],
    ]),
    ...particle('nih', '자, 이거 · 지금 나 이래', [
      ['Nih, buat kamu.', '자, 너 줄게.', '무언가를 건넬 때. ini가 줄어든 말.'],
      ['Nih, lihat deh.', '자, 이것 좀 봐.'],
      ['Aku lagi bingung nih.', '나 지금 좀 헷갈려서 말이야.', '문장 끝 nih = "지금 내가 이런 상태야" 하고 가볍게 말한다.'],
      ['Capek banget nih.', '진짜 피곤하네.'],
      ['Laper nih, makan yuk.', '배고픈데, 밥 먹자.'],
      ['Ini nih yang aku cari.', '이게 바로 내가 찾던 거야.', '가리키며 "바로 이거"'],
    ]),
    ...particle('tuh', '봐, 저기 · 그거 말이야', [
      ['Tuh, orangnya dateng.', '봐, 그 사람 온다.', '멀리 있는 걸 가리킬 때. itu가 줄어든 말.'],
      ['Tuh kan, apa aku bilang!', '봐, 내가 뭐랬어!', 'tuh kan = 것 봐.'],
      ['Yang itu tuh, yang merah.', '저거 있잖아, 빨간 거.'],
      ['Tuh di meja.', '저기 책상 위에 있어.'],
      ['Tuh, makanya jangan telat.', '것 봐, 그러니까 늦지 말랬잖아.'],
      ['Dia tuh orangnya baik banget.', '걔는 진짜 좋은 사람이야.', '말하는 대상을 콕 집어 강조한다.'],
    ]),
    ...particle('yah', '아쉬움·실망 · 아, 에이', [
      ['Yah, udah habis.', '아, 다 떨어졌네.'],
      ['Yah, kok gitu sih?', '에이, 왜 그래?'],
      ['Yah, hujan lagi.', '아, 또 비 오네.'],
      ['Yah, telat deh.', '아, 늦었다.'],
      ['Yah, sayang banget.', '아, 너무 아깝다.'],
      ['Yah, nggak jadi dong.', '에이, 취소됐네.'],
    ]),
    ...particle('nah', '자 · 그래, 바로 그거', [
      ['Nah, itu dia!', '그래, 바로 그거야!'],
      ['Nah, sekarang kamu ngerti.', '자, 이제 알겠지?'],
      ['Nah, gitu dong.', '그래, 그렇게 해야지.'],
      ['Nah, makanya jangan males.', '자, 그러니까 게으름 피우지 마.'],
      ['Nah, ini baru enak.', '그래, 이게 진짜 맛있다.'],
      ['Nah, sampai.', '자, 도착.'],
    ]),
  ],
};

/** 어조 말 덱이 맡은 말 (구어체 덱에서 지웠어도 단어로 되살리지 않는다: 중복을 피한다) */
export const PARTICLE_WORDS: ReadonlySet<string> = new Set(indonesianParticles.notes.map((n) => (n.fields.word ?? '').toLowerCase()));
