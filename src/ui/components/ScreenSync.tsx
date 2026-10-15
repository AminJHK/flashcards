import { SyncBadge } from './SyncBadge';

/** 화면 오른쪽 위의 동기화 아이콘. 화면 내용 안에 있어서 스크롤하면 내용과 함께 올라간다 (떠다니지 않는다). */
export function ScreenSync() {
  return (
    <div className="screen-sync">
      <SyncBadge />
    </div>
  );
}
