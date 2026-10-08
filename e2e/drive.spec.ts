import { expect, test, type Page } from '@playwright/test';

/** Google 로그인(GIS)과 Drive를 흉내 낸다 */
async function fakeGoogle(page: Page) {
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
  const store = new Map<string, { name: string; text: string; createdTime: string }>();
  let n = 0;
  await page.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    expect(req.headers()['authorization']).toBe('Bearer TOKEN');
    if (url.pathname === '/oauth2/v3/userinfo') return route.fulfill({ json: { email: 'nurse@example.com' } });
    if (url.pathname.startsWith('/upload/')) {
      const body = req.postData() ?? '';
      const name = /"name":"([^"]+)"/.exec(body)![1]!;
      const text = body.split('\r\n\r\n')[2]!.split('\r\n--')[0]!;
      const id = `f${++n}`;
      store.set(id, { name, text, createdTime: new Date(Date.now() + n * 1000).toISOString() });
      return route.fulfill({ json: { id, name } });
    }
    if (url.pathname === '/drive/v3/files' && req.method() === 'POST') return route.fulfill({ json: { id: 'FOLDER' } });
    if (url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      if (q.includes('folder')) return route.fulfill({ json: { files: [] } });
      const files = [...store.entries()].map(([id, f]) => ({ id, name: f.name, createdTime: f.createdTime, size: String(f.text.length) })).reverse();
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
  await expect(page.getByText(/nurse@example.com · 마지막 백업/)).toBeVisible();
  expect(store.size).toBe(1);
  expect([...store.values()][0]!.text).toContain('朋友');
  expect([...store.values()][0]!.text).not.toContain('123-abc'); // 연결 정보는 백업에 넣지 않는다

  // 이 기기 데이터를 지운다 → 단어 0개
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('flashcards'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.reload();
  // 연결도 지워졌으니 다시 로그인 → 연결할 때 첫 백업(빈 데이터)도 올라간다
  await page.goto('/#/settings');
  await page.getByLabel('Google 클라이언트 ID').fill('123-abc.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'Google로 로그인' }).click();
  await expect(page.getByText(/nurse@example.com · 마지막 백업/)).toBeVisible();
  await page.getByRole('button', { name: '백업 목록' }).click();
  // 가장 오래된(단어가 있던) 백업을 복원 (앱 안의 확인 창)
  await page.getByRole('button', { name: '복원', exact: true }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: '복원' }).click();
  await expect(page.getByText('복원했어요 · 단어 1개')).toBeVisible();
  await expect(page.getByText(/nurse@example.com/)).toBeVisible(); // 복원해도 Drive 연결은 유지
});
