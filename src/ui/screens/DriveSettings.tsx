import { useState } from 'react';
import type { Settings } from '../../core/model/types';
import { forgetToken } from '../../adapters/google/auth';
import type { DriveFile } from '../../adapters/google/drive';
import { saveSettings } from '../../adapters/storage/repo';
import { Row } from '../components/Controls';
import { backupToDrive, connectDrive, driveErrorMessage, listDriveBackups, restoreFromDrive } from '../driveBackup';
import { useToast } from '../toast';
import { ask } from '../confirm';

const CONSOLE = 'https://console.cloud.google.com/';

function when(t: number | string | undefined): string {
  if (t === undefined) return '아직 없음';
  return new Date(t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function DriveSettings({ s }: { s: Settings }) {
  return s.googleDrive?.clientId ? <Connected s={s} /> : <Setup />;
}

function Setup() {
  const toast = useToast();
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const origin = window.location.origin;

  const connect = async () => {
    const id = clientId.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) {
      toast('클라이언트 ID는 ….apps.googleusercontent.com 으로 끝나요');
      return;
    }
    setBusy(true);
    try {
      const email = await connectDrive(id);
      toast(`연결했어요${email ? ` · ${email}` : ''}. 첫 백업도 했어요`);
    } catch (e) {
      toast(driveErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group">
      <Row col title="Google Drive에 백업하기 (무료)" desc="내 Google Drive의 「플래시카드 백업」 폴더에 저장돼요. 폰을 바꾸거나 브라우저 데이터가 지워져도 되살릴 수 있어요.">
        <span className="row-desc">처음 한 번만, Google에 이 앱을 등록해야 해요 (약 5분, PC에서 하면 편해요).</span>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.55 }} className="muted">
          <li>
            <a href={CONSOLE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Google Cloud 콘솔
            </a>
            을 열고 로그인해요. 위쪽에서 <strong>새 프로젝트</strong>를 만들어요 (이름은 아무거나, 예: flashcards). 결제 정보는 필요 없어요.
          </li>
          <li>
            검색창에 <strong>Google Drive API</strong>를 검색해서 들어간 뒤 <strong>사용</strong>을 눌러요.
          </li>
          <li>
            검색창에 <strong>OAuth 동의 화면</strong>(또는 Google 인증 플랫폼)을 검색해서 <strong>시작하기</strong>를 눌러요. 앱 이름은 「플래시카드」, 이메일은 내 Gmail, 대상은 <strong>외부</strong>로 해요. 그다음 <strong>대상 › 테스트 사용자</strong>에 내 Gmail 주소를 추가해요.
          </li>
          <li>
            <strong>클라이언트 › 클라이언트 만들기</strong>에서 유형을 <strong>웹 애플리케이션</strong>으로 고르고, <strong>승인된 JavaScript 원본</strong>에 아래 주소를 넣고 만들어요.
            <code style={{ display: 'block', marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, wordBreak: 'break-all', userSelect: 'all' }}>{origin}</code>
          </li>
          <li>
            만들어진 <strong>클라이언트 ID</strong>(….apps.googleusercontent.com)를 복사해서 아래에 붙여넣고 <strong>Google로 로그인</strong>을 눌러요. 「확인되지 않은 앱」 화면이 나오면 <strong>계속</strong>을 누르면 돼요 (내가 만든 앱이라서 나오는 안내예요).
          </li>
        </ol>
        <input
          className="input"
          aria-label="Google 클라이언트 ID"
          placeholder="…apps.googleusercontent.com"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{ fontSize: 14 }}
        />
        <button type="button" className="btn btn-primary" style={{ height: 52 }} onClick={connect} disabled={busy}>
          {busy ? '연결 중…' : 'Google로 로그인'}
        </button>
        <span className="row-desc">이 앱은 자기가 만든 백업 파일만 볼 수 있어요. Drive의 다른 파일은 보지 못해요.</span>
      </Row>
    </div>
  );
}

function Connected({ s }: { s: Settings }) {
  const toast = useToast();
  const d = s.googleDrive!;
  const [busy, setBusy] = useState<string>();
  const [files, setFiles] = useState<DriveFile[]>();

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(driveErrorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="group">
      <Row title="Google Drive 백업" desc={`${d.email ?? '연결됨'} · 마지막 백업 ${when(d.lastDriveBackupAt)}`}>
        <button type="button" className="btn-soft" disabled={!!busy} onClick={() => run('backup', async () => (await backupToDrive(), toast('Google Drive에 백업했어요')))}>
          {busy === 'backup' ? '백업 중…' : '지금 백업'}
        </button>
      </Row>
      <Row title="Drive에서 복원" desc={files ? (files.length ? '되살릴 백업을 고르세요. 지금 데이터는 그 백업으로 바뀌어요.' : 'Drive에 백업이 없어요.') : '다른 폰이나 브라우저에서 만든 백업도 되살릴 수 있어요.'}>
        {!files && (
          <button type="button" className="btn-plain" disabled={!!busy} onClick={() => run('list', async () => setFiles(await listDriveBackups()))}>
            {busy === 'list' ? '불러오는 중…' : '백업 목록'}
          </button>
        )}
      </Row>
      {files?.slice(0, 10).map((f) => (
        <Row key={f.id} title={when(f.createdTime)} desc={f.size ? `${Math.max(1, Math.round(Number(f.size) / 1024))}KB` : undefined}>
          <button
            type="button"
            className="btn-plain"
            disabled={!!busy}
            onClick={async () => {
              if (!(await ask(`지금 있는 데이터를 모두 지우고 ${when(f.createdTime)} 백업으로 바꿀까요?`, '복원'))) return;
              void run(f.id, async () => {
                const n = await restoreFromDrive(f);
                setFiles(undefined);
                toast(`복원했어요 · 단어 ${n}개`);
              });
            }}
          >
            {busy === f.id ? '복원 중…' : '복원'}
          </button>
        </Row>
      ))}
      <Row title="연결 끊기" desc="이 폰에서 Google 연결을 지워요. Drive의 백업 파일은 그대로 남아요.">
        <button
          type="button"
          className="btn-plain"
          disabled={!!busy}
          onClick={async () => {
            if (!(await ask('Google Drive 연결을 끊을까요?', '끊기'))) return;
            forgetToken();
            void saveSettings({ googleDrive: undefined });
          }}
        >
          끊기
        </button>
      </Row>
    </div>
  );
}
