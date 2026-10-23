import { expect, test } from '@playwright/test';

test('인도네시아어: 정답 화면에 영어 뜻과 자주 쓰는 표현이 나오고, 예전에 받은 덱은 "고친 내용 받기"로 채운다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('인도네시아어 구어체');

  // 예전 버전으로 받은 것처럼: 영어 뜻·표현 칸이 없다. kamu는 사용자가 메모를 직접 고친 단어
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          const tx = open.result.transaction('notes', 'readwrite');
          const store = tx.objectStore('notes');
          store.getAll().onsuccess = (e) => {
            for (const n of (e.target as IDBRequest).result) {
              const { en: _en, phrases: _ph, ...old } = n.fields;
              const mine = n.fields.word === 'kamu';
              store.put({ ...n, typeVersion: 1, fields: mine ? { ...old, note: '내 메모' } : old, updatedAt: mine ? n.createdAt + 1 : n.createdAt });
            }
          };
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(page.getByText(/단어 1250개에 새 내용/)).toBeVisible();
  await page.getByRole('button', { name: '고친 내용 받기' }).click();
  await expect(page.getByText('단어 1250개를 고쳤어요')).toBeVisible();
  await expect(page.getByText('준비된 덱이 고쳐졌어요')).toHaveCount(0);

  // 직접 고친 단어도 빈 칸은 채우고, 내 메모는 그대로
  const kamu = await page.evaluate(
    () =>
      new Promise<Record<string, string>>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          open.result.transaction('notes').objectStore('notes').getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result.find((n: { fields: Record<string, string> }) => n.fields.word === 'kamu').fields);
        };
      }),
  );
  expect(kamu.note).toBe('내 메모');
  expect(kamu.en).toBe('you');
  expect(kamu.phrases).toContain('kamu di mana? = 너 어디야?');

  // 첫 카드(aku) 정답 화면
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  const card = page.locator('.card-sheet.back');
  await expect(card.locator('.b-gloss')).toHaveText('I / me');
  await expect(card.locator('.cf-phrases')).toContainText('자주 쓰는 표현');
  await expect(card.locator('.cf-phrase').first()).toContainText('aku juga');
  await expect(card.locator('.cf-phrase').first()).toContainText('나도');
  await expect(card.locator('.cf-phrase .cf-mark').first()).toHaveText('aku');
  await page.screenshot({ path: 'test-results/shots/63-id-english-phrases.png' });

  await page.getByRole('button', { name: '복습 닫기' }).click();
  await page.goto('/#/settings/display');
  await page.getByRole('group', { name: '테마' }).getByRole('button', { name: '다크' }).click();
  await page.goto('/#/decks');
  await page.getByRole('button', { name: /인도네시아어 구어체/ }).click();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await expect(page.locator('.card-sheet.back .b-gloss')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/64-id-english-phrases-dark.png' });
});
