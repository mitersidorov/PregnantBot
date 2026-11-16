import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const wifeId = 111111111;
const testBotToken = '123456789:test-token-for-local-e2e-only';

function signedInitData(userId: number): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `ui-e2e-${userId}-${Date.now()}`,
    user: JSON.stringify({ id: userId, first_name: 'Synthetic', last_name: 'Browser' }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(testBotToken).digest();
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

function syntheticPdf(): Buffer {
  const text = [
    'BT',
    '/F1 12 Tf',
    '50 750 Td',
    '(COMPLETE BLOOD COUNT) Tj',
    '0 -18 Td',
    '(Result date: 2026-11-14) Tj',
    '0 -18 Td',
    '(Hemoglobin: 132 g/L; Leukocytes: 5.4; Platelets: 240) Tj',
    '0 -18 Td',
    '(Synthetic data for local software test only) Tj',
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

test('real browser flow: cycle, live upload proposal, explicit checklist confirmation and file download', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const initData = signedInitData(wifeId);
  await page.addInitScript(
    `window.Telegram = ${JSON.stringify({
      WebApp: { initData, initDataUnsafe: { user: { id: wifeId, first_name: 'Synthetic' } } },
    })};`,
  );
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.abort());

  const cycleListPromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/cycles') && response.request().method() === 'GET',
  );
  await page.goto('/');
  const injectedInitDataLength = await page.evaluate(
    () => window.Telegram?.WebApp?.initData?.length ?? 0,
  );
  expect(
    injectedInitDataLength,
    'synthetic Telegram initData is available in the browser',
  ).toBeGreaterThan(0);
  const cycleListResponse = await cycleListPromise;
  const cycleHeaders = await cycleListResponse.request().allHeaders();
  expect(Boolean(cycleHeaders['x-telegram-init-data']), 'Telegram initData forwarded').toBe(true);
  expect(Boolean(cycleHeaders['x-api-key']), 'API key must stay out of the browser').toBe(false);
  expect(cycleListResponse.status(), 'cycle list status').toBe(200);
  const existingCycles = (await cycleListResponse.json()) as {
    id: string;
    status: string;
  }[];
  const activeCycle = existingCycles.find((cycle) => cycle.status === 'active');
  if (!activeCycle) {
    const cycleResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/cycles') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Начать подготовку' }).click();
    const cycleResponse = await cycleResponsePromise;
    expect(cycleResponse.status(), 'cycle create status').toBe(201);
  }

  await page.goto('/');
  const filename = `synthetic-cbc-${Date.now()}.pdf`;
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/records/uploads') && response.request().method() === 'POST',
  );
  await page.locator('#file').setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: syntheticPdf(),
  });
  await uploadResponsePromise;
  const uploadReview = page.locator('.upload-review');
  await expect(uploadReview.getByRole('button', { name: 'Подтвердить' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(uploadReview.locator('.proposal-result')).toContainText('Общий анализ крови');
  const confirmButton = uploadReview.getByRole('button', { name: 'Подтвердить' });
  await uploadReview.getByLabel('Общий анализ крови').check();
  await confirmButton.click();
  await expect(page.locator('.toast-success')).toContainText('Анализ подтверждён.');
  const linkedHistory = await page.evaluate(async (telegramInitData) => {
    const response = await fetch('/api/records', {
      headers: { 'X-Telegram-Init-Data': telegramInitData },
    });
    return response.json();
  }, initData);
  const confirmedFile = linkedHistory.find(
    (file: { originalName: string }) => file.originalName === filename,
  );
  expect(
    confirmedFile?.results?.some(
      (result: { interpretationStatus: string; requirements?: { id?: string }[] }) =>
        result.interpretationStatus === 'confirmed' &&
        result.requirements?.some(
          (requirement) => requirement.id === '00000000-0000-4000-8000-000000000009',
        ),
    ),
  ).toBe(true);

  await page.goto('/records');
  await expect(
    page.getByRole('checkbox', { name: 'Есть результат: Общий анализ крови' }),
  ).toBeChecked();
  await page.getByRole('button', { name: /Общий анализ крови/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: `Скачать файл ${filename}` }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(filename);
  const downloadedBytes = await readFile(await download.path());
  expect(downloadedBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
