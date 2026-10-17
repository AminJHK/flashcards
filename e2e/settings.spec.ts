import { expect, test } from '@playwright/test';

test('설정: 첫 화면은 항목 5개와 지금 상태만, 누르면 상세 화면, 뒤로 가면 목록', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  for (const name of ['복습', '음성', '화면', '백업·동기화', '앱 정보']) await expect(page.locator('.nav-row', { hasText: name })).toBeVisible();
  // 긴 설명·스위치는 첫 화면에 없다
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.locator('.nav-row', { hasText: '복습' })).toContainText('답 버튼 2개 · 목표 기억률 90%');
  await expect(page.locator('.nav-row', { hasText: '음성' })).toContainText('Gemini 연결 안 됨');
  await expect(page.locator('.nav-row', { hasText: '백업·동기화' })).toContainText('아직 백업하지 않았어요');
  await page.screenshot({ path: 'test-results/shots/50-settings-hub.png' });

  await page.locator('.nav-row', { hasText: '화면' }).click();
  await expect(page).toHaveURL(/#\/settings\/display$/);
  await expect(page.getByRole('heading', { name: '화면' })).toBeVisible();
  await page.getByRole('group', { name: '테마' }).getByRole('button', { name: '다크' }).click();
  await page.locator('.back-btn').click();
  await expect(page.locator('.nav-row', { hasText: '화면' })).toContainText('다크');

  // Google Drive 처음 연결 방법은 접혀 있다
  await page.locator('.nav-row', { hasText: '백업·동기화' }).click();
  await expect(page.getByText('Google Cloud 콘솔')).toBeHidden();
  await page.getByText('처음 연결하는 방법').click();
  await expect(page.getByText('Google Cloud 콘솔')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/51-settings-backup.png' });
});
