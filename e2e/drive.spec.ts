import { expect, test, type Page } from '@playwright/test';

type FakeStore = Map<string, { name: string; text: string; createdTime: string }>;

/** Google 로그인(GIS)과 Drive를 흉내 낸다. store를 넘기면 여러 기기(브라우저)가 같은 Drive를 쓴다 */
async function fakeGoogle(page: Page, store: FakeStore = new Map()) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).google = {
      accounts: {
        oauth2: {
          initTokenClient: (c: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'TOKEN', expires_in: 3600 }), 10),
          }),
          revoke: () => {},
        },
      },
    };
  });
  let n = store.size;
  await page.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    expect(req.headers()['authorization']).toBe('Bearer TOKEN');
    if (url.pathname === '/oauth2/v3/userinfo') return route.fulfill({ json: { email: 'nurse@example.com' } });
    if (url.pathname.startsWith('/upload/') && req.method() === 'PATCH') {
      const id = url.pathname.split('/').pop()!;
      store.set(id, { ...store.get(id)!, text: req.postData() ?? '' });
      return route.fulfill({ json: { id } });
    }
    if (url.pathname.startsWith('/upload/')) {
      const body = req.postData() ?? '';
      const name = /"name":"([^"]+)"/.exec(body)![1]!;
      const text = body.split('\r\n\r\n')[2]!.split('\r\n--')[0]!;
      const id = `f${++n}-${Math.random().toString(36).slice(2, 6)}`;
      store.set(id, { name, text, createdTime: new Date(Date.now() + n * 1000).toISOString() });
      return route.fulfill({ json: { id, name } });
    }
    if (url.pathname === '/drive/v3/files' && req.method() === 'POST') return route.fulfill({ json: { id: 'FOLDER' } });
    if (url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      if (q.includes('folder')) return route.fulfill({ json: { files: [] } });
      const byName = /name='([^']+)'/.exec(q)?.[1];
      const files = [...store.entries()]
        .filter(([, f]) => !byName || f.name === byName)
        .map(([id, f]) => ({ id, name: f.name, createdTime: f.createdTime, size: String(f.text.length) }))
        .reverse();
      return route.fulfill({ json: { files } });
    }
    const id = url.pathname.split('/').pop()!;
    if (id === 'FOLDER') return route.fulfill({ json: { id: 'FOLDER', trashed: false } });
    if (url.searchParams.get('alt') === 'media') return route.fulfill({ body: store.get(id)!.text, contentType: 'application/json' });
    return route.fulfill({ status: 204 });
  });
  return store;
}

