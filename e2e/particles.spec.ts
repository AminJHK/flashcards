import { expect, test } from '@playwright/test';
import { formatStoryText } from '../src/core/stories/textFormat';

test('어조 말 덱: 예문 카드로 복습하고, 연결어는 새 덱으로 옮겨 예문 먼저 보며, 읽기(이야기)에 어조 말이 섞인다', async ({ page }) => {
  // 1) 어조 말 덱 설치 (예문 60장, 하루 5개)
  await page.goto('/#/decks/new');
  const row = page.locator('.row', { hasText: '인도네시아어 어조 말' });
  await expect(row).toContainText('단어 60개');
  await row.getByRole('button', { name: /추가하기$/ }).click();
  await expect(page.getByText('단어 60개를 넣었어요')).toBeVisible();
  await expect(page.getByLabel('덱 이름')).toHaveValue('인도네시아어 어조 말');
  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 5')).toBeVisible();

  // 2) 복습: 앞면은 예문과 질문, 뒷면에 느낌과 설명
  await page.locator('.deck-row').first().click();
  await expect(page.getByText(/「sih」는 여기서 어떤 느낌일까\?/)).toBeVisible();
  await expect(page.getByText('Kenapa sih kamu telat terus?', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/53-particle-front.png' });
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await expect(page.getByText('도대체 넌 왜 계속 늦어?')).toBeVisible();
  await expect(page.getByText('투덜대는 궁금함 · ~긴 한데')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/54-particle-back.png' });
  await page.getByRole('button', { name: /알았음/ }).click();

  // 3) 인도네시아어 구어체 덱을 넣고, 연결어를 새 덱으로 옮긴다
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  await expect(page.getByText(/연결어·표현 \d+개를 따로 모을 수 있어요/)).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/55-connector-offer.png' });
  await page.getByRole('button', { name: '연결어 따로 모으기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '옮기기' }).click();
  await expect(page.getByText(/개를 「연결어·표현」으로 옮겼어요/)).toBeVisible();
  await expect(page.getByLabel('덱 이름')).toHaveValue('연결어·표현');
  // 새 덱 설정: 예문 먼저 보기 켜짐, 하루 3개
  await expect(page.getByRole('switch', { name: '예문 먼저 보기' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'test-results/shots/56-connector-deck.png' });
  // 옮긴 뒤 구어체 덱에는 새 단어 알림이 다시 뜨지 않는다
  await page.goto('/#/decks');
  await page.locator('.deck-row, .row', { hasText: '인도네시아어 구어체' }).first().click();
  await expect(page.getByText(/준비된 덱에 새 단어/)).toHaveCount(0);
  await expect(page.getByText(/연결어·표현 \d+개를 따로 모을 수 있어요/)).toHaveCount(0);

  // 4) 연결어 덱을 복습하면 앞면이 예문
  await page.getByRole('link', { name: '오늘' }).click();
  await page.locator('.deck-row', { hasText: '연결어·표현' }).click();
  await expect(page.getByText(/「[a-z-]+」는 여기서 무슨 뜻일까\?/)).toBeVisible();
});

test('읽기: 어조 말이 이야기 만들기 요청에 PARTICLE로 들어가고, 이야기 속 어조 말을 누르면 느낌이 나온다', async ({ page }) => {
  const prompts: string[] = [];
  const STORY = {
    title: 'Kok Gitu',
    titleKo: '왜 그래',
    characters: [{ id: 'a', name: 'Budi' }, { id: 'b', name: 'Sari' }],
    properNouns: [],
    blocks: [
      { type: 'line', speaker: 'a', text: 'aku mau makan sih', ko: '나 먹고 싶긴 한데', chunks: [{ text: 'aku', ko: '나' }] },
      ...Array.from({ length: 7 }, (_, i) => ({ type: 'line', speaker: i % 2 ? 'a' : 'b', text: 'aku mau makan nggak udah lagi sini', ko: `번역 ${i}` })),
      { type: 'choice', prompt: '?', options: ['가', '나', '다'], answer: 0, explain: '설명' },
      { type: 'truefalse', statement: '맞나?', answerTrue: true, explain: '네' },
      { type: 'match', pairs: [{ id: 'aku', ko: '나' }, { id: 'mau', ko: '원하다' }, { id: 'makan', ko: '먹다' }] },
    ],
    glossary: [],
  };
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest' }, { name: 'models/gemini-3.8-flash-tts' }] } });
    if (url.endsWith('/interactions')) return route.fulfill({ json: { steps: [{ type: 'model_output', content: [{ type: 'audio', data: btoa('RIFF' + '\0'.repeat(4) + 'WAVE'), mime_type: 'audio/wav' }] }] } });
    prompts.push(route.request().postDataJSON().contents[0].parts[0].text);
    const body = { candidates: [{ content: { parts: [{ text: formatStoryText(STORY) }] } }] };
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(body)}\r\n\r\n` });
  });
  await page.goto('/#/settings/voice');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText(/연결됨/)).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.locator('.row', { hasText: '인도네시아어 어조 말' }).getByRole('button', { name: /추가하기$/ }).click();
  await expect(page.getByText('단어 60개를 넣었어요')).toBeVisible();

  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '읽기' }).click();
  await page.getByRole('button', { name: '이야기 만들기' }).click();
  await expect(page.locator('.story-row', { hasText: 'Kok Gitu' })).toBeVisible();
  // 아직 안 본 어조 말 하나를 이야기에서 소개하라고 요청한다 (덱의 첫 어조 말 = sih)
  expect(prompts[0]).toMatch(/NEW PARTICLE: sih/);
  expect(prompts[0]).toMatch(/PARTICLES are short spoken particles/);
  expect(prompts[0]).not.toMatch(/NEW WORDS:.*\bsih\b/);

  // 이야기 속 sih를 누르면 느낌이 말풍선으로
  await page.locator('.story-row', { hasText: 'Kok Gitu' }).click();
  await page.locator('.story-line').first().getByRole('button', { name: 'sih', exact: true }).click();
  await expect(page.getByRole('tooltip')).toContainText('투덜대는 궁금함');
});

test('지운 단어 되살리기: 지운 단어만(중복·어조 말 덱이 맡은 말 제외) 골라서 되살린다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  // 처음에는 되살릴 것이 없다
  await expect(page.getByText(/지운 단어 \d+개를 되살릴 수 있어요/)).toHaveCount(0);

  // aja · doang · emang(연결어) · dong(어조 말) · bakso 같은 일반 단어 하나를 지운다
  const url = page.url();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('flashcards');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['notes', 'cards'], 'readwrite');
          const notes = tx.objectStore('notes');
          const cards = tx.objectStore('cards');
          const gone = new Set(['aja', 'doang', 'emang', 'dong', 'sih']);
          notes.getAll().onsuccess = (e) => {
            for (const n of (e.target as IDBRequest).result as { id: string; fields: { word?: string } }[]) {
              if (!gone.has(n.fields.word ?? '')) continue;
              notes.delete(n.id);
              cards.getAll().onsuccess = (ev) => {
                for (const c of (ev.target as IDBRequest).result as { id: string; noteId: string }[]) if (c.noteId === n.id) cards.delete(c.id);
              };
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload(); // DB를 직접 고쳤으니 화면을 새로 연다
  await expect(page).toHaveURL(url);
  // dong·sih는 어조 말 덱이 맡았으니 빼고 3개: aja, doang, emang
  await expect(page.getByText('지운 단어 3개를 되살릴 수 있어요')).toBeVisible();
  await expect(page.getByText(/aja, doang, emang|aja, emang, doang|doang, aja, emang|emang, aja, doang/)).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/57-restore-panel.png' });
  await page.getByRole('button', { name: '3개 되살리기' }).click();
  await expect(page.getByText('단어 3개를 되살렸어요')).toBeVisible();
  await expect(page.getByText(/지운 단어 \d+개를 되살릴 수 있어요/)).toHaveCount(0);
  // 한 번 더 지워지지 않는다: 단어 수 997 + 3
  await expect(page.getByRole('button', { name: /단어 998개 보기/ })).toBeVisible();
});
