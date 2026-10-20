// 앱 전체의 데이터 모델 (docs/DESIGN.md §10).
// 시각은 모두 UTC 밀리초(number)로 다룬다.

export type Id = string;
export type Millis = number;

/** TTS·입력 언어. BCP 47 태그 (예: 'zh-CN', 'id-ID', 'ko-KR'). */
export type Lang = string;

export type AutoplaySide = 'front' | 'back' | 'off';

export interface DeckSettings {
  /** 새 단어를 만들 때 기본으로 쓸 카드 종류 id */
  defaultTypeId: string;
  /** 선택 템플릿(역방향 등)을 켤지 여부 */
  reverseEnabled: boolean;
  /** 기본(정방향) 카드를 보일지. 없으면 true. 끄면 역방향만 복습한다 (예: 영어 → 스페인어) */
  forwardEnabled?: boolean;
  newPerDay: number;
  /** 인도네시아어 구어 카드를 "예문 먼저" 보여 줄지 (뜻이 문맥에 따라 달라지는 연결어·표현용). 없으면 false */
  sentenceFirst?: boolean;
  autoplay: AutoplaySide;
  /** 기본(앞/뒤) 카드처럼 언어가 정해지지 않은 필드의 TTS 언어 */
  langs: { front: Lang; back: Lang };
}

export interface Deck {
  id: Id;
  name: string;
  createdAt: Millis;
  /** 이름·설정을 마지막으로 바꾼 시각 (기기 사이 동기화에서 더 새것을 고를 때). 없으면 createdAt */
  updatedAt?: Millis;
  settings: DeckSettings;
}

export interface Note {
  id: Id;
  deckId: Id;
  typeId: string;
  typeVersion: number;
  fields: Record<string, string>;
  /** 필드별로 TTS가 대신 읽을 텍스트 (다음자 발음 교정용) */
  ttsOverride?: Record<string, string>;
  tags: string[];
  createdAt: Millis;
  /** 마지막으로 바뀐 시각. 기기 사이 동기화는 이 값이 더 나중인 쪽을 쓴다 */
  updatedAt: Millis;
  /**
   * 준비된 덱의 고친 내용을 받은(또는 앱이 옮긴) 시각. updatedAt이 이 값(없으면 createdAt)과 같으면 사용자가 직접 고치지 않은 단어다 (userEdited).
   * 예전에는 받을 때 updatedAt을 그대로 둬서, 동기화가 받기 전 내용을 같은 시각으로 보고 되돌릴 수 있었다.
   */
  packUpdatedAt?: Millis;
}

/** 스케줄러가 쓰는 카드 기억 상태. 어떤 알고리즘이든 JSON으로 직렬화할 수 있어야 한다. */
export type MemoryState = Record<string, unknown>;

export interface Card {
  id: Id;
  noteId: Id;
  deckId: Id;
  templateId: string;
  /** 노트 안에서의 템플릿 순서 (새 카드 순서용) */
  ord: number;
  /** 선택 템플릿이 덱 설정에서 꺼져 있으면 true. 기록은 지우지 않는다. */
  hidden: boolean;
  suspended: boolean;
  createdAt: Millis;
  // ---- 아래는 ReviewLog로 언제든 다시 계산할 수 있는 캐시 ----
  isNew: boolean;
  /** 다음 복습 시각. 새 카드는 createdAt */
  due: Millis;
  /** 'learning' = 같은 날 짧은 간격으로 다시 보는 단계 */
  phase: 'new' | 'learning' | 'review';
  lastReviewAt?: Millis;
  /** 마지막 reset 이후 처음 복습한 시각 (하루 새 카드 수 계산용) */
  firstReviewAt?: Millis;
  reps: number;
  lapses: number;
  memory?: MemoryState;
  /** 캐시를 계산한 스케줄러 id (바뀌면 다시 계산) */
  schedulerId?: string;
}

export type Rating = 1 | 2 | 3 | 4;

export type ReviewLog =
  | {
      id: Id;
      cardId: Id;
      kind: 'review';
      rating: Rating;
      at: Millis;
      tzOffsetMin: number;
      durationMs?: number;
      /** 기록 당시 스케줄러 (참고용. 다시 계산할 때는 현재 스케줄러를 쓴다) */
      scheduler: string;
    }
  | { id: Id; cardId: Id; kind: 'void'; voidsId: Id; at: Millis; tzOffsetMin: number }
  | { id: Id; cardId: Id; kind: 'reset'; at: Millis; tzOffsetMin: number };

export type ThemePref = 'system' | 'light' | 'dark';
export type AccentKey = 'blue' | 'teal' | 'violet' | 'rose';
export type FontScale = 's' | 'm' | 'l';

