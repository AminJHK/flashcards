import { expect, test } from '@playwright/test';

test('복습 기록 히트맵: 홈 카드와 전체 보기', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: '만들기' }).click();
  await expect(page.getByLabel('덱 이름')).toBeVisible();

  // 지난 120일치 가짜 복습 기록을 넣는다 (가끔 쉬는 날 포함)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('flashcards');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('reviewLogs', 'readwrite');
          const store = tx.objectStore('reviewLogs');
          const now = Date.now();
          let seed = 7;
          const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
          for (let d = 1; d <= 120; d++) {
            if (rand() < 0.25) continue;
            const n = Math.floor(rand() * 60) + 1;
            for (let i = 0; i < n; i++) {
              store.add({ id: `fake-${d}-${i}`, cardId: 'x', kind: 'review', rating: 3, at: now - d * 86_400_000 + i * 1000, tzOffsetMin: new Date().getTimezoneOffset(), durationMs: 8000, scheduler: 'fake' });
            }
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  await page.goto('/#/');
  await expect(page.getByText('오늘은 아직 복습하지 않았어요')).toBeVisible();
  await expect(page.getByText('하루 평균')).toBeVisible();
  const cells = page.locator('.hm-grid .hm-c');
  expect(await cells.count()).toBeGreaterThan(150);
  expect(await page.locator('.hm-grid .hm-4').count()).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/shots/15-heatmap-home.png' });

  // 칸을 누르면 그날 기록
  await page.locator('.hm-grid .hm-4').first().click();
  await expect(page.locator('.hm-picked')).toContainText('장');

  await page.getByRole('button', { name: '전체 보기' }).click();
  await expect(page.getByRole('heading', { name: '복습 기록' })).toBeVisible();
  await expect(page.getByText(/^\d{4}년/)).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/16-heatmap-stats.png' });

  // 다크 테마에서도
  await page.goto('/#/settings');
  await page.getByRole('group', { name: '테마' }).getByRole('button', { name: '다크' }).click();
  await page.goto('/#/');
  await page.screenshot({ path: 'test-results/shots/17-heatmap-dark.png' });
});
