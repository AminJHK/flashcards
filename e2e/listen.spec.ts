import { expect, test, type Page } from '@playwright/test';

/** 기기 음성 흉내: 읽은 문장을 모으고, 조금 뒤 "다 읽음"을 알린다 */
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    const voice = (name: string, lang: string) => ({ name, lang, localService: true, default: false, voiceURI: name });
    const fake = {
      getVoices: () => [voice('id 1', 'id-ID'), voice('ko 1', 'ko-KR')],
      speak: (u: { text: string; lang: string; onend?: () => void }) => {
        spoken.push({ text: u.text, lang: u.lang });
        setTimeout(() => u.onend?.(), 60);
      },
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      speaking: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string; lang: string }, t: string) {
      this.text = t;
    };
  });
}

const story = (id: string, title: string, titleKo: string, lines: [string, string][], createdAt: number) => ({
  id,
  createdAt,
  lang: 'id-ID',
  difficulty: 'normal',
  topic: 'free',
  title,
  titleKo,
  characters: [
    { id: 'a', name: 'Budi', color: 0 },
    { id: 'b', name: 'Sari', color: 1 },
  ],
  properNouns: [],
  blocks: lines.map(([text, ko], i) => ({ kind: 'line', speaker: i % 2 ? 'b' : 'a', text, ko })),
  glossary: [],
  coverage: { tokens: 10, known: 10, learning: 0, deckNew: 0, outside: 0, names: 0, familiar: 1, deckNewWords: [], outsideWords: [] },
  snapshot: { known: 0, learning: 0, deckNew: 0 },
  model: 'test',
  attempts: 1,
});

test('운전 모드: 다 읽은 이야기만 해석과 함께 이어서 읽고, 이 문장 다시 · 다음 이야기 · 해석 끄기가 된다', async ({ page }) => {
  await fakeVoice(page);
  await page.goto('/#/read');
  await expect(page.getByRole('heading', { name: '읽기' })).toBeVisible();
  // 끝까지 읽은 이야기 2개, 아직 안 읽은 이야기 1개
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          const tx = open.result.transaction(['stories', 'storyProgress'], 'readwrite');
          for (const s of rows.stories) tx.objectStore('stories').put(s);
          for (const p of rows.progress) tx.objectStore('storyProgress').put(p);
          tx.oncomplete = () => resolve();
        };
      }),
    {
      stories: [
        story('s1', 'Kopi Pagi', '아침 커피', [['Aku mau kopi.', '나 커피 마시고 싶어.'], ['Ayo ke warung.', '가게에 가자.']], 1),
        story('s2', 'Hujan', '비', [['Hujan lagi.', '또 비 와.'], ['Bawa payung.', '우산 챙겨.']], 2),
        story('s3', 'Belum Dibaca', '아직 안 읽음', [['Ini baru.', '이건 새 거야.']], 3),
      ],
      progress: [
        { storyId: 's1', position: 2, answers: {}, readCount: 1, updatedAt: 1, completedAt: 1 },
        { storyId: 's2', position: 2, answers: {}, readCount: 1, updatedAt: 1, completedAt: 1 },
      ],
    },
  );
  await page.reload();
  const start = page.getByRole('button', { name: /다 읽은 이야기 이어 듣기/ });
  await expect(start).toContainText('2개');
  await page.screenshot({ path: 'test-results/shots/80-listen-button.png' });
  await start.click();
  await expect(page.getByText('운전 모드', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '메인 메뉴' })).toHaveCount(0);

  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string }[] }).__spoken.map((s) => `${s.lang}:${s.text}`));
  // 제목 안내 → 인도네시아어 → 한국어 해석 순서로 읽는다
  await expect.poll(spoken, { timeout: 10_000 }).toEqual(expect.arrayContaining([expect.stringMatching(/^ko-KR:1번째 이야기\. /), 'id-ID:Aku mau kopi.', 'ko-KR:나 커피 마시고 싶어.']));
  const all = await spoken();
  expect(all.indexOf('id-ID:Aku mau kopi.')).toBeLessThan(all.indexOf('ko-KR:나 커피 마시고 싶어.'));
  await page.screenshot({ path: 'test-results/shots/81-listen-mode.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/82-listen-mode-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  // 다 읽은 두 이야기를 이어서 읽고, 안 읽은 이야기는 읽지 않는다
  await expect.poll(spoken, { timeout: 15_000 }).toEqual(expect.arrayContaining([expect.stringMatching(/^ko-KR:2번째 이야기\. /)]));
  expect((await spoken()).some((t) => t.includes('Ini baru.'))).toBe(false);

  // 멈춤 → 이 문장 다시
  await page.getByRole('button', { name: '멈춤' }).click();
  const before = (await spoken()).length;
  await page.getByRole('button', { name: '이 문장 다시' }).click();
  await expect.poll(async () => (await spoken()).length).toBeGreaterThan(before);
  // 해석 끄기: 다음 이야기부터 한국어 해석을 읽지 않는다 (제목 안내만)
  await page.getByRole('switch', { name: '해석도 같이 듣기' }).click();
  await page.getByRole('button', { name: '다음 이야기' }).click();
  const mark = (await spoken()).length;
  await expect.poll(async () => (await spoken()).slice(mark).filter((t) => t.startsWith('id-ID:')).length, { timeout: 10_000 }).toBeGreaterThan(1);
  const after = (await spoken()).slice(mark);
  expect(after.filter((t) => t.startsWith('ko-KR:') && !/번째 이야기/.test(t))).toEqual([]);

  // 나가면 멈춘다
  await page.getByRole('button', { name: '운전 모드 닫기' }).click();
  await expect(page.getByRole('heading', { name: '읽기' })).toBeVisible();
});
