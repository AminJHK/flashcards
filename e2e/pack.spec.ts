import { expect, test } from '@playwright/test';

test('준비된 덱(심장 병동 간호 중국어)을 넣고, 말하기·듣기 카드를 복습한다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^심장 병동 간호 중국어.* 추가하기$/ }).click();
  await expect(page.getByText(/문장 \d+개를 넣었어요/)).toBeVisible();
  await expect(page.getByLabel('덱 이름')).toHaveValue('심장 병동 간호 중국어');
  await expect(page.getByRole('button', { name: /단어 2\d\d개 보기/ })).toBeVisible();

  // 오늘의 새 카드 10개
  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 10')).toBeVisible();

  await page.locator('.deck-row').first().click();
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
  const panel = page.locator('.row', { hasText: '여행 스페인어' });
  await expect(panel).toContainText('단어 514개');
  await panel.getByRole('button', { name: /추가하기$/ }).click();
  await expect(page.getByText('단어 514개를 넣었어요')).toBeVisible();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');

  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 15')).toBeVisible();
  await page.locator('.deck-row').first().click();
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
  const panel = page.locator('.row', { hasText: '스페인어 불규칙 동사 변화' });
  await panel.getByRole('button', { name: /추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('스페인어 불규칙 동사');
  await page.getByRole('link', { name: '오늘' }).click();
  await expect(page.getByText('새 5')).toBeVisible();
  await page.locator('.deck-row').first().click();
  await expect(page.getByText('ser', { exact: true })).toBeVisible();
  await expect(page.getByText('presente', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  for (const t of ['yo soy', 'tú eres', 'él es', 'nosotros somos', 'vosotros sois', 'ellos son']) await expect(page.getByText(t, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/14-spanish-conj-back.png' });
});

test('추가 화면에서 카드 종류를 바꾸면 덱이 기억하고, 이미 있는 스페인어 단어의 언어 설정은 그대로 보인다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^여행 스페인어.* 추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  await expect(page.getByLabel('배우는 언어')).toHaveValue('es-ES');
  await expect(page.getByLabel('뜻 언어')).toHaveValue('en-US');

  // 덱 화면에는 카드 종류 고르기가 없다 (추가 화면과 중복)
  await expect(page.getByRole('group', { name: '카드 종류' })).toHaveCount(0);
  const deckUrl = page.url();
  // 추가 화면에서 듣기로 바꾸면 덱이 기억한다 (카드 종류 버튼은 잘리지 않는다)
  await page.goto('/#/add');
  const types = page.getByRole('group', { name: '카드 종류' }).getByRole('button');
  for (const b of await types.all()) expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('group', { name: '카드 종류' }).getByRole('button', { name: '듣기' }).click();
  await page.reload();
  await expect(page.getByRole('group', { name: '카드 종류' }).getByRole('button', { name: '듣기' })).toHaveAttribute('aria-pressed', 'true');
  // 이미 있는 단어 기준의 설명과 언어 설정은 그대로
  await page.goto(deckUrl);
  await expect(page.getByLabel('배우는 언어')).toHaveValue('es-ES');
  await expect(page.getByText('스페인어 단어 보고 영어 뜻 떠올리기', { exact: false })).toBeVisible();
  await expect(page.getByText('발음: 중국어(zh-CN)로 읽어요')).toHaveCount(0);
});

test('준비된 덱이 고쳐지면 덱 화면에서 받을 수 있고, 내가 고친 단어는 그대로 둔다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^여행 스페인어.* 추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  await expect(page.getByText('준비된 덱이 고쳐졌어요')).toHaveCount(0);

  // 예전 버전으로 넣은 것처럼 만든다: tener는 옛 뜻, la casa는 사용자가 직접 고친 단어
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          const tx = open.result.transaction('notes', 'readwrite');
          const store = tx.objectStore('notes');
          store.getAll().onsuccess = (e) => {
            for (const n of (e.target as IDBRequest).result) {
              if (n.fields.front === 'tener') store.put({ ...n, fields: { ...n.fields, back: 'to have' } });
              if (n.fields.front === 'la casa') store.put({ ...n, fields: { ...n.fields, back: 'my house' }, updatedAt: n.createdAt + 1 });
            }
          };
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(page.getByText('준비된 덱이 고쳐졌어요')).toBeVisible();
  await expect(page.getByText(/단어 1개에 새 내용/)).toBeVisible();
  await page.getByRole('button', { name: '고친 내용 받기' }).click();
  await expect(page.getByText('단어 1개를 고쳤어요')).toBeVisible();
  await expect(page.getByText('준비된 덱이 고쳐졌어요')).toHaveCount(0);

  await page.getByRole('button', { name: /단어 514개 보기/ }).click();
  await page.getByLabel('단어 찾기').fill('tener');
  await expect(page.getByText('to have (own, possess)')).toBeVisible();
  await page.getByLabel('단어 찾기').fill('la casa');
  await expect(page.getByText('my house')).toBeVisible();
});

test('인도네시아어 구어체 덱: 말하는 형태를 보고, 뒷면에서 표준형·어근·예문을 본다', async ({ page }) => {
  await page.goto('/#/decks/new');
  const panel = page.locator('.row', { hasText: '인도네시아어 구어체' });
  await expect(panel).toContainText('단어 1500개');
  await panel.getByRole('button', { name: /추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('인도네시아어 구어체');
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('aku', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await expect(page.getByText('Aku capek banget.')).toBeVisible();
  await expect(page.getByText('나 너무 피곤해.')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/22-indonesian-back.png' });
  await page.getByRole('button', { name: /알았음/ }).click();
  await expect(page.getByText('kamu', { exact: true })).toBeVisible();
  // 표준형·어근이 있는 동사: 단어 목록에서 찾아 확인
  await page.getByRole('button', { name: '복습 닫기' }).click();
  await expect(page.getByRole('heading', { name: '오늘' })).toBeVisible(); // 복습을 닫으면 메인 화면
  await page.goto('/#/decks');
  await page.getByRole('button', { name: /인도네시아어 구어체/ }).click();
  await page.getByRole('button', { name: /단어 1500개 보기/ }).click();
  await page.getByLabel('단어 찾기').fill('nyari');
  await page.getByRole('button', { name: /nyari/ }).click();
  await expect(page.getByLabel('표준형')).toHaveValue('mencari');
  await expect(page.getByLabel('어근')).toHaveValue('cari');
});

test('예전에 100장만 받은 인도네시아어 덱: 새 단어 1400개를 받으면 뒤에 이어서 들어가고, 복습 기록은 그대로다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('인도네시아어 구어체');
  // 첫 카드 하나 복습
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await page.getByRole('button', { name: '정답 보기', exact: true }).last().click();
  await page.getByRole('button', { name: /알았음/ }).click();
  await expect(page.getByText('kamu', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '복습 닫기' }).click();
  // 예전 버전처럼 앞의 100장만 남긴다 (DB에서 바로 지워서 "사용자가 지운 단어" 기록은 남기지 않는다)
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const open = indexedDB.open('flashcards');
        open.onsuccess = () => {
          const tx = open.result.transaction(['notes', 'cards'], 'readwrite');
          const notes = tx.objectStore('notes');
          notes.getAll().onsuccess = (e) => {
            const all = ((e.target as IDBRequest).result as { id: string; createdAt: number }[]).sort((a, b) => a.createdAt - b.createdAt);
            const drop = new Set(all.slice(100).map((n) => n.id));
            for (const id of drop) notes.delete(id);
            const cards = tx.objectStore('cards');
            cards.getAll().onsuccess = (ev) => {
              for (const c of (ev.target as IDBRequest).result as { id: string; noteId: string }[]) if (drop.has(c.noteId)) cards.delete(c.id);
            };
          };
          tx.oncomplete = () => done();
        };
      }),
  );
  await page.reload();
  // 새 덱 화면: 이미 추가한 덱은 아래에 한 줄로, 새 단어를 기존 덱에 넣을 수 있다고 알려 준다
  await page.goto('/#/decks/new');
  await expect(page.getByText('이미 추가한 준비된 덱')).toBeVisible();
  await expect(page.getByText('「인도네시아어 구어체」 덱에 새 단어 1400개를 넣을 수 있어요')).toBeVisible();
  await expect(page.getByRole('button', { name: /^인도네시아어 구어체.* 추가하기$/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/shots/24-installed-packs.png' });
  await page.goto('/#/decks');
  await page.getByRole('button', { name: /인도네시아어 구어체/ }).click();
  await expect(page.getByRole('button', { name: /단어 100개 보기/ })).toBeVisible();
  await expect(page.getByText('준비된 덱에 새 단어 1400개가 생겼어요')).toBeVisible();
  await page.getByRole('button', { name: '새 단어 받기' }).click();
  await expect(page.getByText('새 단어 1400개를 넣었어요')).toBeVisible();
  await expect(page.getByRole('button', { name: /단어 1500개 보기/ })).toBeVisible();
  await expect(page.getByText(/새 단어 \d+개가 생겼어요/)).toHaveCount(0);
  // 복습 기록은 그대로: 다음에 나오는 새 카드는 kamu (aku는 이미 복습함)
  await page.getByRole('button', { name: '이 덱 복습' }).click();
  await expect(page.getByText('kamu', { exact: true })).toBeVisible();
});

test('하루 새 카드: 숫자를 눌러 직접 입력할 수 있고, 범위 밖이면 맞춰지며, −/+도 그대로 된다', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.locator('.row', { hasText: '여행 스페인어' }).getByRole('button', { name: /추가하기$/ }).click();
  await expect(page.getByLabel('덱 이름')).toHaveValue('여행 스페인어');
  const input = page.getByRole('textbox', { name: '하루 새 카드' });
  await expect(input).toHaveValue('15');
  await input.fill('37');
  await input.press('Enter');
  await expect(input).toHaveValue('37');
  await page.screenshot({ path: 'test-results/shots/18-new-per-day-typed.png' });
  await page.reload();
  await expect(page.getByRole('textbox', { name: '하루 새 카드' })).toHaveValue('37');
  await page.getByRole('button', { name: '하루 새 카드 늘리기' }).click();
  await expect(page.getByRole('textbox', { name: '하루 새 카드' })).toHaveValue('42');
  await page.getByRole('textbox', { name: '하루 새 카드' }).fill('999');
  await page.getByRole('textbox', { name: '하루 새 카드' }).blur();
  await expect(page.getByRole('textbox', { name: '하루 새 카드' })).toHaveValue('200');
  // 확인(엔터)을 누르지 않고 바로 뒤로 가도 저장되고, 오늘 화면의 새 카드 수가 바뀐다 (사용자 보고 2026-10-23)
  await page.getByRole('textbox', { name: '하루 새 카드' }).fill('30');
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await expect(page.getByText('새 30')).toBeVisible();
});
