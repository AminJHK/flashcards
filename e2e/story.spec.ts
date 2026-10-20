import { expect, test, type Page } from '@playwright/test';
import { formatStoryText } from '../src/core/stories/textFormat';

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
    // 예전 이야기처럼 의미 단위가 남아 있는 줄 (이제는 묶지 않고 단어 하나씩)
    { ...line(1), chunks: [{ text: 'aku kamu', ko: '나 너' }, { text: 'mau makan', ko: '먹고 싶다' }, { text: 'minum', ko: '마시다' }, { text: 'pulang nggak', ko: '집에 안 가' }, { text: 'udah lagi sini', ko: '이미 또 여기' }] },
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

async function mockGemini(page: Page, calls: { story: number; prompts: string[] }, delayMs = 0) {
  await page.context().route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest' }, { name: 'models/gemini-3.8-flash-tts' }] } });
    if (url.includes('-tts:generateContent')) return route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: '' } }] } }] } });
    if (url.endsWith('/interactions')) return route.fulfill({ json: {
      steps: [{ type: 'model_output', content: [{ type: 'audio', data: btoa('RIFF' + '\\0'.repeat(4) + 'WAVE'), mime_type: 'audio/wav' }] }],
    } });
    calls.story++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    calls.prompts.push(route.request().postDataJSON().contents[0].parts[0].text);
    const body = { candidates: [{ content: { parts: [{ text: formatStoryText(STORY) }] } }] };
    if (url.includes(':streamGenerateContent')) return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(body)}\r\n\r\n` });
    return route.fulfill({ json: body });
  });
}

test('읽기: 내 덱의 단어로 이야기를 만들고, 한 줄씩 읽으며 질문에 답하고, 단어를 눌러 뜻을 보고 덱에 넣는다', async ({ page }) => {
  const calls = { story: 0, prompts: [] as string[] };
  await mockGemini(page, calls);
  await page.goto('/#/settings/voice');
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
  // 만들어지면 화면을 옮기지 않고 목록에 나타난다. 눌러서 읽는다
  await expect(page.locator('.story-row', { hasText: 'Bakso Malam' })).toBeVisible();
  await page.locator('.story-row', { hasText: 'Bakso Malam' }).click();

  // 이야기 화면: 첫 줄만 보이고, 다음 문장 버튼을 누르면 한 줄씩 (계속 버튼은 따로 없다)
  await expect(page.getByRole('heading', { name: 'Bakso Malam' })).toBeVisible();
  expect(calls.story).toBe(1);
  expect(calls.prompts[0]).toContain('Topic: food');
  expect(calls.prompts[0]).toContain('DECK WORDS (only when necessary): ');
  await expect(page.locator('.story-narration')).toHaveCount(1);
  await expect(page.locator('.story-line')).toHaveCount(0);
  await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  await expect(page.locator('.story-line')).toHaveCount(1);
  await expect(page.locator('.story-line').first()).toContainText('Budi');

  // Each character and the narrator have their own selectable Gemini voice.
  await page.getByRole('button', { name: '음성 속도와 목소리 설정' }).click();
  const audio = page.getByRole('dialog', { name: '이야기 음성 설정' });
  await expect(audio.getByRole('switch', { name: '무료 TTS 모델 자동 전환' })).toHaveAttribute('aria-checked', 'true');
  await expect(audio.getByLabel('나레이션 목소리', { exact: true })).toHaveValue('Charon');
  await expect(audio.getByLabel('Budi 목소리', { exact: true })).toHaveValue('Aoede');
  await expect(audio.getByLabel('Sari 목소리', { exact: true })).toHaveValue('Puck');
  await expect(audio.getByRole('slider', { name: '이야기 읽기 속도' })).toHaveValue('0.85');
  await audio.getByRole('slider', { name: '이야기 읽기 속도' }).focus();
  await audio.getByRole('slider', { name: '이야기 읽기 속도' }).press('ArrowLeft');
  await expect(audio.getByRole('slider', { name: '이야기 읽기 속도' })).toHaveValue('0.8');
  await audio.getByLabel('Sari 목소리', { exact: true }).selectOption('Orus');
  await expect(audio.getByLabel('Sari 목소리', { exact: true })).toHaveValue('Orus');
  await audio.getByRole('button', { name: '완료' }).click();
  await page.getByRole('button', { name: '음성 속도와 목소리 설정' }).click();
  await expect(page.getByRole('dialog', { name: '이야기 음성 설정' }).getByLabel('Sari 목소리', { exact: true })).toHaveValue('Orus');
  await expect(page.getByRole('dialog', { name: '이야기 음성 설정' }).getByRole('slider', { name: '이야기 읽기 속도' })).toHaveValue('0.8');
  await page.getByRole('button', { name: '음성 설정 닫기' }).click();
  // 잘 읽힐 때는 모델 이름 같은 기술 정보를 띄우지 않는다 (기기 음성으로 바뀌었을 때만 이유를 보여 준다)
  await expect(page.getByText(/Gemini AI ·/)).toHaveCount(0);
  // Auto-read is enabled on new installs, but can be switched off by the reader.
  await expect(page.getByRole('button', { name: '줄이 나올 때 자동으로 읽기' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '줄이 나올 때 자동으로 읽기' }).click();
  await expect(page.getByRole('button', { name: '줄이 나올 때 자동으로 읽기' })).toHaveAttribute('aria-pressed', 'false');

  // 소리 버튼 3개: 이전 문장 / 현재 문장 다시 / 다음 문장. 지금 가리키는 줄이 강조된다
  const prev = page.getByRole('button', { name: '이전 문장 읽기' });
  const again = page.getByRole('button', { name: '현재 문장 다시 읽기' });
  const nextLine = page.getByRole('button', { name: '다음 문장 읽기' });
  await expect(page.locator('.story-line.story-active')).toHaveCount(1); // 처음엔 보이는 마지막 줄
  await expect(prev).toBeEnabled();
  await prev.click(); // 내레이션으로
  await expect(page.locator('.story-narration.story-active')).toHaveCount(1);
  await expect(prev).toBeDisabled(); // 맨 처음 줄
  await again.click();
  await expect(page.locator('.story-narration.story-active')).toHaveCount(1);
  await nextLine.click(); // 보이는 다음 줄
  await expect(page.locator('.story-line.story-active')).toHaveCount(1);
  await nextLine.click(); // 맨 끝에서 누르면 다음 줄을 펼치고 읽는다
  await expect(page.locator('.story-line')).toHaveCount(2);
  await expect(page.locator('.story-line').nth(1)).toHaveClass(/story-active/);
  await page.screenshot({ path: 'test-results/shots/45-read-player.png' });

  // 단어 누르기: 덱 밖 단어 → 생성할 때 받은 뜻 + 덱에 추가
  // 단어 하나씩: 의미 단위가 남은 줄도 묶지 않는다. 누르면 그 단어 뜻만 말풍선으로, 다시 누르면 닫힌다
  const first = page.locator('.story-line').first();
  await expect(first.getByRole('button', { name: 'mau makan', exact: true })).toHaveCount(0);
  await first.getByRole('button', { name: 'makan', exact: true }).click();
  await expect(page.getByRole('tooltip')).toHaveText(/먹다/);
  await expect(page.getByRole('tooltip')).not.toContainText('먹고 싶다');
  await page.screenshot({ path: 'test-results/shots/48-read-word-tip.png' });
  await first.getByRole('button', { name: 'makan', exact: true }).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  // 문장을 길게 누르면 전체 뜻
  const p1 = page.locator('.story-line').first().locator('.story-p');
  await p1.dispatchEvent('pointerdown', { clientX: 10, clientY: 10 });
  await page.waitForTimeout(600);
  await p1.dispatchEvent('pointerup');
  await expect(page.getByRole('button', { name: '전체 뜻 닫기' })).toHaveText('번역 1');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '전체 뜻 닫기' }).click();
  await expect(page.getByRole('button', { name: '전체 뜻 닫기' })).toHaveCount(0);

  // 말풍선 → 자세히 보기(덱에 추가 등)
  await page.locator('.story-narration').getByRole('button', { name: 'bakso' }).click();
  await expect(page.getByRole('tooltip')).toContainText('바소 (미트볼 수프)');
  await page.getByRole('button', { name: 'bakso 자세히 보기' }).click();
  const sheet = page.getByRole('dialog', { name: 'bakso 뜻' });
  await expect(sheet).toContainText('바소 (미트볼 수프)');
  await expect(sheet.locator('.story-sheet-meaning')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '읽기 계속하기' })).toBeVisible();
  await expect(sheet).toContainText('meatball soup');
  await expect(sheet).toContainText('이야기 속 문장');
  await page.screenshot({ path: 'test-results/shots/41-read-word.png' });
  await sheet.getByRole('button', { name: '내 덱에 추가' }).click();
  await expect(page.getByText('덱에 넣었어요. 새 카드로 나와요')).toBeVisible();
  await expect(sheet.getByText('덱에 있어요 · 아직 안 배움')).toBeVisible();
  await sheet.getByRole('button', { name: '읽기 계속하기' }).click();
  // 덱에 있는 단어 → 덱의 뜻
  await page.locator('.story-narration').getByRole('button', { name: 'aku', exact: true }).click();
  await expect(page.getByRole('tooltip')).toContainText('나');
  await page.getByRole('button', { name: 'aku 자세히 보기' }).click();
  await expect(page.getByRole('dialog', { name: 'aku 뜻' })).toContainText('나');
  await page.getByRole('dialog', { name: 'aku 뜻' }).getByRole('button', { name: '읽기 계속하기' }).click();

  // 질문이 나오면 답하기 전에는 다음으로 못 간다
  await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  await expect(page.getByText('부디는 무엇을 먹고 싶어 하나요?')).toBeVisible();
  await expect(page.getByText('답을 골라 주세요')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 문장 읽기' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '계속', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/shots/42-read-question.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/44-read-question-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: '사테' }).click();
  await expect(page.getByText('아쉬워요')).toBeVisible();
  await expect(page.getByText(/정답: 바소/)).toBeVisible();

  // 중간에 닫았다 다시 열면 이어서 (AI를 다시 부르지 않는다)
  await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  await page.getByRole('button', { name: '이야기 닫기' }).click();
  await expect(page.locator('.story-item .chip', { hasText: '31%' })).toBeVisible(); // 5/16 블록
  await page.locator('.story-row', { hasText: 'Bakso Malam' }).click();
  await expect(page.locator('.story-line')).toHaveCount(3);
  expect(calls.story).toBe(1);

  // 끝까지: 맞다/틀리다, 짝 맞추기
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  await page.getByRole('button', { name: '맞아요' }).click();
  await expect(page.getByText('맞았어요!')).toBeVisible();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  for (const [id, ko] of [['makan', '먹다'], ['minum', '마시다'], ['pulang', '집에 가다']]) {
    await page.locator('.story-match').getByRole('button', { name: id, exact: true }).click();
    await page.locator('.story-match').getByRole('button', { name: ko, exact: true }).click();
  }
  await expect(page.getByText('맞았어요!')).toBeVisible();
  await page.getByRole('button', { name: '다 읽었어요' }).click();
  await expect(page.getByText('질문 3개 중 2개 맞힘')).toBeVisible();
  await expect(page.getByText('이 이야기의 새 단어')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/43-read-result.png' });
  await page.getByRole('button', { name: '이야기 다시 듣기' }).click();
  await expect(page.getByText('듣기 복습 · 문제 없이 다시 듣기')).toBeVisible();
  await expect(page.locator('.story-listening-line')).toHaveCount(13);
  await expect(page.getByRole('button', { name: '전체 다시 듣기' })).toBeVisible();
  await expect(page.getByText(/저장된 AI 음성만 재사용해요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '1번째 문장 다시 듣기', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/47-story-relisten.png' });
  await page.getByRole('button', { name: '결과로' }).click();
  await expect(page.getByText('질문 3개 중 2개 맞힘')).toBeVisible();
  await page.getByRole('button', { name: '이야기 다시 듣기' }).click();
  await expect(page.locator('.story-listening-line')).toHaveCount(13);
  await page.getByRole('button', { name: '결과로' }).click();
  await page.getByRole('button', { name: '목록으로' }).click();
  await expect(page.locator('.chip', { hasText: '다 읽음' })).toBeVisible();

  // 읽기는 복습이 아니다: 복습 기록이 생기지 않는다
  const logs = await page.evaluate(
    () => new Promise<number>((r) => { const o = indexedDB.open('flashcards'); o.onsuccess = () => { const q = o.result.transaction('reviewLogs').objectStore('reviewLogs').count(); q.onsuccess = () => r(q.result); }; }),
  );
  expect(logs).toBe(0);

  // 지우기
  // 줄마다 버튼을 늘어놓지 않고 ⋯ 메뉴 하나에 모은다
  await page.getByRole('button', { name: 'Bakso Malam 메뉴' }).click();
  const menu = page.getByRole('dialog', { name: 'Bakso Malam 메뉴' });
  await expect(menu.getByRole('button', { name: '처음부터 다시 읽기' })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/52-read-menu.png' });
  await menu.getByRole('button', { name: '지우기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '지우기' }).click();
  await expect(page.getByText(/^만든 이야기/)).toHaveCount(0);
});

test('읽기: Gemini 키가 없으면 연결하라고 안내한다', async ({ page }) => {
  await page.goto('/#/read');
  await expect(page.getByText('설정에서 무료 Gemini 키를 먼저 연결해 주세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '이야기 만들기' })).toHaveCount(0);
});

test('읽기: 이야기를 만드는 동안 다른 화면(복습)으로 가도 멈추지 않고, 끝나면 알림만 뜬다', async ({ page }) => {
  const calls = { story: 0, prompts: [] as string[] };
  await mockGemini(page, calls, 2500); // 2.5초 걸리는 Gemini
  await page.goto('/#/settings/voice');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();

  await page.goto('/#/read');
  await page.getByRole('button', { name: '이야기 만들기' }).click();
  await expect(page.getByText('이야기를 쓰는 중…')).toBeVisible();
  await expect(page.getByText(/다른 화면으로 가도 뒤에서 계속 만들어요/)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '이야기 만드는 중' }).first()).toBeVisible(); // 진행 막대
  await page.screenshot({ path: 'test-results/shots/45-read-progress.png' });

  // 바로 복습하러 간다: 화면이 멈추지 않고 복습할 수 있다
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '오늘' }).click();
  await expect(page.getByRole('navigation', { name: '메인 메뉴' }).locator('.tab-spin')).toBeVisible(); // 읽기 탭에 만드는 중 표시
  await expect(page.locator('.job-top')).toBeVisible(); // 어느 화면에서든 맨 위의 얇은 막대
  await page.screenshot({ path: 'test-results/shots/46-job-top-bar.png' });
  await page.locator('.deck-row').first().click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.getByRole('button', { name: /알았음/ }).click();
  await expect(page.getByText('kamu', { exact: true })).toBeVisible(); // 복습이 계속 된다

  // 만들어지면 알림만 뜨고, 복습 화면에 그대로 있다
  await expect(page.getByText(/이야기 「Bakso Malam」가 완성됐어요/)).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('kamu', { exact: true })).toBeVisible();
  expect(page.url()).toContain('#/review');
  expect(calls.story).toBe(1);

  // 복습을 닫고 읽기 탭에 가면 목록에 있고, 알림 점은 사라진다
  await page.getByRole('button', { name: '복습 닫기' }).click();
  await expect(page.getByRole('navigation', { name: '메인 메뉴' }).locator('.tab-dot')).toBeVisible();
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '읽기' }).click();
  await expect(page.locator('.story-row', { hasText: 'Bakso Malam' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '메인 메뉴' }).locator('.tab-dot')).toHaveCount(0);
});

test('읽기 · 듣고 읽기: 새 문장은 글자를 가리고, 눌러서 보거나 다음 줄로 넘어가면 보이며, 질문은 답할 때까지 앞 줄도 가린다', async ({ page }) => {
  await mockGemini(page, { story: 0, prompts: [] });
  await page.goto('/#/settings/voice');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '읽기' }).click();
  await page.getByRole('button', { name: '이야기 만들기' }).click();
  await page.locator('.story-row', { hasText: 'Bakso Malam' }).click();
  await expect(page.getByRole('heading', { name: 'Bakso Malam' })).toBeVisible();

  const listen = page.getByRole('button', { name: '듣고 읽기 (글자 가리기)' });
  await expect(listen).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.story-hidden')).toHaveCount(0);
  await listen.click();
  await expect(listen).toHaveAttribute('aria-pressed', 'true');
  // 지금 줄(내레이션)이 가려지고, 단어 버튼이 없다
  await expect(page.locator('.story-narration .story-hidden')).toHaveCount(1);
  await expect(page.locator('.story-narration').getByRole('button', { name: 'bakso' })).toHaveCount(0);
  await expect(page.getByText(/듣고 읽기 · 먼저 듣고/)).toBeVisible();

  // 다음 줄: 새 줄은 가리고 앞 줄은 보인다
  await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  await expect(page.locator('.story-line').first().locator('.story-hidden')).toHaveCount(1);
  await expect(page.locator('.story-narration .story-hidden')).toHaveCount(0);
  await expect(page.locator('.story-narration').getByRole('button', { name: 'bakso' })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/66-read-listen-first.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/67-read-listen-first-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  // 눌러서 글자 보기
  await page.locator('.story-line').first().getByRole('button', { name: '글자 보기' }).click();
  await expect(page.locator('.story-line').first().locator('.story-hidden')).toHaveCount(0);
  await expect(page.locator('.story-line').first().getByRole('button', { name: 'makan', exact: true })).toBeVisible();

  // 질문이 나오면 바로 앞 줄은 답할 때까지 가린 채로
  await page.getByRole('button', { name: '다음 문장 읽기' }).click(); // line(2)
  await expect(page.locator('.story-line').nth(1).locator('.story-hidden')).toHaveCount(1);
  await page.getByRole('button', { name: '다음 문장 읽기' }).click(); // 질문
  await expect(page.getByText('부디는 무엇을 먹고 싶어 하나요?')).toBeVisible();
  await expect(page.locator('.story-line').nth(1).locator('.story-hidden')).toHaveCount(1);
  await page.getByRole('button', { name: '바소' }).click();
  await expect(page.locator('.story-line').nth(1).locator('.story-hidden')).toHaveCount(0);

  // 끄면 모두 보인다
  await listen.click();
  await expect(page.locator('.story-hidden')).toHaveCount(0);
});

test('읽기 · 받아쓰기: 빈칸 또는 문장 전체를 받아쓰고 확인해야 다음으로, 놓친 단어를 표시한다', async ({ page }) => {
  await mockGemini(page, { story: 0, prompts: [] });
  await page.goto('/#/settings/voice');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '읽기' }).click();
  await page.getByRole('button', { name: '이야기 만들기' }).click();
  await page.locator('.story-row', { hasText: 'Bakso Malam' }).click();
  await expect(page.getByRole('heading', { name: 'Bakso Malam' })).toBeVisible();

  const dict = page.getByRole('button', { name: '받아쓰기' });
  await dict.click();
  await expect(dict).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('받아쓰기 · 듣고 쓴 뒤 확인을 눌러요')).toBeVisible();
  // 빈칸 (긴 문장이라 2개). 확인하기 전에는 다음으로 못 간다
  await expect(page.getByRole('textbox', { name: /^빈칸/ })).toHaveCount(2);
  await expect(page.getByText('받아쓰고 확인을 눌러 주세요')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 문장 읽기' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/shots/69-dictation-blank.png' });
  // 키보드가 올라온 것처럼 화면을 줄이고 빈칸을 누르면: 재생 버튼이 숨고, 문장·확인 버튼이 보이는 곳으로 올라온다
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 360 });
  await page.getByRole('textbox', { name: '빈칸 1' }).click();
  await expect(page.locator('.story-player')).toBeHidden();
  await expect.poll(async () => (await page.getByRole('button', { name: '확인' }).boundingBox())!.y + 40).toBeLessThan(360);
  await expect.poll(async () => (await page.locator('.dict-sentence').boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: 'test-results/shots/72-dictation-keyboard.png' });
  await page.setViewportSize(size);
  await page.getByRole('textbox', { name: '빈칸 1' }).fill('zzz');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.locator('.dict-result')).toContainText('(쓴 것: zzz)');
  await expect(page.locator('.dict-result')).toContainText('(안 씀)');
  await expect(page.getByRole('textbox', { name: /^빈칸/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다음 문장 읽기' })).toBeEnabled();

  // 문장 전체: 다 맞게 쓰면 "다 맞았어요", 일부만 쓰면 놓친 단어 표시
  await page.getByRole('group', { name: '받아쓰기 방식' }).getByRole('button', { name: '문장 전체' }).click();
  await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  const full = page.getByRole('textbox', { name: '들은 문장 쓰기' });
  await expect(full).toBeVisible();
  await expect(full).toHaveAttribute('autocorrect', 'off');
  await full.fill('Aku kamu mau makan minum pulang gak udah lagi sini');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.getByText('받아쓰기 ✓ 다 맞았어요')).toBeVisible();
  await page.getByRole('button', { name: '다음 문장 읽기' }).click();
  await page.getByRole('textbox', { name: '들은 문장 쓰기' }).fill('aku kamu');
  await page.getByRole('textbox', { name: '들은 문장 쓰기' }).press('Enter');
  await expect(page.locator('.dict-result').last().locator('.dict-miss').first()).toHaveText(/mau/);
  await page.screenshot({ path: 'test-results/shots/70-dictation-full.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/shots/71-dictation-full-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });

  // 끄면 바로 다음으로 갈 수 있다
  await dict.click();
  await expect(page.getByRole('group', { name: '받아쓰기 방식' })).toHaveCount(0);

  // 끝 화면: 받아쓰기에서 놓친 단어를 모아 보여 주고, 누르면 단어 창
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          const tx = open.result.transaction('storyProgress', 'readwrite');
          const store = tx.objectStore('storyProgress');
          store.getAll().onsuccess = (e) => {
            for (const p of (e.target as IDBRequest).result) store.put({ ...p, completedAt: Date.now() });
          };
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(page.getByText(/받아쓰기에서 놓친 단어 \d+개/)).toBeVisible();
  await page.getByRole('button', { name: 'pulang 자세히 보기' }).click();
  await expect(page.getByRole('dialog', { name: 'pulang 뜻' })).toBeVisible();
});

test('읽기 · 음성: 음성 만들기가 중간에 멈춘 이야기는 준비된 문장 수와 "나머지 한 번에 만들기" 버튼을 보여 주고, 누르면 뒤에서 다 만든다', async ({ page }) => {
  let ttsDown = true;
  await page.context().route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest' }, { name: 'models/gemini-3.8-flash-tts' }] } });
    if (url.endsWith('/interactions')) {
      if (ttsDown) return route.fulfill({ status: 500, json: { error: { message: 'internal' } } });
      return route.fulfill({ json: { steps: [{ type: 'model_output', content: [{ type: 'audio', data: btoa('RIFF' + '\\0'.repeat(4) + 'WAVE'), mime_type: 'audio/wav' }] }] } });
    }
    const body = { candidates: [{ content: { parts: [{ text: formatStoryText(STORY) }] } }] };
    if (url.includes(':streamGenerateContent')) return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(body)}\r\n\r\n` });
    return route.fulfill({ json: body });
  });
  await page.goto('/#/settings/voice');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  await page.goto('/#/read');
  await page.getByRole('button', { name: '이야기 만들기' }).click();
  await page.getByText(/이야기 「Bakso Malam」가 완성됐어요/).click();

  // 음성 서버가 안 돼서 하나도 못 만들었다
  await expect(page.getByText('AI 음성 0/13문장 준비됨')).toBeVisible();
  const make = page.getByRole('button', { name: '나머지 한 번에 만들기' });
  await expect(make).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/49-read-audio-bar.png' });

  // 기기 음성으로 읽기를 켜면 AI 음성 막대와 Gemini 목소리 설정이 사라지고, 속도는 그대로 고를 수 있다
  await page.getByRole('button', { name: '음성 속도와 목소리 설정' }).click();
  const sheet = page.getByRole('dialog', { name: '이야기 음성 설정' });
  await sheet.getByRole('switch', { name: '기기 음성으로 읽기' }).click();
  await expect(sheet.getByText('역할별 목소리')).toHaveCount(0);
  await expect(sheet.getByRole('slider', { name: '이야기 읽기 속도' })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/49b-read-device-voice.png' });
  await sheet.getByRole('button', { name: '완료' }).click();
  await expect(page.locator('.story-audio-bar')).toHaveCount(0);
  await page.getByRole('button', { name: '음성 속도와 목소리 설정' }).click();
  await sheet.getByRole('switch', { name: '기기 음성으로 읽기' }).click();
  await sheet.getByRole('button', { name: '완료' }).click();
  await expect(make).toBeVisible();

  // 서버가 돌아온 뒤 누르면 다 만들고 막대는 사라진다
  ttsDown = false;
  await make.click();
  await expect(page.locator('.story-audio-bar')).toHaveCount(0, { timeout: 15000 });
});