export interface Settings {
  id: 'settings';
  desiredRetention: number;
  schedulerId: string;
  /** 사용자가 설정에서 알고리즘을 직접 골랐는지. 고른 적 없으면 FSRS-6 → FSRS-7로 한 번 옮긴다 (2026-10-20) */
  schedulerChosen?: boolean;
  /** 최적화한 FSRS 파라미터. 없으면 기본값 */
  fsrsParams?: number[];
  dayStartHour: number;
  /** 남은 카드가 "몇 분 뒤 다시" 카드뿐일 때 이만큼(분) 일찍 보여준다. 0이면 정해진 시간까지 기다린다 */
  learnAheadMin: number;
  buttons: 2 | 4;
  theme: ThemePref;
  amoled: boolean;
  accent: AccentKey;
  fontScale: FontScale;
  /** 전체 화면 (상태 표시줄·내비게이션 바 숨기기). 기본은 끔 */
  immersive: boolean;
  /** 이야기 읽기에서 줄이 나올 때 자동으로 읽어 줄지 */
  storyAutoplay?: boolean;
  /** 이야기 "듣고 읽기": 새 문장은 글자를 가리고 소리만 먼저 들려준다 (누르면 글자) */
  storyListenFirst?: boolean;
  /** 이야기 받아쓰기: 새 문장마다 듣고 받아쓴 뒤 확인해야 다음으로 (빈칸 1~2개 또는 문장 전체) */
  storyDictation?: boolean;
  storyDictationStyle?: 'blank' | 'full';
  /** 이야기 TTS가 429/404를 만나면 다른 무료 TTS 모델로 변경할지. 카드 재생에는 영향 없음. */
  storyAutoModelSwitch?: boolean;
  /** 이야기 음성 재생 속도. 이미 저장한 WAV도 재생 중에 바꿀 수 있다. */
  storyPlaybackRate?: number;
  /** 이야기도 기기 음성으로 읽기 (Gemini 음성을 만들지도 쓰지도 않는다). 속도는 storyPlaybackRate */
  storyDeviceVoice?: boolean;
  /** 이야기 ID → 등장인물 ID(또는 '__narrator__') → Gemini 목소리. API 키와 무관하다. */
  storyVoices?: Record<string, Record<string, string>>;
  /** 언어별로 고른 기기 음성 이름. 없으면 휴대폰 TTS 엔진의 기본 목소리 */
  voices: Record<Lang, string>;
  /** 기기 음성 속도 (단어 카드 등, 이야기는 storyPlaybackRate). 휴대폰 설정 값은 브라우저가 덮어써서 앱에서 정한다 */
  deviceRate?: number;
  /** 기기 음성 높낮이 (1 = 보통) */
  devicePitch?: number;
  /** 안드로이드 앱의 음성 엔진 설정 (이 기기에만) */
  nativeTts?: {
    /** 엔진 패키지 이름 (예: com.samsung.SMT). 없으면 휴대폰 기본 엔진 */
    engine?: string;
    /** 언어별 엔진 안의 목소리 이름. 없으면 엔진 기본 목소리 */
    voices?: Record<Lang, string>;
    /** 휴대폰 설정(텍스트 음성 변환)의 속도·높낮이를 쓸지. 기본 true. false면 deviceRate·devicePitch·이야기 속도 */
    systemRatePitch?: boolean;
  };
  lastBackupAt?: Millis;
  /** 자연스러운 음성 (Gemini API 무료 키). 키는 백업 파일에 넣지 않는다 */
  gemini?: GeminiSettings;
  /** Google Drive 백업 (이 기기에만 저장, 백업 파일에 넣지 않는다) */
  googleDrive?: GoogleDriveSettings;
}

export interface GoogleDriveSettings {
  /** 사용자가 Google Cloud에서 만든 OAuth 클라이언트 ID */
  clientId: string;
  email?: string;
  folderId?: string;
  lastDriveBackupAt?: Millis;
  /** 마지막으로 다른 기기와 동기화한 시각 */
  lastSyncAt?: Millis;
  /** 앱을 연 뒤 화면을 처음 누를 때 로그인 창을 띄워 자동으로 동기화할지 (없으면 꺼짐 — 동기화는 사용자가 누를 때) */
  syncOnStart?: boolean;
  /** 앱을 열 때 "Google로 로그인하고 시작" 화면을 먼저 보여 줄지 (없으면 꺼짐) */
  startScreen?: boolean;
}

export interface GeminiSettings {
  apiKey: string;
  /** 키를 연결할 때 고른 TTS 모델 */
  ttsModel: string;
  voice: string;
  /** 이야기(읽기)를 Gemini 음성으로 */
  useTts: boolean;
  /** 단어 카드의 발음도 Gemini 음성으로. 없으면(false) 카드는 기기 음성 (무료 한도를 읽기에 아낀다) */
  cardTts?: boolean;
  /** 말하기 답을 Gemini로 받아쓰기 */
  useStt: boolean;
}

/**
 * 지운 덱·단어의 흔적. 기기 사이 동기화에서 "다른 기기에는 아직 있는 것"을 되살리지 않으려고 남긴다.
 * 덱을 지우면 그 덱의 단어도 각각 남긴다.
 */
export interface Tombstone {
  id: Id;
  kind: 'deck' | 'note';
  at: Millis;
}

/** 저장된 음성 파일 (다시 만들 수 있으므로 백업하지 않는다) */
export interface AudioClip {
  key: string;
  blob: Blob;
  createdAt: Millis;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  desiredRetention: 0.9,
  schedulerId: 'fsrs-7',
  dayStartHour: 4,
  learnAheadMin: 0,
  buttons: 2,
  theme: 'system',
  amoled: false,
  accent: 'blue',
  immersive: false,
  fontScale: 'm',
  storyAutoplay: true,
  storyAutoModelSwitch: true,
  storyPlaybackRate: 0.85,
  voices: {},
};
