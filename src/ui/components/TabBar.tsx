import { useStoryJob } from '../storyJob';
import { Icon, type IconName } from './Icon';

const TABS: [string, string, IconName][] = [
  ['', '오늘', 'home'],
  ['add', '추가', 'add'],
  ['decks', '덱', 'decks'],
  ['read', '읽기', 'book'],
  ['settings', '설정', 'settings'],
];

export function TabBar({ current }: { current: string }) {
  const job = useStoryJob();
  return (
    <nav className="tabbar" aria-label="메인 메뉴">
      {TABS.map(([path, label, icon]) => (
        <a key={path} href={`#/${path}`} aria-current={current === path ? 'page' : undefined}>
          <Icon name={icon} />
          <span>{label}</span>
          {path === 'read' && job.status === 'running' && <i className="tab-dot tab-spin" aria-label="이야기를 만드는 중" />}
          {path === 'read' && job.unseen && <i className="tab-dot" aria-label="새 이야기가 완성됐어요" />}
        </a>
      ))}
    </nav>
  );
}
