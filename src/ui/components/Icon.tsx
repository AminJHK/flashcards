const PATHS = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-4.5v-6h-6v6H4.5a1 1 0 0 1-1-1z" />,
  add: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  decks: (
    <>
      <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  speaker: (
    <>
      <path d="M5 9v6h4l5 4V5L9 9H5z" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  prevLine: (
    <>
      <path d="M7 5v14" />
      <path d="M19 6v12L10 12z" />
    </>
  ),
  nextLine: (
    <>
      <path d="M17 5v14" />
      <path d="M5 6v12l9-6z" />
    </>
  ),
  replay: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </>
  ),
  // 동기화 상태: 구름 + (확인 / 위 화살표 / 느낌표 / 도는 화살표)
  cloud: <path d="M7.5 18.5a4.25 4.25 0 0 1-.7-8.45A5.75 5.75 0 0 1 17.8 9.6a4.45 4.45 0 0 1-.3 8.9z" />,
  cloudCheck: (
    <>
      <path d="M7.5 18.5a4.25 4.25 0 0 1-.7-8.45A5.75 5.75 0 0 1 17.8 9.6a4.45 4.45 0 0 1-.3 8.9z" />
      <path d="m9.5 13.8 2 2 3.8-4.2" />
    </>
  ),
  cloudUp: (
    <>
      <path d="M7.5 18.5a4.25 4.25 0 0 1-.7-8.45A5.75 5.75 0 0 1 17.8 9.6a4.45 4.45 0 0 1-.3 8.9z" />
      <path d="M12 16.2v-5M9.8 13l2.2-2.2 2.2 2.2" />
    </>
  ),
  cloudAlert: (
    <>
      <path d="M7.5 18.5a4.25 4.25 0 0 1-.7-8.45A5.75 5.75 0 0 1 17.8 9.6a4.45 4.45 0 0 1-.3 8.9z" />
      <path d="M12 11.2v3M12 16.6v.01" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, strokeWidth }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={strokeWidth ? { strokeWidth } : undefined}>
      {PATHS[name]}
    </svg>
  );
}
