import { expect, test } from '@playwright/test';

test('준비된 덱(심장 병동 간호 중국어)을 넣고, 말하기·듣기 카드를 복습한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(page.getByText(/문장 \d+개를 넣었어요/)).toBeVisible();
  await expect(page.getByLabel('덱 이름')).toHaveValue('심장 병동 간호 중국어');
  await expect(page.getByRole('button', { name: /단어 2\d\d개 보기/ })).toBeVisible();

  // 오늘의 새 카드 10개
  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 10')).toBeVisible();

  await page.getByRole('button', { name: '복습 시작' }).click();
  // 첫 카드: 간호사가 할 말 (한국어 → 중국어)
  await expect(page.getByText('안녕하세요, 오늘 담당 간호사예요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /정답 보기/ }).click();
  await expect(page.getByText('您好，我是今天负责照顾您的护士。')).toBeVisible();
  await page.getByRole('button', { name: /알았음/ }).click();
  await page.getByRole('button', { name: /정답 보기/ }).click();
  await page.getByRole('button', { name: /알았음/ }).click();

  // 세 번째: 환자의 말 (듣기 카드) → 재생 버튼과 글자 보기
  await expect(page.getByRole('button', { name: '다시 듣기' })).toBeVisible();
  await expect(page.getByText('我叫王丽华，一九五二年三月八号出生。')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/shots/11-listen-front.png' });
  await page.getByRole('button', { name: '글자 보기' }).click();
  await expect(page.getByText('我叫王丽华，一九五二年三月八号出生。')).toBeVisible();
  await page.getByRole('button', { name: '정답 보기' }).click();
  await expect(page.getByText('저는 왕리화이고, 1952년 3월 8일생이에요.')).toBeVisible();
  await expect(page.locator('.b-pinyin')).toContainText('chū shēng');
  await page.screenshot({ path: 'test-results/shots/12-listen-back.png' });
});
