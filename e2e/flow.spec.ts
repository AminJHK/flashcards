import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/shots/${name}.png` });

test('덱 만들기 → 단어 추가(병음 자동) → 복습 → 되돌리기', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '오늘' })).toBeVisible();
  await shot(page, '01-empty');

  await page.getByRole('button', { name: '첫 덱 만들기' }).click();
  await expect(page.getByRole('button', { name: /중국어 단어/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('덱 이름').fill('HSK 3');
  await page.getByRole('button', { name: '만들기' }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('HSK 3');

  // 역방향 켜기
  await page.getByRole('switch', { name: '역방향 카드' }).click();
  await expect(page.getByRole('switch', { name: '역방향 카드' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, '02-deck');

  // 단어 추가
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한자').fill('图书馆');
  await expect(page.getByLabel('병음')).toHaveValue('túshūguǎn');
  await expect(page.getByText('자동 입력됨')).toBeVisible();
  await page.getByLabel('뜻').fill('도서관');
  await shot(page, '03-add');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();
  await expect(page.getByText('저장했어요 · 图书馆')).toBeVisible();
  await expect(page.getByLabel('한자')).toHaveValue('');

  // 중복 경고
  await page.getByLabel('한자').fill('图书馆');
  await expect(page.getByText(/이미 있는 단어예요/)).toBeVisible();
  await page.getByLabel('한자').fill('银行');
  await expect(page.getByLabel('병음')).toHaveValue('yínháng');
  await page.getByLabel('뜻').fill('은행');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();

  // 홈
  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('장 남았어요')).toBeVisible();
  await shot(page, '04-home');

  // 복습: 노트 2개 → 형제 카드는 하루에 하나라서 2장
  await page.getByRole('button', { name: '복습 시작' }).click();
  await expect(page.locator('.b-hanzi.front')).toHaveText('图书馆');
  await shot(page, '05-front');
  await page.getByRole('button', { name: '정답 보기' }).first().click();
  await expect(page.locator('.b-pinyin')).toHaveText('túshūguǎn');
  await expect(page.getByRole('button', { name: /알았음/ })).toBeVisible();
  await shot(page, '06-back');
  await page.getByRole('button', { name: /알았음/ }).click();

  await expect(page.locator('.b-hanzi.front')).toHaveText('银行');
  await page.locator('.review-top').getByRole('button', { name: '되돌리기' }).click();
  await expect(page.locator('.b-hanzi.back')).toHaveText('图书馆');
  await page.getByRole('button', { name: /알았음/ }).click();
  await expect(page.locator('.b-hanzi.front')).toHaveText('银行');
  await page.locator('.card-area').click();
  await page.getByRole('button', { name: /다시/ }).click();

  // 학습 단계 카드만 남음 → 정해진 간격을 지키고 기다리는 화면을 보여준다
  await expect(page.getByText('잠깐 쉬어도 돼요')).toBeVisible();
  await expect(page.getByText(/분 뒤\) 다시 나와요/)).toBeVisible();
  // 원하면 바로 볼 수도 있다
  await page.getByRole('button', { name: '지금 바로 보기' }).click();
  await expect(page.locator('.b-hanzi.front')).toBeVisible();
  await page.getByRole('button', { name: '복습 닫기' }).click();
  await expect(page.getByRole('heading', { name: '오늘' })).toBeVisible();
});

test('작문 카드: 직접 쓴 답을 정답과 비교한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /중국어 작문/ }).click();
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한국어 문장').fill('언제 갈 생각이야?');
  await page.getByLabel('중국어 문장').fill('你打算什么时候去？');
  await expect(page.getByLabel('병음')).toHaveValue(/nǐ dǎ suàn/);
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();
  await page.goto('/#/review');
  await expect(page.getByText('언제 갈 생각이야?', { exact: true })).toBeVisible();
  await page.getByLabel('내 답').fill('你想什么时候去');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.getByText(/% 맞았어요/)).toBeVisible();
  await expect(page.locator('.diff-missing')).toHaveText('打算');
  await shot(page, '07-produce');
});

test('설정: 다크 테마와 4버튼이 바로 반영된다', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('group', { name: '테마' }).getByRole('button', { name: '다크' }).click();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.getByRole('button', { name: '청록' }).click();
  await shot(page, '08-settings-dark');
  await page.getByRole('group', { name: '답 버튼' }).getByRole('button', { name: '4개' }).click();
  // 기본 덱 + 단어
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /인도네시아어 단어/ }).click();
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await expect(page.getByRole('heading', { name: '단어 추가' })).toBeVisible();
  await page.getByRole('textbox', { name: /단어/ }).fill('perpustakaan');
  await page.getByRole('textbox', { name: /^뜻/ }).fill('도서관');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();
  await page.goto('/#/review');
  await page.locator('.card-area').click();
  for (const label of ['다시', '어려움', '알았음', '쉬움']) await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  await shot(page, '09-review-dark-4');
});

test('백업 내보내기 → 복원', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한자').fill('朋友');
  await page.getByLabel('뜻').fill('친구');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();
  await page.goto('/#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '지금 백업' }).click()]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^flashcards-backup-\d{8}-\d{4}\.json$/);

  // 데이터를 지우고 복원
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('flashcards'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.reload();
  await page.goto('/#/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일 고르기' }).click();
  await (await chooser).setFiles(path!);
  await page.getByRole('alertdialog').getByRole('button', { name: '복원' }).click();
  await expect(page.getByText('복원했어요 · 단어 1개')).toBeVisible();
});

test('저장이 느려도 누르는 즉시 다음 카드로 넘어가고, 방금 답한 카드는 다시 나오지 않는다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByRole('button', { name: '이 덱 복습' })).toBeVisible();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();

  // 다른 연결이 cards 저장소를 3초 동안 붙잡아서 앱의 저장을 늦춘다
  await page.evaluate(() => {
    const open = indexedDB.open('flashcards');
    open.onsuccess = () => {
      const tx = open.result.transaction('cards', 'readwrite');
      const store = tx.objectStore('cards');
      const until = Date.now() + 3000;
      const spin = () => {
        if (Date.now() < until) store.count().onsuccess = spin;
      };
      spin();
    };
  });
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.getByRole('button', { name: /알았음/ }).click();
  // 저장이 끝나기 전인데도 바로 다음 카드
  await expect(page.getByText('kamu', { exact: true })).toBeVisible({ timeout: 1500 });
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.getByRole('button', { name: /알았음/ }).click();
  await expect(page.getByText('saya', { exact: true })).toBeVisible({ timeout: 1500 });
  // 저장이 다 끝난 뒤에도 앞의 카드는 다시 나오지 않는다
  await page.waitForTimeout(3500);
  await expect(page.getByText('saya', { exact: true })).toBeVisible();
  await expect(page.getByText('aku', { exact: true })).toHaveCount(0);
  // 되돌리기는 저장이 끝난 답부터
  await page.locator('.review-top').getByRole('button', { name: '되돌리기' }).click();
  await expect(page.getByText('kamu', { exact: true }).first()).toBeVisible();
});

test('PC 키보드: 스페이스로 정답을 보고, 1·2(4버튼이면 1~4)로 답한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Aku capek banget.')).toBeVisible();
  await page.keyboard.press('2'); // 알았음
  await expect(page.getByText('kamu', { exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('1'); // 다시
  await expect(page.getByText('saya', { exact: true })).toBeVisible(); // 다시를 누른 kamu는 기다리고, 다음 새 카드가 나온다
});

test('PC 키보드: R 키로 발음을 다시 듣는다 (앞면엔 앞면, 정답을 본 뒤엔 뒷면)', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    const fake = {
      getVoices: () => [{ name: 'fake-id', lang: 'id-ID', localService: true, default: false, voiceURI: 'fake-id' }],
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      speaking: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string }, t: string) {
      this.text = t;
    };
  });
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();
  const count = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length);
  const before = await count();
  await page.keyboard.press('r');
  await expect.poll(count).toBeGreaterThan(before);
});

test('새 버전이 배포되면 자동으로 업데이트되고(복습 중에는 기다렸다가), 덱과 기록은 그대로다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 500개를 넣었어요')).toBeVisible();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();
  // 복습 중에 새 버전이 배포됐다고 흉내 낸다 → 끊지 않고 알림만
  await page.route('**/version.json*', (route) => route.fulfill({ json: { version: 'zzz9999' } }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('이 화면을 나가면 자동으로 업데이트돼요')).toBeVisible();
  await expect(page.getByText('aku', { exact: true })).toBeVisible(); // 카드는 그대로
  // 복습을 닫으면 자동으로 새로 불러온다 (클릭 없이)
  const reloaded = page.waitForEvent('framenavigated', (f) => f === page.mainFrame() && f.url().includes('v=zzz9999'));
  await page.getByRole('button', { name: '복습 닫기' }).click();
  await reloaded;
  await page.waitForLoadState('load');
  await expect.poll(() => page.url()).not.toContain('v=zzz9999'); // 새로 열린 뒤 주소의 ?v=는 지워진다
  // 덱과 기록은 그대로다
  await page.goto('/#/decks');
  await expect(page.getByRole('button', { name: /인도네시아어 구어체/ })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: '업데이트 확인' })).toBeVisible();
});
