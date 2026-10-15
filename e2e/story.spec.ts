import { expect, test, type Page } from '@playwright/test';

// 덱 첫 부분의 단어로만 쓴 가짜 이야기 (130단어) + 덱에 없는 단어 하나(bakso)
const W = 'aku kamu mau makan minum pulang nggak udah lagi sini'.split(' ');
const line = (i: number, extra = '') => ({ type: 'line', speaker: i % 2 ? 'a' : 'b', text: `${W.join(' ')}${extra}.`, ko: `번역 ${i}` });
const STORY = {
  title: 'Bakso Malam',
  titleKo: '밤의 바소',
  characters: [
    { id: 'a', name: 'Budi' },
    { id: 'b', name: 'Sari' },
  ],
  properNouns: ['Jakarta'],
  blocks: [
    { type: 'line', speaker: 'narrator', text: `${W.join(' ')} bakso.`, ko: '내레이션' },
    line(1),
    line(2),
    { type: 'choice', prompt: '부디는 무엇을 먹고 싶어 하나요?', options: ['바소', '나시고렝', '사테'], answer: 0, explain: 'bakso = 바소' },
    line(3),
    line(4),
    line(5),
    line(6),
    { type: 'truefalse', statement: '사리는 집에 가고 싶어 한다.', answerTrue: true, explain: 'pulang = 집에 가다' },
    line(7),
    line(8),
    line(9),
    line(10),
    line(11),
    line(12),
    { type: 'match', pairs: [{ id: 'makan', ko: '먹다' }, { id: 'minum', ko: '마시다' }, { id: 'pulang', ko: '집에 가다' }] },
  ],
  glossary: [{ text: 'bakso', ko: '바소 (미트볼 수프)', en: 'meatball soup' }],
};

async function mockGemini(page: Page, calls: { story: number; prompts: string[] }) {
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest' }, { name: 'models/gemini-3.8-flash-tts' }] } });
    if (url.includes('-tts:generateContent')) return route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: '' } }] } }] } });
    calls.story++;
    calls.prompts.push(route.request().postDataJSON().contents[0].parts[0].text);
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(STORY) }] } }] } });
  });
}

