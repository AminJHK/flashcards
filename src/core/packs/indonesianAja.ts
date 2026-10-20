import type { Pack, PackNote } from './types';

/**
 * 인도네시아어 aja 연습 72장 (쓰임새 12가지 × 예문 6개). 사용자 요청: aja가 너무 여러 곳에 쓰여서 감을 익히고 싶다.
 * 카드 종류는 어조 말 덱과 같은 id-particle (예문을 보고 aja의 느낌 떠올리기).
 * 쓰임새를 골고루 섞어서 보도록 번갈아 줄 세운다 (한 쓰임새만 며칠 연속으로 나오지 않게).
 * 예문과 설명은 직접 써서 현지인 검증은 하지 않았다.
 * 이미 설치한 덱에는 뒤의 카드만 이어서 넣는다 (packAdditions): 순서를 바꾸거나 중간에 끼워 넣지 말고 뒤에 붙일 것.
 */
type Ex = [example: string, exampleKo: string, note?: string];

function usage(meaning: string, tag: string, examples: Ex[]): PackNote[] {
  return examples.map(([example, exampleKo, note]) => ({
    typeId: 'id-particle',
    fields: { word: 'aja', meaning, position: '문중 · 문미 (꾸미는 말 바로 뒤)', example, exampleKo, note: note ?? '' },
    tags: ['aja', tag],
  }));
}

