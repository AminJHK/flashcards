import { expect, test, type Page } from '@playwright/test';

test.use({
  permissions: ['microphone'],
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

/** 브라우저 음성 인식을 흉내 낸다. heard가 빈 문자열이면 아무것도 못 듣고 끝난다 (실제 폰에서 자주 생기는 일). */
async function fakeWebSpeech(page: Page, heard: string, error?: string) {
  await page.addInitScript(
    ([heard, error]) => {
      class FakeRecognition {
        lang = '';
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {}
        stop() {
          setTimeout(() => {
            if (error) this.onerror?.({ error });
            else if (heard) this.onresult?.({ results: [[{ transcript: heard }]] });
            this.onend?.();
          }, 50);
        }
        abort() {
          this.onend?.();
        }
      }
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
      (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    },
    [heard, error ?? ''],
  );
}

async function sentenceCard(page: Page) {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /중국어 작문/ }).click();
  await page.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('link', { name: '추가' }).click();
  await page.getByLabel('한국어 문장').fill('언제 갈 생각이야?');
  await page.getByLabel('중국어 문장').fill('你打算什么时候去？');
  await page.getByRole('button', { name: '저장하고 다음 단어' }).click();
  await page.goto('/#/review');
}

test('기기 음성 인식이 아무것도 못 들으면 조용히 끝나지 않고 이유와 해결법을 알려준다', async ({ page }) => {
  await fakeWebSpeech(page, '');
  await sentenceCard(page);
  await page.getByRole('button', { name: '말해서 답하기' }).click();
  await expect(page.locator('.voice-bars')).toBeVisible();
  await page.getByRole('button', { name: '말하기 끝내기' }).click();
  await expect(page.getByText(/알아듣지 못했어요 · 설정에서 자연스러운 음성\(Gemini\)을 연결하면/)).toBeVisible();
});

test('기기 음성 인식이 막혀 있으면(service-not-allowed) 그렇게 알려준다', async ({ page }) => {
  await fakeWebSpeech(page, '', 'service-not-allowed');
  await sentenceCard(page);
  await page.getByRole('button', { name: '말해서 답하기' }).click();
  await page.getByRole('button', { name: '말하기 끝내기' }).click();
  await expect(page.getByText(/기기 음성 인식이 막혀 있어요/)).toBeVisible();
});

test('기기 음성 인식이 들은 말은 답 칸에 들어간다', async ({ page }) => {
  await fakeWebSpeech(page, '你想什么时候去');
  await sentenceCard(page);
  await page.getByRole('button', { name: '말해서 답하기' }).click();
  await page.getByRole('button', { name: '말하기 끝내기' }).click();
  await expect(page.getByLabel('내 답')).toHaveValue('你想什么时候去');
});

test('Gemini: 이 기기에서 WAV 변환이 안 되면 녹음 원본 형식으로 보낸다', async ({ page }) => {
  // 일부 안드로이드 폰처럼 decodeAudioData가 실패하게 만든다
  await page.addInitScript(() => {
    AudioContext.prototype.decodeAudioData = () => Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
  });
  const mimes: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest' }, { name: 'models/gemini-3.8-flash-tts' }] } });
    if (url.includes('-tts:')) return route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAAA' } }] } }] } });
    mimes.push(route.request().postDataJSON().contents[0].parts[0].inlineData.mimeType);
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '你好，我是护士' }] } }] } });
  });
  await page.goto('/#/settings');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();

  // 설정의 말하기 테스트 (두 번 빨리 눌러도 녹음이 하나만 시작된다)
  // 같은 순간에 두 번 누른다 (마이크 권한 창이 떠 있는 동안 두 번 누르는 상황)
  await page.getByRole('button', { name: '말하기 테스트 시작' }).evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(page.locator('.voice-bars')).toBeVisible();
  await expect(page.getByText(/다 말했으면 ■ 누르기/)).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/shots/14-voice-meter-gemini.png' });
  await page.getByRole('button', { name: '말하기 끝내기' }).click();
  await expect(page.getByText('들은 말: 你好，我是护士')).toBeVisible();
  expect(mimes).toHaveLength(1);
  expect(mimes[0]).toMatch(/^audio\/(webm|ogg|mp4)$/);
});

test('기기 음성 인식이 중간에 혼자 끝나도 다시 이어 듣고, 들은 글자를 실시간으로 보여준다', async ({ page }) => {
  // 실제 안드로이드처럼: 한 마디 듣고 0.3초 뒤 혼자 끝나 버리는 인식기
  await page.addInitScript(() => {
    const words = ['你想', '什么时候', '去'];
    let session = 0;
    class EarlyEnd {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      private t?: ReturnType<typeof setTimeout>;
      start() {
        const w = words[session++];
        this.t = setTimeout(() => {
          if (w) this.onresult?.({ results: [[{ transcript: w }]] });
          setTimeout(() => this.onend?.(), 100);
        }, 200);
      }
      stop() {
        clearTimeout(this.t);
        setTimeout(() => this.onend?.(), 20);
      }
      abort() {
        this.onend?.();
      }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = EarlyEnd;
    (window as unknown as Record<string, unknown>).SpeechRecognition = EarlyEnd;
  });
  await sentenceCard(page);
  await page.getByRole('button', { name: '말해서 답하기' }).click();
  await expect(page.locator('.voice-bars span')).toHaveCount(28);
  await expect(page.locator('.voice-partial')).toHaveText('你想 什么时候 去', { timeout: 5000 });
  await page.screenshot({ path: 'test-results/shots/13-voice-meter.png' });
  await page.getByRole('button', { name: '말하기 끝내기' }).click();
  await expect(page.getByLabel('내 답')).toHaveValue('你想 什么时候 去');
});