test('읽기 · 백그라운드: 이야기는 서비스 워커가 만들어서, 만드는 중에 앱 화면을 닫아도 끝까지 만들어 저장한다', async ({ page, context }) => {
  const calls = { story: 0, prompts: [] as string[] };
  await mockGemini(page, calls, 3000); // 3초 걸리는 Gemini
  await page.goto('/#/settings/voice');
  await page.getByLabel('Gemini API 키').fill('FAKE-KEY');
  await page.getByRole('button', { name: '연결' }).click();
  await expect(page.getByText('연결됨 · gemini-3.8-flash-tts')).toBeVisible();
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByText('단어 1000개를 넣었어요')).toBeVisible();
  await page.goto('/#/read');
  // 서비스 워커가 이 화면을 맡을 때까지
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  await page.getByRole('button', { name: '이야기 만들기' }).click();
  await expect(page.getByText('이야기를 쓰는 중…')).toBeVisible();
  await page.close(); // 화면이 없어져도

  const again = await context.newPage();
  await again.goto('/#/read');
  await expect(again.locator('.story-row', { hasText: 'Bakso Malam' })).toBeVisible({ timeout: 15000 });
  expect(calls.story).toBe(1);
  // 음성도 서비스 워커가 이어서 만들었다
  await again.locator('.story-row', { hasText: 'Bakso Malam' }).click();
  await expect(again.getByText('Bakso Malam').first()).toBeVisible();
  await expect(again.locator('.story-audio-bar')).toHaveCount(0, { timeout: 15000 });
});
