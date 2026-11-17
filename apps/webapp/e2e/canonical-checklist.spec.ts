import { expect, test } from '@playwright/test';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const names = [
  'Сифилис (anti-Treponema pallidum в крови)',
  'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
  'Гепатит B (поверхностный антиген HBsAg)',
  'Гепатит C (antiHCV, антитела в крови)',
  'ПЦР мазка из цервикального канала на Neisseria gon.',
  'ПЦР мазка из цервикального канала на Trichomonas vag.',
  'ПЦР мазка из цервикального канала на Chlamydia trach.',
  'Гинекологический мазок (анализ на флору)',
  'Общий анализ крови',
  'Скорость оседания эритроцитов (СОЭ)',
  'Общий анализ мочи',
  'Биохимический анализ крови (АЛТ)',
  'Биохимический анализ крови (АСТ)',
  'Биохимический анализ крови (общий билирубин)',
  'Биохимический анализ крови (глюкоза)',
  'Биохимический анализ крови (мочевина)',
  'Биохимический анализ крови (креатинин)',
  'Коагулограмма (АЧТВ)',
  'Коагулограмма (МНО)',
  'Коагулограмма (фибриноген)',
  'Антимюллеров гормон (АМГ)',
  'Тиреотропный гормон (ТТГ)',
  'Т4 свободный',
  'Группа крови, резус-фактор',
  'Цитологическое исследование соскоба с шейки матки и цервикального канала (Пап-тест)',
  'ЭКГ',
  'Заключение терапевта',
  'УЗИ молочных желез (до 40 лет)',
  'УЗИ органов малого таза',
  'УЗИ щитовидной железы',
  'Флюорография (по показаниям)',
  'Онколог-маммолог (по показаниям)',
  'Заключение генетика',
  'Сифилис (anti-Treponema pallidum в крови)',
  'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
  'Гепатит B (поверхностный антиген HBsAg)',
  'Гепатит C (antiHCV, антитела в крови)',
  'Спермограмма (2-4 дня воздержания)',
  'ПЦР (моча или эякулят) на Neisseria gon.',
  'ПЦР (моча или эякулят) на Trichomonas vag.',
  'ПЦР (моча или эякулят) на Chlamydia trach.',
  'Группа крови, резус-фактор',
  'Заключение андролога',
  'Коагулограмма (тромбиновое время)',
  'Коагулограмма (ПТИ)',
];
test('renders the API checklist by role and preserves IDs in assignment confirmation', async ({
  page,
}) => {
  let confirmed: string[] = [];
  let assigned = false;
  let interpretationCalls = 0;
  let confirmCalls = 0;
  let releaseFirstInterpretation!: () => void;
  const firstInterpretationGate = new Promise<void>((resolve) => {
    releaseFirstInterpretation = resolve;
  });
  let releaseRetryInterpretation!: () => void;
  const retryInterpretationGate = new Promise<void>((resolve) => {
    releaseRetryInterpretation = resolve;
  });
  const checklist = names.map((_, i) => ({
    requirementId: id(i + 1),
    status: 'pending',
    requirement: {
      id: id(i + 1),
      name: `Seed label ${i + 1}`,
      patientApplicability: i < 33 || i >= 43 ? 'wife' : 'husband',
      validityDays: i === 26 ? 365 : i === 8 ? 180 : 30,
      validityDays: i === 26 ? 365 : i === 8 ? 180 : 30,
      ...(i === 37 ? { description: 'After 2 days of abstinence.' } : {}),
    },
  }));
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'wife', telegramUserId: '123169226' } });
    if (u.pathname.endsWith('/cycles') && req.method() === 'GET')
      return route.fulfill({
        json: [{ id: 'cycle-x', startDate: '2026-11-15', status: 'active' }],
      });
    if (u.pathname.endsWith('/cycles/cycle-x') && req.method() === 'GET')
      return route.fulfill({ json: { id: 'cycle-x', checklist } });
    if (u.pathname.endsWith('/records') && req.method() === 'GET')
      return route.fulfill({
        json: [
          {
            id: 'f',
            originalName: 'source.pdf',
            uploadedBy: '123169226',
            uploadedAt: '2026-11-15',
            results: [
              {
                id: 'r',
                versionNumber: 1,
                testName: 'ALT',
                resultDate: '2026-11-15',
                interpretationStatus: assigned ? 'confirmed' : 'pending',
                requirements: assigned ? [{ id: id(12) }] : [],
              },
            ],
          },
        ],
      });
    if (u.pathname.endsWith('/confirm')) {
      confirmCalls += 1;
      confirmed = req.postDataJSON().requirementIds;
      assigned = true;
      return route.fulfill({ json: { id: 'r' } });
    }
    if (u.pathname.endsWith('/interpret')) {
      interpretationCalls += 1;
      if (interpretationCalls === 1) {
        await firstInterpretationGate;
        return route.fulfill({ status: 503, json: { message: 'temporary error' } });
      }
      await retryInterpretationGate;
      return route.fulfill({
        status: 201,
        json: {
          id: 'r-proposal',
          versionNumber: 2,
          testName: 'ALT',
          resultDate: '2026-11-14',
          summary: 'Synthetic OpenAI interpretation',
          interpretationStatus: 'proposed',
          matchedFindings: [
            {
              testName: names[11],
              resultDate: '2026-11-14',
              summary: 'Synthetic OpenAI interpretation',
              pageNumber: 1,
              findingIndex: 0,
              requirementIds: [id(12)],
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = { WebApp: { initData: 'synthetic' } };
  });
  await page.goto('/cycles/cycle-x');
  const checklistTitles = page.locator('.analysis-checklist .analysis-title');
  await expect(checklistTitles).toHaveCount(35);
  await expect(checklistTitles.nth(0)).toContainText('Заключение терапевта');
  await expect(checklistTitles.nth(1)).toContainText('Общий анализ крови');
  await expect(checklistTitles.nth(2)).toContainText('Сифилис');
  await expect(checklistTitles.nth(0)).toContainText('Годен: 1 год');
  await expect(checklistTitles.nth(0)).toContainText('Заключение терапевта');
  await expect(checklistTitles.nth(1)).toContainText('Общий анализ крови');
  await expect(checklistTitles.nth(2)).toContainText('Сифилис');
  await expect(checklistTitles.nth(0)).toContainText('Годен: 1 год');
  for (const name of [...names.slice(0, 33), ...names.slice(43)])
    await expect(page.getByRole('button', { name })).toBeVisible();
  await page
    .getByRole('group', { name: 'Чьи анализы показывать' })
    .getByRole('button', { name: 'Анализы партнёра' })
    .click();
  await expect(checklistTitles).toHaveCount(10);
  for (const name of names.slice(33, 43))
    await expect(page.getByRole('button', { name })).toBeVisible();
  await expect(page.getByRole('button', { name: names[5] })).toHaveCount(0);
  await page.goto('/records');
  await expect(page.locator('#file')).toHaveCount(0);
  const unmatched = page.locator('.unmatched-file');
  await expect(unmatched).toHaveCount(1);
  await expect(unmatched.getByRole('link', { name: 'Скачать файл source.pdf' })).toBeVisible();
  await expect(unmatched.locator('button, a')).toHaveCount(2);
  const interpretRequest = page.waitForRequest((request) => request.url().includes('/interpret'));
  await unmatched.getByRole('button', { name: 'Назначить' }).click();
  const assignment = page.getByRole('dialog');
  await expect(assignment.getByRole('status')).toContainText('Обработка анализа');
  await interpretRequest;
  expect(interpretationCalls).toBe(1);
  releaseFirstInterpretation();
  await expect(page.locator('.toast-error')).toBeVisible();
  expect(confirmCalls).toBe(0);
  const retryRequest = page.waitForRequest((request) => request.url().includes('/interpret'));
  await assignment.getByRole('button', { name: 'Повторить обработку' }).click();
  await expect(assignment.getByRole('status')).toContainText('Обработка анализа');
  await retryRequest;
  releaseRetryInterpretation();
  await expect(assignment.locator('.assignment-result')).toContainText(
    'Synthetic OpenAI interpretation',
  );
  await expect(assignment.locator('.assignment-result')).toContainText(names[11]);
  await expect(assignment.locator('.assignment-result')).toContainText('14.11.2026');
  expect(confirmCalls).toBe(0);
  await assignment.getByRole('button', { name: /Биохимический анализ крови \(АЛТ\)/ }).click();
  expect(confirmCalls).toBe(0);
  await assignment.getByRole('button', { name: 'Назначить' }).click();
  await expect.poll(() => confirmed).toEqual([id(12)]);
  await expect(page.locator('.unmatched-file')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: `Есть результат: ${names[11]}` })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: `Есть результат: ${names[11]}` })).toBeChecked();
  await page.getByRole('button', { name: /Биохимический анализ крови \(АЛТ\)/ }).click();
  await expect(page.locator('.analysis-checklist li.linked-result')).toContainText('source.pdf');
});

