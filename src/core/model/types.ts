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
  newPerDay: number;
  autoplay: AutoplaySide;
  /** 기본(앞/뒤) 카드처럼 언어가 정해지지 않은 필드의 TTS 언어 */
  langs: { front: Lang; back: Lang };
}

export interface Deck {
  id: Id;
  name: string;
  createdAt: Millis;
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
  updatedAt: Millis;
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
  /** 최적화한 FSRS 파라미터. 없으면 기본값 */
  fsrsParams?: number[];
  dayStartHour: number;
  buttons: 2 | 4;
  theme: ThemePref;
  amoled: boolean;
  accent: AccentKey;
  fontScale: FontScale;
  /** 언어별로 고른 기기 음성 이름 */
  voices: Record<Lang, string>;
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
}

export interface GeminiSettings {
  apiKey: string;
  /** 키를 연결할 때 고른 TTS 모델 */
  ttsModel: string;
  voice: string;
  /** 발음을 Gemini 음성으로 */
  useTts: boolean;
  /** 말하기 답을 Gemini로 받아쓰기 */
  useStt: boolean;
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
  schedulerId: 'fsrs-6',
  dayStartHour: 4,
  buttons: 2,
  theme: 'system',
  amoled: false,
  accent: 'blue',
  fontScale: 'm',
  voices: {},
};