test('읽기: 내 덱의 단어로 이야기를 만들고, 한 줄씩 읽으며 질문에 답하고, 단어를 눌러 뜻을 보고 덱에 넣는다', async ({ page }) => {
  const calls = { story: 0, prompts: [] as string[] };
  await mockGemini(page, calls);
  await page.goto('/#/settings');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();

  // 읽기 탭
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '읽기' }).click();
  await expect(page.getByText(/아는 단어 0 · 배우는 중 0 · 아직 안 배운 덱 단어 1000/)).toBeVisible();
  await expect(page.getByText(/꼭 필요하면 덱의 다음 단어도 섞어요/)).toBeVisible();
  await page.getByRole('group', { name: '주제' }).getByRole('button', { name: '음식' }).click();
  await page.screenshot({ path: 'test-results/shots/40-read-library.png' });
  await page.getByRole('button', { name: '이야기 만들기' }).click();

  // 이야기 화면: 첫 줄만 보이고, 계속을 누르면 한 줄씩
  await expect(page.getByRole('heading', { name: 'Bakso Malam' })).toBeVisible();
  expect(calls.story).toBe(1);
  expect(calls.prompts[0]).toContain('Topic: food');
  expect(calls.prompts[0]).toContain('DECK WORDS (only when necessary): ');
  await expect(page.locator('.story-narration')).toHaveCount(1);
  await expect(page.locator('.story-line')).toHaveCount(0);
  await page.getByRole('button', { name: '계속' }).click();
  await expect(page.locator('.story-line')).toHaveCount(1);
  await expect(page.locator('.story-line').first()).toContainText('Budi');

  // 단어 누르기: 덱 밖 단어 → 생성할 때 받은 뜻 + 덱에 추가
  await page.locator('.story-narration').getByRole('button', { name: 'bakso' }).click();
  const sheet = page.getByRole('dialog', { name: 'bakso 뜻' });
  await expect(sheet).toContainText('바소 (미트볼 수프)');
  await expect(sheet).toContainText('영어: meatball soup');
  await expect(sheet).toContainText('이 문장: 내레이션');
  await page.screenshot({ path: 'test-results/shots/41-read-word.png' });
  await sheet.getByRole('button', { name: '덱에 추가' }).click();
  await expect(page.getByText('덱에 넣었어요. 새 카드로 나와요')).toBeVisible();
  await expect(sheet.getByText('덱에 있어요 · 아직 안 배움')).toBeVisible();
  await sheet.getByRole('button', { name: '닫기' }).click();
  // 덱에 있는 단어 → 덱의 뜻
  await page.locator('.story-narration').getByRole('button', { name: 'aku', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'aku 뜻' })).toContainText('나');
  await page.getByRole('dialog', { name: 'aku 뜻' }).getByRole('button', { name: '닫기' }).click();

  // 질문이 나오면 답하기 전에는 계속을 못 누른다
  await page.getByRole('button', { name: '계속' }).click();
  await page.getByRole('button', { name: '계속' }).click();
  await expect(page.getByText('부디는 무엇을 먹고 싶어 하나요?')).toBeVisible();
  await expect(page.getByRole('button', { name: '답을 골라 주세요' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/shots/42-read-question.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/44-read-question-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: '사테' }).click();
  await expect(page.getByText('아쉬워요')).toBeVisible();
  await expect(page.getByText(/정답: 바소/)).toBeVisible();

  // 중간에 닫았다 다시 열면 이어서 (AI를 다시 부르지 않는다)
  await page.getByRole('button', { name: '계속' }).click();
  await page.getByRole('button', { name: '이야기 닫기' }).click();
  await expect(page.getByText('5/16')).toBeVisible();
  await page.locator('.story-row', { hasText: 'Bakso Malam' }).click();
  await expect(page.locator('.story-line')).toHaveCount(3);
  expect(calls.story).toBe(1);

  // 끝까지: 맞다/틀리다, 짝 맞추기
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '계속' }).click();
  await page.getByRole('button', { name: '맞아요' }).click();
  await expect(page.getByText('맞았어요!')).toBeVisible();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '계속' }).click();
  for (const [id, ko] of [['makan', '먹다'], ['minum', '마시다'], ['pulang', '집에 가다']]) {
    await page.locator('.story-match').getByRole('button', { name: id, exact: true }).click();
    await page.locator('.story-match').getByRole('button', { name: ko, exact: true }).click();
  }
  await expect(page.getByText('맞았어요!')).toBeVisible();
  await page.getByRole('button', { name: '다 읽었어요' }).click();
  await expect(page.getByText('질문 3개 중 2개 맞힘')).toBeVisible();
  await expect(page.getByText('이 이야기의 새 단어')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/43-read-result.png' });
  await page.getByRole('button', { name: '목록으로' }).click();
  await expect(page.locator('.chip', { hasText: '다 읽음' })).toBeVisible();

  // 읽기는 복습이 아니다: 복습 기록이 생기지 않는다
  const logs = await page.evaluate(
    () => new Promise<number>((r) => { const o = indexedDB.open('flashcards'); o.onsuccess = () => { const q = o.result.transaction('reviewLogs').objectStore('reviewLogs').count(); q.onsuccess = () => r(q.result); }; }),
  );
  expect(logs).toBe(0);

  // 지우기
  await page.getByRole('button', { name: 'Bakso Malam 지우기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '지우기' }).click();
  await expect(page.getByText('만든 이야기')).toHaveCount(0);
});

test('읽기: Gemini 키가 없으면 연결하라고 안내한다', async ({ page }) => {
  await page.goto('/#/read');
  await expect(page.getByText('설정에서 무료 Gemini 키를 먼저 연결해 주세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '이야기 만들기' })).toHaveCount(0);
});
