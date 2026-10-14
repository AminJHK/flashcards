import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 });

test('PC 화면: 왼쪽 메뉴 + 넓은 본문, 가로로 넘치지 않는다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 500개를 넣었어요')).toBeVisible();

  const shots: [string, string][] = [
    ['/#/', '30-pc-home'],
    ['/#/decks', '31-pc-decks'],
    ['/#/add', '32-pc-add'],
    ['/#/settings', '33-pc-settings'],
    ['/#/stats', '34-pc-stats'],
  ];
  for (const [url, name] of shots) {
    await page.goto(url);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/shots/${name}.png` });
  }
  // 메뉴는 왼쪽 세로 막대
  const nav = await page.getByRole('navigation', { name: '메인 메뉴' }).boundingBox();
  expect(nav!.x).toBeLessThan(10);
  expect(nav!.height).toBeGreaterThan(600);
  expect(nav!.width).toBeLessThan(300);

  // 복습 화면
  await page.goto('/#/');
  await page.getByRole('button', { name: /인도네시아어 구어체/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shots/35-pc-review.png' });
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shots/36-pc-review-back.png' });
});