test('Google로 로그인해서 Drive에 백업하고, 데이터를 지운 뒤 Drive에서 복원한다', async ({ page }) => {
  const store = await fakeGoogle(page);
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한자').fill('朋友');
  await page.getByLabel('뜻').fill('친구');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();

  await page.goto('/#/settings');
  await page.getByLabel('Google 클라이언트 ID').fill('123-abc.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByText(/연결했어요 · nurse@example.com/)).toBeVisible();
  await expect(page.getByText(/nurse@example.com · 마지막 동기화/)).toBeVisible();
  // 백업 파일 하나 + 동기화 파일 하나
  const files = [...store.values()];
  expect(files.map((f) => f.name.startsWith('flashcards-backup-') || f.name === 'flashcards-sync.json')).toEqual([true, true]);
  for (const f of files) {
    expect(f.text).toContain('朋友');
    expect(f.text).not.toContain('123-abc'); // 연결 정보는 백업·동기화 파일에 넣지 않는다
  }

  // 이 기기 데이터를 지운다 → 단어 0개
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('flashcards'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.reload();
  // 연결도 지워졌으니 다시 로그인 → 동기화 파일에서 데이터를 바로 불러온다
  await page.goto('/#/settings');
  await page.getByLabel('Google 클라이언트 ID').fill('123-abc.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByText(/다른 기기의 데이터를 불러왔어요 \(단어 1개\)/)).toBeVisible();
  // 백업 파일로 되살리기도 그대로 된다
  await page.getByRole('button', { name: '백업 목록' }).click();
  // 가장 오래된(단어가 있던) 백업을 복원 (앱 안의 확인 창)
  await page.getByRole('button', { name: '복원', exact: true }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: '복원' }).click();
  await expect(page.getByText('복원했어요 · 단어 1개')).toBeVisible();
  await expect(page.getByText(/nurse@example.com/)).toBeVisible(); // 복원해도 Drive 연결은 유지
});

test('폰에서 공부한 덱과 기록을 PC에서 Google로 로그인해 그대로 이어서 하고, 다시 폰에 합쳐진다', async ({ browser }) => {
  const drive: FakeStore = new Map();
  const phone = await browser.newPage();
  await fakeGoogle(phone, drive);
  // 폰: 덱을 넣고 한 장 복습, Drive 연결 (연결하면 동기화 파일이 올라간다)
  await phone.goto('/#/decks/new');
  await phone.locator('.panel', { hasText: '인도네시아어 구어체' }).getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(phone.getByRole('button', { name: '이 덱 복습' })).toBeVisible();
  await phone.getByRole('button', { name: '이 덱 복습' }).click();
  await phone.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await phone.getByRole('button', { name: /알았음/ }).click();
  await expect(phone.getByText('kamu', { exact: true })).toBeVisible();
  await phone.getByRole('button', { name: '복습 닫기' }).click();
  await phone.goto('/#/settings');
  await phone.getByLabel('Google 클라이언트 ID').fill('123-abc.apps.googleusercontent.com');
  await phone.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(phone.getByText(/연결했어요 · nurse@example.com/)).toBeVisible();
  expect([...drive.values()].some((f) => f.name === 'flashcards-sync.json')).toBe(true);
  // 폰에서 단어 하나를 지운다 → 다시 동기화
  await phone.goto('/#/decks');
  await phone.getByRole('button', { name: /인도네시아어 구어체/ }).click();
  await phone.getByRole('button', { name: /단어 100개 보기/ }).click();
  await phone.getByLabel('단어 찾기').fill('mahal');
  await phone.getByRole('button', { name: /mahal/ }).click();
  await phone.getByRole('button', { name: '이 단어 지우기' }).click();
  await phone.getByRole('alertdialog').getByRole('button', { name: '지우기' }).click();
  await expect(phone.getByRole('heading', { name: '단어 99개' })).toBeVisible();
  await phone.goto('/#/settings');
  await phone.getByRole('button', { name: '지금 동기화' }).click();
  await expect(phone.getByText(/동기화했어요 · 단어 99개/)).toBeVisible();

  // PC: 처음 여는 브라우저. 같은 클라이언트 ID로 로그인하면 폰의 덱과 기록을 불러온다
  const pc = await browser.newPage();
  await fakeGoogle(pc, drive);
  await pc.goto('/');
  await expect(pc.getByText('다른 기기에서 쓰던 덱이 있나요?')).toBeVisible();
  await pc.getByRole('button', { name: 'Google로 불러오기' }).click();
  await pc.getByLabel('Google 클라이언트 ID').fill('123-abc.apps.googleusercontent.com');
  await pc.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(pc.getByText(/다른 기기의 데이터를 불러왔어요 \(단어 99개\)/)).toBeVisible();
  await pc.goto('/#/stats');
  await expect(pc.getByText('2026년').or(pc.getByText(/\d{4}년/)).first()).toBeVisible();
  await expect(pc.getByText(/· 1장/)).toBeVisible(); // 폰에서 한 복습 기록
  // PC에서 한 장 더 복습하고 동기화
  await pc.goto('/#/decks');
  await pc.getByRole('button', { name: /인도네시아어 구어체/ }).click();
  await pc.getByRole('button', { name: '이 덱 복습' }).click();
  await pc.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await pc.getByRole('button', { name: /알았음/ }).click();
  await pc.getByRole('button', { name: '복습 닫기' }).click();
  await pc.goto('/#/settings');
  await pc.getByRole('button', { name: '지금 동기화' }).click();
  await expect(pc.getByText(/동기화했어요/)).toBeVisible();

  // 폰을 다시 열면: 시작 화면에서 로그인 → PC 기록까지 합쳐진다
  await phone.reload();
  await expect(phone.getByRole('button', { name: 'Google로 로그인하고 시작' })).toBeVisible();
  await phone.screenshot({ path: 'test-results/shots/23-start-sync.png' });
  await phone.getByRole('button', { name: 'Google로 로그인하고 시작' }).click();
  await expect(phone.getByText(/불러왔어요 · 단어 99개/)).toBeVisible();
  await phone.goto('/#/stats');
  await expect(phone.getByText(/· 2장/)).toBeVisible();
});
