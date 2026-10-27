import { expect, test, type Page } from '@playwright/test';

const noteIdOf = (page: Page, word: string) =>
  page.evaluate(
    (w) =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          open.result.transaction('notes').objectStore('notes').getAll().onsuccess = (e) => {
            resolve(((e.target as IDBRequest).result as { id: string; fields: Record<string, string> }[]).find((n) => n.fields.word === w)!.id);
          };
        };
      }),
    word,
  );

test('인도네시아어 구어: 단어 고치기에서 "영어 뜻을 메인으로"를 켜면 카드에 영어 뜻이 크게, 한국어 뜻이 아래 작게 나온다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1500개를 넣었어요')).toBeVisible();

  // 첫 카드의 단어와 뜻
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  const word = (await page.locator('.b-word.front').first().innerText()).trim();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  const ko = (await page.locator('.b-meaning.back').first().innerText()).trim();
  const en = (await page.locator('.b-gloss').first().innerText()).trim();
  expect(en).not.toBe('');
  await page.getByRole('button', { name: '복습 닫기' }).click();

  // 단어 고치기: 체크박스는 기본으로 꺼져 있다
  await page.goto(`/#/notes/${await noteIdOf(page, word)}/edit`);
  const box = page.getByRole('checkbox', { name: /영어 뜻을 메인으로/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await page.screenshot({ path: 'test-results/shots/63-enmain-edit.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/63b-enmain-edit-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: '저장' }).click();

  // 복습: 큰 뜻 자리에 영어, 그 아래 한국어
  await page.goto('/#/decks');
  await page.getByRole('button', { name: /인도네시아어 구어체/ }).first().click();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.locator('.b-word.front').first()).toHaveText(word);
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await expect(page.locator('.b-meaning.back').first()).toHaveText(en);
  await expect(page.locator('.b-meaning.back').first()).toHaveAttribute('lang', 'en-US');
  await expect(page.locator('.b-gloss').first()).toHaveText(ko);
  await page.screenshot({ path: 'test-results/shots/64-enmain-card.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/64b-enmain-card-dark.png' });
});
