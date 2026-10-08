import { expect, test, type Page } from '@playwright/test';

// 진짜 Google 서버 대신 가짜 응답을 준다. 키도 가짜.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

// 0.2초 길이 무음 PCM (24kHz, 16bit)
const silence = Buffer.alloc(24000 * 2 * 0.2).toString('base64');

async function mockGemini(page: Page, calls: { tts: string[]; stt: number }) {
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/models?')) {
      return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest' }, { name: 'models/gemini-3.8-flash-tts' }] } });
    }
    const body = route.request().postDataJSON();
    if (url.includes('-tts:generateContent')) {
      calls.tts.push(body.contents[0].parts[0].text);
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: silence } }] } }] } });
    }
    calls.stt++;
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '你想什么时候去' }] } }] } });
  });
}

test('Gemini 키를 연결하면 단어 음성을 만들어 저장하고, 말한 답을 받아쓴다', async ({ page }) => {
  const calls = { tts: [] as string[], stt: 0 };
  await mockGemini(page, calls);

  await page.goto('/#/settings');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결했어요')).toBeVisible();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/10-gemini-settings.png', fullPage: true });

  // 작문 덱 + 문장 하나 → 저장할 때 음성을 미리 만든다
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /중국어 작문/ }).click();
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한국어 문장').fill('언제 갈 생각이야?');
  await page.getByLabel('중국어 문장').fill('你打算什么时候去？');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();
  await expect.poll(() => calls.tts.filter((t) => t.includes('你打算什么时候去')).length).toBe(1);

  // 복습: 마이크로 답하기 → 받아쓰기 → 비교
  await page.goto('/#/review');
  await page.getByRole('button', { name: '말해서 답하기' }).click();
  await expect(page.locator('.voice-bars')).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '말하기 끝내기' }).click();
  await expect(page.getByLabel('내 답')).toHaveValue('你想什么时候去');
  expect(calls.stt).toBe(1);
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.locator('.diff-missing')).toHaveText('打算');

  // 발음 버튼: 이미 저장된 음성을 쓰므로 TTS를 다시 부르지 않는다
  const before = calls.tts.length;
  await page.getByRole('button', { name: '발음 듣기' }).click();
  await page.waitForTimeout(500);
  expect(calls.tts.length).toBe(before);
  await expect(page.getByText(/기기 음성으로 읽었어요/)).toHaveCount(0);
});

test('Gemini가 실패하면 기기 음성으로 대신 읽고 이유를 알려준다', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.request().url().includes('/models?')
      ? route.fulfill({ json: { models: [{ name: 'models/gemini-3.8-flash-tts' }] } })
      : route.request().url().includes('-tts') && route.request().postDataJSON().contents[0].parts[0].text.includes('你好')
        ? route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: silence } }] } }] } })
        : route.fulfill({ status: 429, json: { error: { message: 'quota' } } }),
  );
  await page.goto('/#/settings');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한자').fill('朋友');
  await page.getByLabel('뜻').fill('친구');
  await page.getByRole('button', { name: '들어보기' }).click();
  await expect(page.getByText(/무료 사용량/)).toBeVisible();
});
