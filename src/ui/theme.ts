import type { AccentKey, Settings } from '../core/model/types';

/** 디자인 시안의 색 토큰 (라이트/다크를 각각 따로 정한다. docs/DESIGN.md §8). */

export const ACCENTS: Record<AccentKey, { label: string; light: string; dark: string; softL: string; softD: string }> = {
  blue: { label: '파랑', light: '#2F5BEA', dark: '#8EA8FF', softL: '#E8EDFD', softD: '#1D2541' },
  teal: { label: '청록', light: '#0E7A69', dark: '#5ED0BC', softL: '#E0F2EE', softD: '#132F2A' },
  violet: { label: '보라', light: '#6845D6', dark: '#B7A2FF', softL: '#EEE9FB', softD: '#28213F' },
  rose: { label: '장미', light: '#BE3358', dark: '#FF94AD', softL: '#FBE7EC', softD: '#3A1D26' },
};

export type Tokens = Record<string, string>;

export function tokens(dark: boolean, amoled: boolean, accent: AccentKey): Tokens {
  const A = ACCENTS[accent] ?? ACCENTS.blue;
  if (dark) {
    return {
      bg: amoled ? '#000000' : '#0E1013',
      surface: amoled ? '#0D0E11' : '#181B20',
      surface2: amoled ? '#17191D' : '#22262D',
      line: amoled ? '#1F2227' : '#2B3038',
      text: '#ECEEF1',
      text2: '#B4BAC4',
      text3: '#8E95A1',
      track: '#3A404A',
      knob: '#C9CED6',
      'seg-on': '#353A44',
      'seg-shadow': 'none',
      accent: A.dark,
      'accent-soft': A.softD,
      'on-accent': '#0E1013',
      again: '#FFB36B',
      'again-soft': '#3A2716',
      'toast-bg': '#ECEEF1',
      'toast-fg': '#14161A',
      'toast-accent': A.light,
    };
  }
  return {
    bg: '#F3F4F6',
    surface: '#FFFFFF',
    surface2: '#ECEEF2',
    line: '#E1E4E9',
    text: '#14161A',
    text2: '#4A515E',
    text3: '#646B78',
    track: '#CDD2DA',
    knob: '#FFFFFF',
    'seg-on': '#FFFFFF',
    'seg-shadow': '0 1px 2px rgba(20,22,26,0.14)',
    accent: A.light,
    'accent-soft': A.softL,
    'on-accent': '#FFFFFF',
    again: '#B45309',
    'again-soft': '#FCEFE3',
    'toast-bg': '#1B1E23',
    'toast-fg': '#F3F4F6',
    'toast-accent': A.dark,
  };
}

export const FONT_SCALE: Record<Settings['fontScale'], number> = { s: 0.8, m: 1, l: 1.2 };

export function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

const CACHE_KEY = 'flashcards:theme';

/** 색 토큰을 문서에 적용한다. 다음 실행 때 깜빡임이 없도록 마지막 값을 기억해 둔다. */
export function applyTheme(s: Pick<Settings, 'theme' | 'amoled' | 'accent' | 'fontScale'>): void {
  const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark());
  const t = tokens(dark, s.amoled, s.accent);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t)) root.style.setProperty(`--${k}`, v);
  root.style.setProperty('--scale', String(FONT_SCALE[s.fontScale] ?? 1));
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg!);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* 저장소를 못 써도 앱은 동작한다 */
  }
}

export function applyCachedTheme(): void {
  let s: Parameters<typeof applyTheme>[0] = { theme: 'system', amoled: false, accent: 'blue', fontScale: 'm' };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch {
    /* 기본값 사용 */
  }
  applyTheme(s);
}
