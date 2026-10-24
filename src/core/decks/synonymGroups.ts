/**
 * 뜻이 비슷한 연결어 묶음 (사용자 요청 2026-10-24: 연결어에 동의어가 너무 많아 헷갈린다).
 * 묶음마다 내가 말할 때 쓸 구어 대표(main) 하나를 정하고, 나머지는 "알아보기만" 하면 된다.
 * - spoken: 구어에서도 쓰지만 쓰임이 다른 말 (차이를 한 줄로)
 * - written: 글·뉴스·드라마에서 보이는 말 → 말할 때는 대표로
 * 카드 뒷면에 "비슷한 말" 표로 보여 준다 (idSpoken.view). 한 단어는 한 묶음에만 넣는다.
 */
export interface SynonymMember {
  word: string;
  /** 차이 한 줄 (한국어) */
  diff: string;
  role: 'main' | 'spoken' | 'written';
}

export interface SynonymGroup {
  /** 묶음 뜻 (표 제목) */
  title: string;
  members: SynonymMember[];
}

const g = (title: string, ...members: [string, SynonymMember['role'], string][]): SynonymGroup => ({ title, members: members.map(([word, role, diff]) => ({ word, role, diff })) });

export const SYNONYM_GROUPS: readonly SynonymGroup[] = [
  g('그래서 (결과)',
    ['jadi', 'main', '그래서 · 가장 흔하고 어디서나'],
    ['makanya', 'spoken', '그러니까 (내가 그랬잖아) · 핀잔'],
    ['jadinya', 'spoken', '결국 그렇게 됐다'],
    ['berarti', 'spoken', '그 말은 곧 ~라는 거네'],
    ['sehingga', 'written', '그 결과 ~하게 · 글말'],
    ['maka', 'written', '그러므로 · 글말']),
  g('왜냐하면 (이유)',
    ['soalnya', 'main', '~거든 · 말할 때 이유 붙이기'],
    ['gara-gara', 'spoken', '~탓에 · 나쁜 일의 원인'],
    ['karena', 'spoken', '~때문에 · 무난, 글에도'],
    ['sebab', 'written', '이유, ~때문에 · 글말']),
  g('하지만 (반대)',
    ['tapi', 'main', '근데, 하지만 · 가장 흔함'],
    ['padahal', 'spoken', '~인데도 · 기대와 반대라 아쉬울 때'],
    ['malah', 'spoken', '오히려 · 예상과 반대 결과'],
    ['bukannya', 'spoken', '~아니었어? · 따지듯 되물을 때'],
    ['namun', 'written', '그러나 · 글말']),
  g('~해도 (양보)',
    ['walaupun', 'main', '~지만, 비록 · 가장 흔함'],
    ['meski', 'spoken', '~하더라도 · 조금 더 단정한 말'],
    ['walau', 'written', 'walaupun의 짧은 꼴 · 글·노래']),
  g('~하도록 (목적)',
    ['biar', 'main', '~하게 · 말할 때'],
    ['supaya', 'spoken', '~하도록 · 무난, 글에도'],
    ['demi', 'spoken', '~를 위해 · 큰 목적, 맹세하듯']),
  g('~인 것 같다 (추측)',
    ['kayaknya', 'main', '~인 것 같아 · 가장 흔함'],
    ['rasanya', 'spoken', '내 느낌엔 ~ · 느낌으로 말할 때'],
    ['mungkin', 'spoken', '아마 · 가능성만'],
    ['jangan-jangan', 'spoken', '혹시 ~아냐? · 나쁜 예감'],
    ['barangkali', 'written', '어쩌면 · 조금 글말'],
    ['sepertinya', 'written', '~인 듯하다 · 글말'],
    ['tampaknya', 'written', '보아하니 ~인 듯 · 글말']),
  g('사실은 · 알고 보니',
    ['sebenernya', 'main', '사실은 · 내가 진실을 말할 때'],
    ['ternyata', 'spoken', '알고 보니 · 몰랐던 걸 알게 됐을 때'],
    ['rupanya', 'written', '알고 보니 · ternyata의 글말'],
    ['sesungguhnya', 'written', '사실은 · sebenernya의 글말']),
  g('만약 (조건)',
    ['kalo', 'main', '~하면 · 가장 흔함'],
    ['seandainya', 'spoken', '~했더라면 · 지난 일·이룰 수 없는 일'],
    ['asalkan', 'spoken', '~이기만 하면 · 조건 하나'],
    ['jika', 'written', '~하면 · 글말'],
    ['bila', 'written', '~하면, ~할 때 · 글말']),
  g('그다음 (순서)',
    ['terus', 'main', '그리고 나서, 그래서 · 이야기 이어 갈 때'],
    ['abis', 'spoken', '~한 다음에 · abis itu = 그 다음에'],
    ['selanjutnya', 'spoken', '그다음 · 안내·발표에서'],
    ['kemudian', 'written', '그 후 · 글말']),
  g('아무튼 · 요점은',
    ['pokoknya', 'main', '아무튼 · 고집·결론'],
    ['intinya', 'spoken', '요점은 · 정리할 때'],
    ['maksudnya', 'spoken', '그러니까 = 말을 바꿔 설명']),
  g('게다가',
    ['lagian', 'main', '게다가, 어차피 · 이유 하나 더'],
    ['apalagi', 'spoken', '더구나 ~는 말할 것도 없고'],
    ['bahkan', 'spoken', '심지어 · 놀랄 만한 것']),
  g('차라리',
    ['mending', 'main', '차라리 ~하는 게 나아'],
    ['daripada', 'spoken', '~하느니 · 비교하는 쪽'],
    ['sebaiknya', 'spoken', '~하는 게 좋겠어 · 조언']),
];

const BY_WORD = new Map(SYNONYM_GROUPS.flatMap((grp) => grp.members.map((m) => [m.word, grp] as const)));

/** 이 단어가 든 묶음 */
export const synonymGroupOf = (word: string): SynonymGroup | undefined => BY_WORD.get(word.trim().toLowerCase());
