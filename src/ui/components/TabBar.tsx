import { Icon, type IconName } from './Icon';

const TABS: [string, string, IconName][] = [
  ['', '오늘', 'home'],
  ['add', '추가', 'add'],
  ['decks', '덱', 'decks'],
  ['settings', '설정', 'settings'],
];

export function TabBar({ current }: { current: string }) {
  return (
    <nav className="tabbar" aria-label="메인 메뉴">
      {TABS.map(([path, label, icon]) => (
        <a key={path} href={`#/${path}`} aria-current={current === path ? 'page' : undefined}>
          <Icon name={icon} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
