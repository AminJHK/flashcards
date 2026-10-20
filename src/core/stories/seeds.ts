/**
 * 이야기 상황 씨앗. 같은 단어를 받으면 Gemini가 비슷한 줄거리를 쓰기 쉬워서(사용자: "읽기가 계속 비슷하게 나온다"),
 * 매번 최근에 안 쓴 상황 하나를 골라 출발점으로 준다. 앱에 들어 있는 고정 목록이라 사용자 데이터가 아니다.
 * topics가 비어 있으면 어느 주제에나 쓴다 (주제에 맞게 바꿔 쓰라고 함께 알린다).
 */
export interface StorySeed {
  id: string;
  topics: readonly string[];
  en: string;
}

const any = (id: string, en: string): StorySeed => ({ id, topics: [], en });
const on = (topics: string[], id: string, en: string): StorySeed => ({ id, topics, en });

export const STORY_SEEDS: readonly StorySeed[] = [
  any('wrong-bus', 'someone takes the wrong bus or train and has to find the way back'),
  any('surprise-party', 'friends secretly prepare a birthday surprise and almost get caught'),
  any('swapped-package', 'a delivery package goes to the wrong house and the neighbours meet'),
  any('lost-phone', 'a phone is lost and found in a funny place'),
  any('rain', 'sudden heavy rain changes everyone\'s plans'),
  any('power-cut', 'the electricity goes off in the evening'),
  any('new-neighbour', 'a new neighbour moves in and asks for help'),
  any('cat', 'a stray cat keeps coming into the house'),
  any('misheard', 'someone mishears a word and a small misunderstanding grows'),
  any('late-meeting', 'someone is very late and keeps sending excuses'),
  any('cooking-fail', 'an attempt to cook something special goes wrong'),
  any('borrowed', 'someone borrowed something long ago and forgot to give it back'),
  any('queue', 'a long queue and someone who cuts in line'),
  any('wifi', 'the wifi stops working right before something important'),
  any('gift', 'choosing a gift for someone who seems to have everything'),
  any('photo', 'an old photo shows something nobody remembered'),
  any('motorbike', 'a motorbike will not start in the morning'),
  any('noise', 'loud noise from next door at night'),
  any('mistaken-identity', 'someone is mistaken for another person'),
  any('secret-talent', 'a quiet person shows a surprising talent'),
  any('diet', 'someone starts a diet but food keeps appearing'),
  any('plants', 'taking care of a friend\'s plants while they are away'),
  any('market', 'bargaining at a traditional market'),
  any('fortune', 'a fortune teller predicts something silly that seems to come true'),
  any('exam', 'studying the night before an important test'),
  any('kids', 'looking after a relative\'s children for one afternoon'),
  any('moving', 'moving a heavy cupboard up the stairs'),
  any('lottery', 'someone thinks they won a prize, but there is a catch'),
  on(['daily', 'free'], 'laundry', 'clothes on the line and a sudden wind'),
  on(['daily', 'free'], 'keys', 'locked out of the house in the evening'),
  on(['daily', 'free'], 'mother-visit', 'a parent visits unexpectedly and the room is a mess'),
  on(['hospital'], 'night-shift', 'a quiet night shift on the ward until a patient rings the bell'),
  on(['hospital'], 'visitor', 'a patient\'s family brings far too much food for the ward'),
  on(['hospital'], 'discharge', 'a patient is excited to go home but forgets something'),
  on(['hospital'], 'new-nurse', 'a new nurse\'s first day and a helpful senior nurse'),
  on(['hospital'], 'medicine-time', 'a patient who does not want to take medicine'),
  on(['hospital'], 'lift', 'the hospital lift breaks during visiting hours'),
  on(['travel'], 'missed-flight', 'running to catch a flight that is about to board'),
  on(['travel'], 'hotel-room', 'the hotel room is not what the photos showed'),
  on(['travel'], 'beach', 'a day at the beach and a lost sandal'),
  on(['travel'], 'driver', 'a taxi or ojek driver who knows a secret shortcut'),
  on(['travel'], 'souvenir', 'buying souvenirs for the whole family with little money'),
  on(['travel'], 'volcano', 'getting up very early to see the sunrise on a mountain'),
  on(['food'], 'spicy', 'someone says they can eat very spicy food, then tries it'),
  on(['food'], 'warung-closed', 'the favourite warung is closed today'),
  on(['food'], 'recipe', 'following grandmother\'s recipe without measurements'),
  on(['food'], 'order-mixup', 'the food order arrives wrong'),
  on(['food'], 'street-food', 'trying a new street food for the first time'),
  on(['food'], 'share', 'two friends want the last piece'),
  on(['friends'], 'first-date', 'a nervous first date at a cafe'),
  on(['friends'], 'group-chat', 'a message sent to the wrong group chat'),
  on(['friends'], 'reunion', 'meeting an old school friend by chance'),
  on(['friends'], 'karaoke', 'karaoke night and someone who cannot sing'),
  on(['friends'], 'football', 'watching a football match together and arguing'),
  on(['friends'], 'borrow-money', 'a friend asks to borrow money with a strange reason'),
];

/** 이 주제에 맞는 씨앗 중 최근에 안 쓴 것 하나 (다 썼으면 가장 오래전에 쓴 것부터 다시) */
export function pickSeed(topicKey: string, recentIds: readonly string[], rng: () => number = Math.random): StorySeed {
  const fits = STORY_SEEDS.filter((s) => s.topics.length === 0 || s.topics.includes(topicKey));
  const pool = fits.filter((s) => !recentIds.includes(s.id));
  const from = pool.length ? pool : fits;
  return from[Math.floor(rng() * from.length)] ?? STORY_SEEDS[0]!;
}
