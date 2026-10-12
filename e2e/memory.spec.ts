import { expect, test } from '@playwright/test';

test('덱별 기억 상태: 덱 목록·덱 화면·복습 기록에 막대와 기억 확률이 보인다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.locator('.panel', { hasText: '여행 스페인어' }).getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  await expect(page.getByText('아직 복습한 카드가 없어요')).toBeVisible();

  // 몇 장 복습: 알았음 3번, 다시 1번
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  for (const r of [/알았음/, /알았음/, /다시/, /알았음/]) {
    await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
    await page.getByRole('button', { name: r }).click();
  }
  await page.getByRole('button', { name: '복습 닫기' }).click();

  await page.goto('/#/decks');
  await expect(page.getByText(/기억 \d+% · 탄탄 0\/514/)).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/15-deck-list-memory.png' });

  await page.getByRole('button', { name: /여행 스페인어/ }).click();
  const panel = page.locator('.mem-panel');
  await expect(panel.getByText('지금 기억할 확률')).toBeVisible();
  await expect(panel.getByRole('img')).toHaveAttribute('aria-label', /새 카드 510장, 배우는 중 4장/);
  await page.screenshot({ path: 'test-results/shots/16-deck-memory.png' });

  await page.goto('/#/stats');
  await expect(page.getByText('덱별 기억 상태')).toBeVisible();
  await page.goto('/#/settings');
  await page.getByRole('group', { name: '테마' }).getByRole('button', { name: '다크' }).click();
  await page.goto('/#/stats');
  await page.locator('.mem-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/shots/17-stats-memory-dark.png', fullPage: true });
});

test('단어 목록: 단어마다 기억 단계·확률·다음 복습이 보이고, 약한 순으로 정렬된다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.locator('.panel', { hasText: '여행 스페인어' }).getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  // 첫 단어(la casa)는 다시, 두 번째(ir)는 알았음
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.getByRole('button', { name: /다시/ }).click();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.getByRole('button', { name: /알았음/ }).click();
  await page.getByRole('button', { name: '복습 닫기' }).click();

  await page.getByRole('button', { name: /단어 514개 보기/ }).click();
  await page.getByRole('group', { name: '정렬' }).getByRole('button', { name: '기억 약한 순' }).click();
  const rows = page.locator('.list-row');
  await expect(rows.nth(0)).toContainText('la casa');
  await expect(rows.nth(0).getByRole('img')).toHaveAttribute('aria-label', /배우는 중 · \d+%, 다음 복습/);
  await expect(rows.nth(1)).toContainText('ir');
  await expect(rows.nth(2).getByRole('img')).toHaveAttribute('aria-label', '새 카드');
  await page.screenshot({ path: 'test-results/shots/18-word-memory.png' });
});
