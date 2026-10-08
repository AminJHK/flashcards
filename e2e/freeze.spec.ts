import { expect, test } from '@playwright/test';

test.use({ launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} });

test('Google 서버가 응답하지 않아도 연결 버튼이 멈춰 있지 않는다', async ({ page }) => {
  test.setTimeout(45_000);
  // 요청을 받기만 하고 영원히 답하지 않는다
  await page.route('https://generativelanguage.googleapis.com/**', () => new Promise(() => {}));
  await page.goto('/#/settings');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByRole('button', { name: '키 확인 중…' })).toBeVisible();
  await expect(page.getByText(/응답이 너무 늦어요/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('button', { name: '연결' })).toBeEnabled();
});

test('지우기 확인 창은 앱 안에 뜨고, 취소하면 그대로 둔다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: '만들기' }).click();
  await expect(page.getByRole('button', { name: '덱 지우기' })).toBeVisible();
  const url = page.url();

  await page.getByRole('button', { name: '덱 지우기' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('모두 지울까요');
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(url);

  await page.getByRole('button', { name: '덱 지우기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '지우기' }).click();
  await expect(page.getByText('덱을 지웠어요')).toBeVisible();
  // 알림이 떠 있는 동안에도 아래 버튼은 눌린다
  await page.getByRole('link', { name: '설정' }).click();
  await expect(page).toHaveURL(/#\/settings/);
});