const USAGES: PackNote[][] = [
  usage('~만 · ~밖에 (그것뿐)', '~만', [
    ['Aku minum air putih aja.', '나는 그냥 물만 마실게.', '다른 건 말고 그것만. 가장 기본 뜻 (표준어 saja).'],
    ['Cuma lima ribu aja kok.', '오천 루피아밖에 안 해.', 'cuma(겨우)와 같이 쓰면 "~밖에".'],
    ['Dia makan nasi aja, nggak pake lauk.', '걔는 반찬 없이 밥만 먹어.'],
    ['Sebentar aja ya.', '잠깐만이야.'],
    ['Satu aja cukup.', '하나면 충분해.'],
    ['Yang dateng dua orang aja.', '온 사람은 두 명뿐이야.'],
  ]),
  usage('그냥 ~해 (부드러운 권유·허락)', '권유', [
    ['Duduk aja dulu.', '일단 앉아.', '명령문 뒤의 aja는 "부담 갖지 말고 그냥 ~해".'],
    ['Ambil aja, nggak apa-apa.', '그냥 가져가, 괜찮아.'],
    ['Bilang aja kalau butuh bantuan.', '도움 필요하면 그냥 말해.'],
    ['Masuk aja, pintunya nggak dikunci.', '그냥 들어와, 문 안 잠겼어.'],
    ['Santai aja.', '편하게 해.', '아주 자주 듣는 말. "긴장하지 마, 천천히 해".'],
    ['Panggil aku Budi aja.', '그냥 부디라고 불러.'],
  ]),
  usage('아무 ~나 · 언제든 (apa aja · siapa aja · mana aja)', '아무 ~나', [
    ['Makan apa aja boleh.', '아무거나 먹어도 돼.', '의문사 + aja = "아무 ~나".'],
    ['Siapa aja bisa ikut.', '누구든 같이 갈 수 있어.'],
    ['Duduk di mana aja.', '아무 데나 앉아.'],
    ['Telepon aku kapan aja.', '언제든 전화해.'],
    ['Yang mana aja, terserah kamu.', '아무거나 괜찮아, 네 맘대로 해.'],
    ['Dia bisa tidur di mana aja.', '걔는 아무 데서나 잘 수 있어.'],
  ]),
  usage('~로 할게 · 그냥 ~하자 (가볍게 정하기)', '정하기', [
    ['Aku es teh aja.', '나는 아이스티로 할게.', '주문할 때 "저는 ~로요". 큰 고민 없이 고르는 느낌.'],
    ['Nanti aja.', '나중에 하자.'],
    ['Besok aja ya.', '내일 하자, 응?'],
    ['Naik ojek aja deh.', '그냥 오젝 타자.', 'aja deh = 고민하다가 "그래, 그걸로 하자".'],
    ['Pesan yang sama aja.', '같은 걸로 시키자.'],
    ['Hari ini di rumah aja.', '오늘은 그냥 집에 있을래.'],
  ]),
  usage('~만 계속 (불평)', '불평', [
    ['Dia telat aja tiap hari.', '걔는 맨날 늦기만 해.', '불평할 때의 aja = "다른 건 안 하고 그것만 자꾸".'],
    ['Kamu main HP aja dari tadi.', '너 아까부터 핸드폰만 하고 있잖아.'],
    ['Hujan aja dari pagi.', '아침부터 계속 비만 와.'],
    ['Kerjaannya tidur aja.', '하는 일이라곤 잠자는 것뿐이야.'],
    ['Kok diem aja?', '왜 가만히만 있어?', 'diem(diam) aja = 아무 말 없이 가만히.'],
    ['Kamu ngeluh aja terus.', '넌 계속 불평만 해.'],
  ]),
  usage('방금 (baru aja)', '방금', [
    ['Aku baru aja sampai.', '나 방금 도착했어.', 'baru aja = 방금, 막. 한 덩어리로 외우면 편하다.'],
    ['Dia baru aja pergi.', '걔 방금 나갔어.'],
    ['Baru aja mau telepon kamu.', '방금 너한테 전화하려던 참이었어.'],
    ['Makanannya baru aja dateng.', '음식 방금 나왔어.'],
    ['Aku baru aja bangun.', '나 막 일어났어.'],
    ['Baru aja dibilangin!', '방금 말했잖아!'],
  ]),
  usage('똑같아 · 그냥 그래 (sama aja · biasa aja)', '똑같아', [
    ['Sama aja.', '똑같아.', 'sama aja = 별 차이 없어.'],
    ['Mau naik bus atau kereta, sama aja.', '버스든 기차든 똑같아.'],
    ['Rasanya biasa aja.', '맛은 그냥 그래.', 'biasa aja = 특별할 것 없는, 그저 그런.'],
    ['Biasa aja, nggak usah heboh.', '별거 아니야, 호들갑 떨지 마.'],
    ['Aku biasa aja kok sama dia.', '나 걔한테 별 감정 없어.'],
    ['Harganya sama aja kayak kemarin.', '가격은 어제랑 똑같아.'],
  ]),
  usage('별일이야 · 말도 잘하네 (어이없음·놀림)', '어이없음', [
    ['Ada-ada aja kamu!', '너도 참 별짓을 다 한다!', 'ada-ada aja = 엉뚱한 일·말에 웃으며 어이없어할 때.'],
    ['Bisa aja kamu!', '말도 잘하네!', '칭찬이나 농담을 듣고 쑥스러울 때.'],
    ['Ada aja alasannya.', '맨날 무슨 핑계가 있어.', 'ada aja = "늘 뭔가가 있다" (투덜거림).'],
    ['Ada-ada aja kejadian hari ini.', '오늘 별일이 다 있네.'],
    ['Ah, kamu bisa aja.', '에이, 별말씀을.'],
    ['Ada aja yang kurang.', '꼭 뭐 하나씩 빠진다니까.'],
  ]),
  usage('~일 수도 있지 (bisa aja · mungkin aja)', '가능성', [
    ['Bisa aja dia lupa.', '걔가 잊어버렸을 수도 있지.', '문장 앞의 bisa aja = "~일 수도 있어" (8번 "말도 잘하네"와 구별).'],
    ['Mungkin aja dia udah pulang.', '걔 벌써 집에 갔을지도 몰라.'],
    ['Bisa aja macet.', '길이 막힐 수도 있어.'],
    ['Ya bisa aja sih.', '뭐, 그럴 수도 있지.'],
    ['Bisa aja nanti hujan, bawa payung.', '이따 비 올 수도 있으니까 우산 챙겨.'],
    ['Siapa tahu aja dia mau.', '혹시 걔가 하겠다고 할지도 모르잖아.'],
  ]),
  usage('그냥 그렇게 · 그 정도 (gitu aja · langsung aja)', '그렇게', [
    ['Gitu aja kok repot.', '그 정도 가지고 뭘 그렇게 복잡하게 굴어.', '유명한 말. gitu(begitu) aja = 그 정도, 그렇게만.'],
    ['Dia pergi gitu aja.', '걔 그냥 그렇게 가 버렸어.', '아무 말 없이, 아무렇지 않게.'],
    ['Langsung aja ya.', '바로 본론으로 갈게.'],
    ['Udah, gitu aja.', '자, 이걸로 끝이야.'],
    ['Masa gitu aja marah?', '그 정도로 화를 내?'],
    ['Dia lewat aja, nggak nyapa.', '걔는 인사도 안 하고 그냥 지나갔어.'],
  ]),
  usage('~조차 · ~도 못 하다니 (강조)', '조차', [
    ['Masa gini aja nggak bisa?', '이것도 못 해?', '"이렇게 쉬운 것조차". masa는 "설마".'],
    ['Jalan aja susah, apalagi lari.', '걷는 것도 힘든데, 뛰는 건 말할 것도 없지.', 'A aja ~, apalagi B = A조차 ~한데 B는 더더욱.'],
    ['Nama aku aja dia lupa.', '걔는 내 이름조차 잊어버렸어.'],
    ['Minum aja nggak sempat.', '물 마실 틈조차 없었어.'],
    ['Ngomong aja dia nggak berani.', '걔는 말 꺼낼 용기조차 없어.'],
    ['Masak nasi aja gosong.', '밥 하나 짓는데도 태웠어.'],
  ]),
  usage('내가 할게 · 네가 해 (사람 지목)', '지목', [
    ['Aku aja yang bayar.', '내가 낼게.', '사람 + aja (yang ~) = "(다른 사람 말고) 내가/네가".'],
    ['Kamu aja yang pilih.', '네가 골라.'],
    ['Kamu aja duluan.', '너 먼저 해.'],
    ['Biar aku aja.', '내가 할게.', 'biar = ~하게 둬. 일을 맡겠다고 나설 때.'],
    ['Saya aja, Bu.', '제가 할게요.'],
    ['Kamu aja yang nyetir.', '네가 운전해.'],
  ]),
];

/** 쓰임새를 번갈아 하나씩: 1번 쓰임새 첫 예문, 2번 첫 예문, … 그다음 둘째 예문들 */
function interleave(groups: PackNote[][]): PackNote[] {
  const out: PackNote[] = [];
  for (let i = 0; i < Math.max(...groups.map((g) => g.length)); i++) {
    for (const g of groups) {
      const n = g[i];
      if (n) out.push(n);
    }
  }
  return out;
}

export const indonesianAja: Pack = {
  id: 'indonesian-aja',
  name: '인도네시아어 aja 연습 · 예문 72장',
  description: '어디에나 붙는 aja의 쓰임새 12가지 (~만, 그냥 ~해, 아무 ~나, 방금, 똑같아, ~조차 …)를 예문으로 섞어서 익혀요.',
  deckName: '인도네시아어 aja',
  fillEmpty: ['position'],
  deckSettings: {
    defaultTypeId: 'id-particle',
    reverseEnabled: false,
    newPerDay: 6,
    autoplay: 'front',
    langs: { front: 'id-ID', back: 'ko-KR' },
  },
  notes: interleave(USAGES),
};
