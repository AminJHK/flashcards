import { expect, test } from '@playwright/test';

test('준비된 덱(심장 병동 간호 중국어)을 넣고, 말하기·듣기 카드를 복습한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.locator('.panel', { hasText: '심장 병동 간호 중국어' }).getByRole('button', { name: '이 덱 추가하기' }).click();
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

test('여행 스페인어 덱: 스페인어 단어를 보고 영어 뜻과 예문을 확인한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  const panel = page.locator('.panel', { hasText: '여행 스페인어' });
  await expect(panel).toContainText('단어 514개');
  await panel.getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(page.getByText('단어 514개를 넣었어요')).toBeVisible();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');

  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 15')).toBeVisible();
  await page.getByRole('button', { name: '복습 시작' }).click();
  // 기본값: 영어를 보고 스페인어를 떠올린다
  await expect(page.getByText('house, home', { exact: true })).toBeVisible();
  await expect(page.getByText('la casa', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await expect(page.getByText('la casa', { exact: true })).toBeVisible();
  await expect(page.getByText('en casa at home')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/13-spanish-back.png' });
  await page.getByRole('button', { name: '복습 닫기' }).click();

  // 설정에서 방향을 바꾼다: 정방향(스페인어 → 영어)을 켜고 역방향을 끈다
  await page.goto('/#/decks');
  await page.getByRole('button', { name: /여행 스페인어/ }).click();
  await expect(page.getByText('역방향만')).toHaveCount(0);
  await page.getByRole('switch', { name: '정방향 카드' }).click();
  await expect(page.getByRole('switch', { name: '정방향 카드' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('switch', { name: '역방향 카드' }).click();
  await expect(page.getByRole('switch', { name: '역방향 카드' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('la casa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await expect(page.getByText('house, home', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /알았음/ }).click();
  await expect(page.getByText('ir', { exact: true })).toBeVisible();
});

test('스페인어 불규칙 동사 덱: 동사를 보고 여섯 인칭 변화형을 확인한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  const panel = page.locator('.panel', { hasText: '스페인어 불규칙 동사 변화' });
  await panel.getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('스페인어 불규칙 동사');
  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 5')).toBeVisible();
  await page.getByRole('button', { name: '복습 시작' }).click();
  await expect(page.getByText('ser', { exact: true })).toBeVisible();
  await expect(page.getByText('presente', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  for (const t of ['yo soy', 'tú eres', 'él es', 'nosotros somos', 'vosotros sois', 'ellos son']) await expect(page.getByText(t, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/14-spanish-conj-back.png' });
});

test('덱의 "새 단어 카드 종류"를 바꿔도 이미 있는 스페인어 단어의 언어 설정은 그대로 보인다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.locator('.panel', { hasText: '여행 스페인어' }).getByRole('button', { name: '이 덱 추가하기' }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  await expect(page.getByLabel('앞면 언어')).toHaveValue('es-ES');
  await expect(page.getByLabel('뒷면 언어')).toHaveValue('en-US');

  // 새 단어의 종류를 듣기로 바꿔도 (새 단어에만 적용) 기존 단어 기준의 설명과 언어 설정이 남는다
  await page.getByRole('group', { name: '카드 종류' }).getByRole('button', { name: '듣기' }).click();
  await expect(page.getByText('새로 추가하는 단어에만 적용돼요')).toBeVisible();
  await expect(page.getByLabel('앞면 언어')).toHaveValue('es-ES');
  await expect(page.getByText('스페인어 → 영어')).toBeVisible();
  await expect(page.getByText('발음: 중국어(zh-CN)로 읽어요')).toHaveCount(0);
});
