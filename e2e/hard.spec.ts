import { expect, test } from '@playwright/test';

test('어려운 단어: 여러 번 틀린 단어가 덱 화면·단어 목록에 표시되고, 그 자리에서 참고를 적는다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^여행 스페인어.* 추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  await expect(page.getByRole('button', { name: /어려운 단어 0개/ })).toBeVisible();

  // 첫 단어(la casa)와 두 번째(ir)를 한 번씩 복습
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  for (const r of [/다시/, /다시/]) {
    await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
    await page.getByRole('button', { name: r }).click();
  }
  await page.getByRole('button', { name: '복습 닫기' }).click();

  // 여러 날에 걸쳐 잊어버린 것처럼: la casa는 5번, ir는 2번
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          const tx = open.result.transaction(['notes', 'cards'], 'readwrite');
          tx.objectStore('notes').getAll().onsuccess = (e) => {
            const ids = new Map<string, number>();
            for (const n of (e.target as IDBRequest).result) {
              if (n.fields.front === 'la casa') ids.set(n.id, 5);
              if (n.fields.front === 'ir') ids.set(n.id, 2);
            }
            const cards = tx.objectStore('cards');
            cards.getAll().onsuccess = (ev) => {
              for (const c of (ev.target as IDBRequest).result) if (ids.has(c.noteId)) cards.put({ ...c, lapses: ids.get(c.noteId) });
            };
          };
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await page.goto('/#/decks');
  await page.getByRole('button', { name: /여행 스페인어/ }).click();
  await expect(page.getByRole('button', { name: /어려운 단어 1개/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/59-hard-entry.png' });

  // 전체 단어 목록에도 표시
  await page.getByRole('button', { name: /단어 514개 보기/ }).click();
  await page.getByRole('group', { name: '정렬' }).getByRole('button', { name: '기억 약한 순' }).click();
  await expect(page.locator('.list-row').filter({ hasText: 'la casa' }).getByText('어려움')).toBeVisible();
  await expect(page.locator('.list-row').filter({ hasText: /^ir/ }).getByText('어려움')).toHaveCount(0);

  await page.getByRole('button', { name: '여행 스페인어' }).click();
  await page.getByRole('button', { name: /어려운 단어 1개/ }).click();
  await expect(page.getByRole('heading', { name: '어려운 단어 1개' })).toBeVisible();
  await expect(page.getByText('5번 틀림')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/60-hard-list.png' });

  await page.getByRole('button', { name: /la casa/ }).click();
  const memo = page.getByLabel('la casa 참고');
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled();
  await memo.fill('카사 → "까사미아" 집 가구');
  await page.screenshot({ path: 'test-results/shots/61-hard-edit.png' });
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('참고를 저장했어요')).toBeVisible();

  // 단어 편집 화면에서도 같은 메모가 보이고, 돌아오면 어려운 단어 목록
  await page.getByRole('button', { name: '단어 전체 고치기' }).click();
  await expect(page.getByText('카사 → "까사미아" 집 가구')).toBeVisible();
  await page.goBack();

  await page.goto('/#/settings/display');
  await page.getByRole('group', { name: '테마' }).getByRole('button', { name: '다크' }).click();
  await page.goBack();
  await page.getByRole('button', { name: /la casa/ }).click();
  await page.screenshot({ path: 'test-results/shots/62-hard-edit-dark.png' });
});