test('shows every linked file with submission date, owner and validity under its checklist item', async ({
  page,
}) => {
  const requirementId = id(12);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'wife', telegramUserId: '123169226' } });
    if (url.pathname.endsWith('/cycles') && request.method() === 'GET')
      return route.fulfill({
        json: [{ id: 'cycle-x', startDate: '2026-11-15', status: 'active' }],
      });
    if (url.pathname.endsWith('/cycles/cycle-x'))
      return route.fulfill({
        json: {
          id: 'cycle-x',
          checklist: [
            {
              requirementId,
              status: 'complete',
              resultId: 'r1',
              requirement: {
                id: requirementId,
                name: 'Биохимический анализ крови (АЛТ)',
                validityDays: 180,
              },
            },
          ],
        },
      });
    if (url.pathname.endsWith('/records') && request.method() === 'GET')
      return route.fulfill({
        json: [
          ...['first.pdf', 'second.pdf'].map((originalName, index) => ({
            id: `file-${index}`,
            originalName,
            uploadedBy: '123169226',
            uploadedAt: '2026-05-01',
            results: [
              {
                id: `r${index + 1}`,
                versionNumber: 1,
                testName: 'ALT',
                resultDate: '2026-05-01',
                interpretationStatus: 'confirmed',
                requirements: [{ id: requirementId }],
              },
            ],
          })),
        ],
      });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = { WebApp: { initData: '' } };
  });
  await page.goto('/records');
  await page.getByRole('button', { name: /Биохимический анализ крови \(АЛТ\)/ }).click();
  const linked = page.locator('.analysis-checklist li.linked-result');
  await expect(linked).toHaveCount(2);
  await expect(linked.nth(0)).toContainText('first.pdf');
  await expect(linked.nth(1)).toContainText('second.pdf');
  await expect(linked.first()).toContainText('ваш анализ');
  await expect(linked.first()).toContainText('годен до');
  await expect(linked.first()).toContainText('01.05.2026');
});
