import { expect, test } from '@playwright/test';

test('기기 음성: 기본은 휴대폰 기본 목소리, 목소리를 고르면 그 목소리로, 속도·높낮이는 앱에서 정한다', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string; voice?: string; rate: number; pitch: number }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    const voice = (name: string) => ({ name, lang: 'id-ID', localService: true, default: false, voiceURI: name });
    const fake = {
      getVoices: () => [voice('Samsung id 1'), voice('Samsung id 2')],
      speak: (u: { text: string; lang: string; voice?: { name: string }; rate: number; pitch: number }) => spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name, rate: u.rate, pitch: u.pitch }),
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      speaking: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string; rate: number; pitch: number }, t: string) {
      this.text = t;
      this.rate = 1;
      this.pitch = 1;
    };
  });
  const last = () => page.evaluate(() => (window as unknown as { __spoken: { voice?: string; rate: number; pitch: number }[] }).__spoken.at(-1));

  await page.goto('/#/settings/voice');
  const select = page.getByLabel('인도네시아어 음성');
  await expect(select).toHaveValue('');
  await expect(select.locator('option').first()).toHaveText('휴대폰 기본 목소리');
  const row = page.locator('.row', { has: select });
  await row.getByRole('button', { name: '듣기' }).click();
  expect(await last()).toMatchObject({ voice: undefined, rate: 0.9, pitch: 1 });

  // 높낮이 낮추고 속도 줄이기
  await page.getByRole('button', { name: '기기 음성 높낮이 줄이기' }).click();
  await page.getByRole('button', { name: '기기 음성 높낮이 줄이기' }).click();
  await expect(page.getByRole('group', { name: '기기 음성 높낮이' })).toContainText('0.90');
  await page.getByRole('button', { name: '기기 음성 속도 줄이기' }).click();
  await expect(page.getByRole('group', { name: '기기 음성 속도' })).toContainText('0.85배');
  await select.selectOption('Samsung id 2');
  await row.getByRole('button', { name: '듣기' }).click();
  expect(await last()).toMatchObject({ voice: 'Samsung id 2', rate: 0.85, pitch: 0.9 });
  await page.screenshot({ path: 'test-results/shots/65-device-voice.png', fullPage: true });

  // 다시 기본 목소리로
  await select.selectOption('');
  await row.getByRole('button', { name: '듣기' }).click();
  expect(await last()).toMatchObject({ voice: undefined, pitch: 0.9 });

  // 단어 카드에도 같은 값
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();
  await page.keyboard.press('r');
  await expect.poll(last).toMatchObject({ voice: undefined, rate: 0.85, pitch: 0.9 });
});
