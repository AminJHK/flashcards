import { expect, test } from '@playwright/test';

test('긴 화면에서도 버튼·찾기 칸이 줄어들지 않고, 카드 종류 버튼은 잘리지 않는다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^여행 스페인어.* 추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');

  const del = page.getByRole('button', { name: '덱 지우기' });
  await del.scrollIntoViewIfNeeded();
  expect((await del.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: 'test-results/shots/19-deck-settings.png' });
  await del.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/shots/20-deck-delete.png' });

  await page.getByRole('button', { name: /단어 514개 보기/ }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /단어 514개 보기/ }).click();
  const search = page.getByLabel('단어 찾기');
  expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/shots/21-word-list.png' });
});

test('전체 화면(기본 꺼짐): 켜면 화면을 누를 때 전체 화면이 되고, 끄면 돌아온다', async ({ page }) => {
  await page.goto('/#/settings/display');
  // 기본은 꺼짐
  await page.getByRole('heading', { name: '화면' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.getByRole('switch', { name: '전체 화면' }).click();
  await page.getByRole('heading', { name: '화면' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('switch', { name: '전체 화면' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
