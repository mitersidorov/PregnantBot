import { expect, test } from '@playwright/test';

const spermogramId = '00000000-0000-4000-8000-000000000038';

test('start preparation, interpret a pending upload once, confirm it and browse analysis history', async ({
  page,
}) => {
  const file = {
    id: 'file-1',
    originalName: 'sample.pdf',
    uploadedBy: '123169226',
    uploadedAt: '2026-11-15',
  };
  const pending = {
    id: 'result-1',
    versionNumber: 1,
    interpretationStatus: 'pending',
  };
  let proposal:
    | {
        id: string;
        versionNumber: number;
        interpretationStatus: string;
        testName?: string;
        resultDate?: string;
        summary?: string;
        matchedFindings?: {
          testName: string;
          resultDate: string;
          summary: string;
          pageNumber: number;
          findingIndex: number;
          requirementIds: string[];
        }[];
        requirements?: { id: string }[];
        normality?: 'normal' | 'abnormal';
      }
    | undefined;
  let cycleStarted = false;
  let interpretCalls = 0;
  let confirmedRequirementIds: string[] = [];
  let confirmedNormality: string | undefined;
  let holdInterpret = false;
  let releaseInterpret!: () => void;
  const interpretationGate = new Promise<void>((resolve) => {
    releaseInterpret = resolve;
  });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'husband', telegramUserId: '123169226' } });
    if (url.pathname.endsWith('/cycles') && req.method() === 'GET')
      return route.fulfill({
        json: cycleStarted ? [{ id: 'cycle-1', startDate: '2026-11-15', status: 'active' }] : [],
      });
    if (url.pathname.endsWith('/cycles/cycle-1'))
      return route.fulfill({
        json: {
          id: 'cycle-1',
          checklist: [
            {
              requirementId: '00000000-0000-4000-8000-000000000001',
              status: 'pending',
              requirement: {
                id: '00000000-0000-4000-8000-000000000001',
                name: 'Сифилис (anti-Treponema pallidum в крови)',
                description: 'Запланируйте после окончания менструации.',
                cycleDayHint: 7,
                validityDays: 180,
                branchMetadata: {
                  cycleDayRange: [7, 11],
                  afterBleedingEnds: true,
                  onAbnormal: 'relevant_specialist',
                },
              },
            },
            {
              requirementId: '00000000-0000-4000-8000-000000000027',
              status: 'pending',
              requirement: {
                id: '00000000-0000-4000-8000-000000000027',
                name: 'Заключение терапевта',
                validityDays: 365,
                branchMetadata: {
                  assessContraindications: true,
                  rubellaIfPriorResultShowsAbsentAntibodies: {
                    vaccinationMayDelayTreatmentMonths: [1, 3],
                    informedRefusalPossible: true,
                  },
                },
              },
            },
            {
              requirementId: spermogramId,
              status: 'pending',
              requirement: {
                id: spermogramId,
                name: 'Спермограмма (2-4 дня воздержания)',
                description: 'Подготовка: 2-4 дня воздержания.',
                validityDays: 180,
                patientApplicability: 'husband',
                branchMetadata: {
                  validityAppliesOnlyIfNoAbnormalities: true,
                  onAbnormal: 'andrologist_review',
                },
              },
            },
          ],
        },
      });
    if (url.pathname.endsWith('/cycles') && req.method() === 'POST') {
      cycleStarted = true;
      return route.fulfill({
        status: 201,
        json: { id: 'cycle-1', startDate: '2026-11-15', status: 'active' },
      });
    }
    if (url.pathname.endsWith('/records') && req.method() === 'GET')
      return route.fulfill({
        json: proposal
          ? [
              {
                ...file,
                results: [
                  {
                    ...proposal,
                    ...(proposal.interpretationStatus === 'confirmed'
                      ? { requirements: [{ id: spermogramId }] }
                      : {}),
                  },
                ],
              },
            ]
          : [],
      });
    if (url.pathname.endsWith('/records/uploads'))
      return route.fulfill({ status: 201, json: { file, result: pending } });
    if (url.pathname.endsWith('/interpret')) {
      interpretCalls += 1;
      if (holdInterpret) await interpretationGate;
      proposal = {
        id: 'proposal-1',
        versionNumber: 2,
        testName: 'Spermogram',
        resultDate: '2026-11-10',
        summary: 'Synthetic result',
        matchedFindings: [
          {
            testName: 'Спермограмма (2-4 дня воздержания)',
            resultDate: '2026-11-10',
            summary: 'Synthetic result',
            pageNumber: 1,
            findingIndex: 0,
            requirementIds: [spermogramId],
          },
        ],
        interpretationStatus: 'proposed',
      };
      return route.fulfill({ status: 201, json: proposal });
    }
    if (url.pathname.endsWith('/confirm')) {
      const body = req.postDataJSON();
      confirmedRequirementIds = body.requirementIds;
      confirmedNormality = body.normality;
      proposal = { ...proposal!, interpretationStatus: 'confirmed', normality: body.normality };
      return route.fulfill({ status: 200, json: proposal });
    }
    if (url.pathname.endsWith('/records/file-1/download'))
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF synthetic same-origin download'),
      });
    if (url.pathname.endsWith('/archive'))
      return route.fulfill({ status: 200, body: 'synthetic archive' });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: 'synthetic-signed-init-data',
        initDataUnsafe: { user: { id: 123169226 } },
      },
    };
  });

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Начать подготовку к стимуляции' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать подготовку' }).click();
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Загрузить анализ' })).toBeVisible();

  await page.goto('/cycles/cycle-1');
  await expect(page.getByRole('heading', { name: 'Все анализы' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Спермограмма (2-4 дня воздержания)' }),
  ).toBeVisible();

  await page.goto('/');
  holdInterpret = true;
  const interpretRequest = page.waitForRequest((request) => request.url().includes('/interpret'));
  await page.locator('#file').setInputFiles({
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF synthetic'),
  });
  await expect(page.getByRole('status')).toContainText('Обработка анализа');
  await interpretRequest;
  await expect.poll(() => interpretCalls).toBe(1);
  releaseInterpret();
  await expect(page.locator('.upload-review')).toBeVisible();
  await expect(
    page
      .locator('.proposal-result')
      .getByText('Спермограмма (2-4 дня воздержания)', { exact: true })
      .first(),
  ).toBeVisible();
  expect(interpretCalls).toBe(1);
  await page.getByLabel('Норма', { exact: true }).check();
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Анализ подтверждён.')).toBeVisible();
  expect(confirmedRequirementIds).toEqual([spermogramId]);
  expect(confirmedNormality).toBe('normal');

  await page.goto('/records');
  const ownerTabs = page.getByRole('group', { name: 'Чьи анализы показывать' });
  await expect(ownerTabs.getByRole('button', { name: 'Мои анализы' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await ownerTabs.getByRole('button', { name: 'Анализы партнёра' }).click();
  await expect(page.locator('.analysis-checklist .linked-result')).toHaveCount(0);
  await ownerTabs.getByRole('button', { name: 'Мои анализы' }).click();
  await page.getByRole('button', { name: /Спермограмма \(2-4 дня воздержания\)/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Скачать файл sample.pdf' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('sample.pdf');

  await page.getByRole('button', { name: 'Выбрать подготовку' }).click();
  const attemptDialog = page.getByRole('dialog');
  await expect(attemptDialog.getByRole('heading', { name: 'Выбрать подготовку' })).toBeVisible();
  await expect(attemptDialog.getByRole('button', { name: '15.11.2026' })).toBeVisible();
  await attemptDialog.getByRole('button', { name: 'Закрыть' }).click();
});

test('does not interpret an upload that already contains an OpenAI proposal', async ({ page }) => {
  const requirementId = '00000000-0000-4000-8000-000000000012';
  let interpretationCalls = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'wife', telegramUserId: '123169226' } });
    if (url.pathname.endsWith('/cycles') && request.method() === 'GET')
      return route.fulfill({
        json: [{ id: 'cycle-a', startDate: '2026-11-15', status: 'active' }],
      });
    if (url.pathname.endsWith('/cycles/cycle-a'))
      return route.fulfill({
        json: {
          id: 'cycle-a',
          checklist: [
            {
              requirementId,
              status: 'pending',
              requirement: { id: requirementId, name: 'Биохимический анализ крови (АЛТ)' },
            },
          ],
        },
      });
    if (url.pathname.endsWith('/records') && request.method() === 'GET')
      return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/records/uploads'))
      return route.fulfill({
        status: 201,
        json: {
          file: {
            id: 'file-a',
            originalName: 'already-proposed.pdf',
            uploadedBy: '123169226',
            uploadedAt: '2026-11-15',
          },
          result: {
            id: 'proposal-a',
            versionNumber: 1,
            testName: 'Биохимический анализ крови (АЛТ)',
            resultDate: '2026-11-15',
            summary: 'Already interpreted',
            matchedFindings: [
              {
                testName: 'Биохимический анализ крови (АЛТ)',
                resultDate: '2026-11-15',
                summary: 'Already interpreted',
                pageNumber: 1,
                findingIndex: 0,
                requirementIds: [requirementId],
              },
            ],
            interpretationStatus: 'proposed',
          },
        },
      });
    if (url.pathname.endsWith('/interpret')) {
      interpretationCalls += 1;
      return route.fulfill({ status: 201, json: {} });
    }
    if (url.pathname.endsWith('/confirm')) return route.fulfill({ json: {} });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'synthetic', initDataUnsafe: { user: { id: 123169226 } } },
    };
  });

  await page.goto('/');
  await page.locator('#file').setInputFiles({
    name: 'already-proposed.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF synthetic'),
  });
  await expect(page.locator('.upload-review')).toBeVisible();
  const alreadyMatched = page.locator('.proposal-finding');
  await expect(alreadyMatched.locator('.recognized-finding strong')).toHaveText(
    'Биохимический анализ крови (АЛТ)',
  );
  await expect(
    alreadyMatched.getByLabel('Биохимический анализ крови (АЛТ)', { exact: true }),
  ).toBeChecked();
  await expect(page.getByText('Already interpreted')).toHaveCount(0);
  expect(interpretationCalls).toBe(0);
});

test('reviews checklist-matched findings from a multipage PDF without showing unmatched studies', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1350 });
  const requirementIds = {
    wifeSyphilis: '00000000-0000-4000-8000-000000000001',
    wifeHiv: '00000000-0000-4000-8000-000000000002',
    wifeHepatitisB: '00000000-0000-4000-8000-000000000003',
    wifeHepatitisC: '00000000-0000-4000-8000-000000000004',
    wifeRh: '00000000-0000-4000-8000-000000000024',
    husbandSyphilis: '00000000-0000-4000-8000-000000000034',
    husbandHiv: '00000000-0000-4000-8000-000000000035',
    husbandHepatitisB: '00000000-0000-4000-8000-000000000036',
    husbandHepatitisC: '00000000-0000-4000-8000-000000000037',
    husbandRh: '00000000-0000-4000-8000-000000000042',
  };
  const checklistRequirements = [
    [requirementIds.wifeSyphilis, 'Сифилис (anti-Treponema pallidum в крови)', 'wife'],
    [requirementIds.wifeHiv, 'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)', 'wife'],
    [requirementIds.wifeHepatitisB, 'Гепатит B (поверхностный антиген HBsAg)', 'wife'],
    [requirementIds.wifeHepatitisC, 'Гепатит C (antiHCV, антитела в крови)', 'wife'],
    [requirementIds.wifeRh, 'Группа крови, резус-фактор', 'wife'],
    [requirementIds.husbandSyphilis, 'Сифилис (anti-Treponema pallidum в крови)', 'husband'],
    [
      requirementIds.husbandHiv,
      'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
      'husband',
    ],
    [requirementIds.husbandHepatitisB, 'Гепатит B (поверхностный антиген HBsAg)', 'husband'],
    [requirementIds.husbandHepatitisC, 'Гепатит C (antiHCV, антитела в крови)', 'husband'],
    [requirementIds.husbandRh, 'Группа крови, резус-фактор', 'husband'],
  ] as const;
  const multipageFindings = [
    { testName: 'Общий анализ мочи', resultDate: '2026-11-15', summary: null, pageNumber: 1 },
    {
      testName: 'Гинекологический мазок (анализ на флору)',
      resultDate: null,
      summary: null,
      pageNumber: 2,
    },
    { testName: 'Общий анализ крови', resultDate: null, summary: null, pageNumber: 4 },
    {
      testName: 'HIV Ag/Ab + P24',
      resultDate: null,
      summary: 'Описание результата, скрытое в обзоре',
      pageNumber: 6,
    },
    { testName: 'Коагулограмма (ПТИ)', resultDate: null, summary: null, pageNumber: 6 },
    { testName: 'Коагулограмма (PT)', resultDate: null, summary: null, pageNumber: 6 },
    { testName: 'Коагулограмма (ИНР)', resultDate: null, summary: null, pageNumber: 7 },
    { testName: 'Коагулограмма (aPTT)', resultDate: null, summary: null, pageNumber: 7 },
    {
      testName: 'Биохимический анализ крови (глюкоза)',
      resultDate: null,
      summary: null,
      pageNumber: 8,
    },
    {
      testName: 'anti-Treponema',
      resultDate: null,
      summary: 'Описание результата, скрытое в обзоре',
      pageNumber: 8,
    },
    {
      testName: 'HBsAg',
      resultDate: null,
      summary: 'Описание результата, скрытое в обзоре',
      pageNumber: 8,
    },
    {
      testName: 'anti-HCV',
      resultDate: null,
      summary: 'Описание результата, скрытое в обзоре',
      pageNumber: 8,
    },
    {
      testName: 'Blood group and Rh factor',
      resultDate: null,
      summary: 'Описание результата, скрытое в обзоре',
      pageNumber: 9,
    },
  ];
  const matchedFindings = [
    { findingIndex: 3, requirementIds: [requirementIds.husbandHiv] },
    { findingIndex: 9, requirementIds: [requirementIds.husbandSyphilis] },
    { findingIndex: 10, requirementIds: [requirementIds.husbandHepatitisB] },
    { findingIndex: 11, requirementIds: [requirementIds.husbandHepatitisC] },
    { findingIndex: 12, requirementIds: [requirementIds.husbandRh] },
  ].map(({ findingIndex, requirementIds: matches }) => ({
    ...multipageFindings[findingIndex],
    findingIndex,
    requirementIds: matches,
  }));
  const singleFinding = {
    testName: 'Blood group and Rh factor',
    resultDate: '2026-11-15',
    summary: 'Описание результата, скрытое в обзоре',
    pageNumber: 1,
    findingIndex: 0,
    requirementIds: [requirementIds.husbandRh],
  };
  let uploadNumber = 0;
  const confirmations: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'husband', telegramUserId: '288092250' } });
    if (url.pathname.endsWith('/cycles') && request.method() === 'GET')
      return route.fulfill({
        json: [{ id: 'cycle-multi', startDate: '2026-11-15', status: 'active' }],
      });
    if (url.pathname.endsWith('/cycles/cycle-multi'))
      return route.fulfill({
        json: {
          id: 'cycle-multi',
          checklist: checklistRequirements.map(([id, name, patientApplicability]) => ({
            requirementId: id,
            status: 'pending',
            requirement: { id, name, patientApplicability },
          })),
        },
      });
    if (url.pathname.endsWith('/records') && request.method() === 'GET')
      return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/records/uploads')) {
      uploadNumber += 1;
      return route.fulfill({
        status: 201,
        json: {
          file: {
            id: uploadNumber === 1 ? 'file-multi' : 'file-single',
            originalName: uploadNumber === 1 ? 'lab-results-multipage.pdf' : 'blood-rh-single.pdf',
            uploadedBy: '288092250',
            uploadedAt: '2026-11-15',
          },
          result: {
            id: uploadNumber === 1 ? 'result-multi' : 'result-single',
            versionNumber: 1,
            interpretationStatus: 'pending',
          },
        },
      });
    }
    if (url.pathname.endsWith('/interpret')) {
      const proposal =
        uploadNumber === 1
          ? {
              id: 'result-multi',
              testName: multipageFindings[0].testName,
              resultDate: '2026-11-15',
              summary: null,
              interpretationStatus: 'proposed',
              extractedFindings: multipageFindings,
              matchedFindings,
            }
          : {
              id: 'result-single',
              testName: singleFinding.testName,
              resultDate: singleFinding.resultDate,
              summary: singleFinding.summary,
              interpretationStatus: 'proposed',
              extractedFindings: [singleFinding],
              matchedFindings: [singleFinding],
            };
      return route.fulfill({ status: 200, json: proposal });
    }
    if (url.pathname.endsWith('/confirm')) {
      confirmations.push(request.postDataJSON());
      return route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'synthetic', initDataUnsafe: { user: { id: 288092250 } } },
    };
  });

  await page.goto('/');
  const interpretationResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/interpret'),
  );
  await page.locator('#file').setInputFiles({
    name: 'lab-results-multipage.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF synthetic multipage'),
  });
  const interpreted = await (await interpretationResponse).json();
  expect(interpreted.extractedFindings).toHaveLength(multipageFindings.length);
  expect(interpreted.matchedFindings).toHaveLength(5);
  const multipageTitles = [
    'HIV Ag/Ab + P24',
    'anti-Treponema',
    'HBsAg',
    'anti-HCV',
    'Blood group and Rh factor',
  ];
  const requirementNames = [
    'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
    'Сифилис (anti-Treponema pallidum в крови)',
    'Гепатит B (поверхностный антиген HBsAg)',
    'Гепатит C (antiHCV, антитела в крови)',
    'Группа крови, резус-фактор',
  ];
  const matchedPages = [6, 8, 8, 8, 9];
  await expect(page.locator('.proposal-finding')).toHaveCount(5);
  for (let index = 0; index < multipageTitles.length; index += 1) {
    const row = page.locator('.proposal-finding').nth(index);
    await expect(row.getByText(multipageTitles[index], { exact: true })).toHaveCount(1);
    await expect(row.locator('.finding-meta')).toContainText('Для мужа');
    await expect(row.locator('.finding-meta')).toContainText('15.11.2026');
    await expect(row.locator('.finding-meta')).toContainText(`Страница ${matchedPages[index]}`);
    await expect(row.getByLabel(requirementNames[index], { exact: true })).toBeChecked();
  }
  await expect(page.getByText('Описание результата, скрытое в обзоре')).toHaveCount(0);
  await expect(page.getByText('Общий анализ мочи', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Общий анализ крови', { exact: true })).toHaveCount(0);
  await expect(page.locator('.proposal-result fieldset')).toHaveCount(0);
  if (process.env.CAPTURE_MULTIPAGE_SCREENSHOT) {
    await page
      .locator('.proposal-result')
      .screenshot({ path: process.env.CAPTURE_MULTIPAGE_SCREENSHOT });
  }
  const hivCheckbox = page.getByLabel(requirementNames[0], { exact: true });
  await hivCheckbox.uncheck();
  await expect(hivCheckbox).not.toBeChecked();
  await hivCheckbox.check();
  await expect(hivCheckbox).toBeChecked();
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Анализ подтверждён.')).toBeVisible();
  expect(confirmations[0].requirementIds).toEqual([
    requirementIds.husbandHiv,
    requirementIds.husbandSyphilis,
    requirementIds.husbandHepatitisB,
    requirementIds.husbandHepatitisC,
    requirementIds.husbandRh,
  ]);
  const confirmedFindings = confirmations[0].extractedFindings as {
    pageNumber: number;
    requirementIds: string[];
  }[];
  expect(
    confirmedFindings.map(({ pageNumber, requirementIds: ids }) => ({ pageNumber, ids })),
  ).toEqual([
    { pageNumber: 1, ids: [] },
    { pageNumber: 2, ids: [] },
    { pageNumber: 4, ids: [] },
    { pageNumber: 6, ids: [requirementIds.husbandHiv] },
    { pageNumber: 6, ids: [] },
    { pageNumber: 6, ids: [] },
    { pageNumber: 7, ids: [] },
    { pageNumber: 7, ids: [] },
    { pageNumber: 8, ids: [] },
    { pageNumber: 8, ids: [requirementIds.husbandSyphilis] },
    { pageNumber: 8, ids: [requirementIds.husbandHepatitisB] },
    { pageNumber: 8, ids: [requirementIds.husbandHepatitisC] },
    { pageNumber: 9, ids: [requirementIds.husbandRh] },
  ]);

  const singleInterpretation = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/interpret'),
  );
  await page.locator('#file').setInputFiles({
    name: 'blood-rh-single.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF synthetic single page'),
  });
  const singleResult = await (await singleInterpretation).json();
  expect(singleResult.extractedFindings).toHaveLength(1);
  expect(singleResult.matchedFindings).toHaveLength(1);
  const singleRow = page.locator('.proposal-finding');
  await expect(singleRow).toHaveCount(1);
  await expect(singleRow.getByText('Blood group and Rh factor', { exact: true })).toHaveCount(1);
  await expect(singleRow.locator('.finding-meta')).toContainText('Для мужа');
  await expect(singleRow.locator('.finding-meta')).toContainText('15.11.2026');
  await expect(singleRow.locator('.finding-meta')).toContainText('Страница 1');
  await expect(singleRow.getByLabel('Группа крови, резус-фактор', { exact: true })).toBeChecked();
  await expect(page.getByText('Описание результата, скрытое в обзоре')).toHaveCount(0);
  if (process.env.CAPTURE_SINGLEPAGE_SCREENSHOT) {
    await page
      .locator('.proposal-result')
      .screenshot({ path: process.env.CAPTURE_SINGLEPAGE_SCREENSHOT });
  }
});

for (const role of ['wife', 'husband'] as const) {
  test(`${role} only sees compatible requirements for assignment and upload review`, async ({
    page,
  }) => {
    const wifeRequirement = {
      id: 'wife-requirement',
      name: 'Wife-specific exam',
      patientApplicability: 'wife' as const,
    };
    const husbandRequirement = {
      id: 'husband-requirement',
      name: 'Husband-specific exam',
      patientApplicability: 'husband' as const,
    };
    const sharedRequirement = {
      id: 'shared-requirement',
      name: 'Shared exam',
      patientApplicability: 'both' as const,
    };
    const uploadRequirement = role === 'wife' ? wifeRequirement : husbandRequirement;
    const requirements = [wifeRequirement, husbandRequirement, sharedRequirement].map(
      (requirement) => ({
        requirementId: requirement.id,
        status: 'pending',
        requirement,
      }),
    );
    let interpretationCalls = 0;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { patientRole: role, telegramUserId: '123169226' } });
      if (url.pathname.endsWith('/cycles') && request.method() === 'GET')
        return route.fulfill({
          json: [{ id: 'cycle-role', startDate: '2026-11-15', status: 'active' }],
        });
      if (url.pathname.endsWith('/cycles/cycle-role'))
        return route.fulfill({ json: { id: 'cycle-role', checklist: requirements } });
      if (url.pathname.endsWith('/records') && request.method() === 'GET')
        return route.fulfill({
          json: [
            {
              id: 'own-file',
              originalName: 'own-unmatched.pdf',
              uploadedBy: '123169226',
              uploadedAt: '2026-11-15',
              results: [
                {
                  id: 'own-result',
                  versionNumber: 1,
                  testName: 'Unmatched test',
                  interpretationStatus: 'proposed',
                },
              ],
            },
            {
              id: 'partner-file',
              originalName: 'partner-unmatched.pdf',
              uploadedBy: '987654321',
              uploadedAt: '2026-11-15',
              results: [
                {
                  id: 'partner-result',
                  versionNumber: 1,
                  testName: 'Unmatched test',
                  interpretationStatus: 'proposed',
                },
              ],
            },
          ],
        });
      if (url.pathname.endsWith('/records/uploads'))
        return route.fulfill({
          status: 201,
          json: {
            file: {
              id: 'upload-file',
              originalName: 'role-specific.pdf',
              uploadedBy: '123169226',
              uploadedAt: '2026-11-15',
            },
            result: {
              id: 'upload-result',
              versionNumber: 1,
              testName: uploadRequirement.name,
              resultDate: '2026-11-15',
              summary: 'Role-specific proposal',
              matchedFindings: [
                {
                  testName: uploadRequirement.name,
                  resultDate: '2026-11-15',
                  summary: 'Role-specific proposal',
                  pageNumber: 1,
                  findingIndex: 0,
                  requirementIds: [uploadRequirement.id],
                },
              ],
              interpretationStatus: 'proposed',
            },
          },
        });
      if (url.pathname.endsWith('/interpret')) {
        interpretationCalls += 1;
        return route.fulfill({ status: 201, json: {} });
      }
      return route.fulfill({ json: {} });
    });
    await page.addInitScript(() => {
      (window as Window & { Telegram?: unknown }).Telegram = {
        WebApp: { initData: 'synthetic', initDataUnsafe: { user: { id: 123169226 } } },
      };
    });

    await page.goto('/records');
    const tabs = page.getByRole('group', { name: 'Чьи анализы показывать' });
    const visibleOwnRequirement = role === 'wife' ? wifeRequirement : husbandRequirement;
    const visiblePartnerRequirement = role === 'wife' ? husbandRequirement : wifeRequirement;
    await expect(page.getByRole('button', { name: visibleOwnRequirement.name })).toBeVisible();
    await expect(page.getByRole('button', { name: sharedRequirement.name })).toBeVisible();
    await expect(page.getByRole('button', { name: visiblePartnerRequirement.name })).toHaveCount(0);
    const ownFile = page.locator('.unmatched-file');
    await expect(ownFile).toHaveCount(1);
    await expect(ownFile).toContainText('own-unmatched.pdf');
    await tabs.getByRole('button', { name: 'Анализы партнёра' }).click();
    await expect(page.getByRole('button', { name: visiblePartnerRequirement.name })).toBeVisible();
    await expect(page.getByRole('button', { name: sharedRequirement.name })).toBeVisible();
    await expect(page.getByRole('button', { name: visibleOwnRequirement.name })).toHaveCount(0);
    const partnerFile = page.locator('.unmatched-file');
    await expect(partnerFile).toHaveCount(1);
    await expect(partnerFile).toContainText('partner-unmatched.pdf');
    await expect(partnerFile.getByRole('button', { name: 'Назначить' })).toHaveCount(0);
    await tabs.getByRole('button', { name: 'Мои анализы' }).click();
    await page.locator('.unmatched-file').getByRole('button', { name: 'Назначить' }).click();
    const assignment = page.getByRole('dialog');
    await expect(assignment.getByRole('button', { name: uploadRequirement.name })).toBeVisible();
    await expect(assignment.getByRole('button', { name: 'Shared exam' })).toBeVisible();
    const hiddenRequirement = role === 'wife' ? husbandRequirement : wifeRequirement;
    await expect(assignment.getByRole('button', { name: hiddenRequirement.name })).toHaveCount(0);
    await assignment.getByRole('button', { name: 'Закрыть' }).click();

    await page.goto('/');
    await page.locator('#file').setInputFiles({
      name: 'role-specific.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF synthetic'),
    });
    await expect(page.locator('.upload-review')).toBeVisible();
    const uploadMatches = page.locator('.match-option');
    await expect(uploadMatches).toHaveCount(1);
    await expect(uploadMatches).toContainText(uploadRequirement.name);
    expect(interpretationCalls).toBe(0);
  });
}

test('opens a past preparation in the shared analyses view with its own files and checklist', async ({
  page,
}) => {
  const ownId = 'past-wife-requirement';
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'wife', telegramUserId: '123169226' } });
    if (url.pathname.endsWith('/cycles') && request.method() === 'GET')
      return route.fulfill({
        json: [{ id: 'past-cycle', startDate: '2025-05-12', status: 'complete' }],
      });
    if (url.pathname.endsWith('/cycles/past-cycle'))
      return route.fulfill({
        json: {
          id: 'past-cycle',
          startDate: '2025-05-12',
          status: 'complete',
          checklist: [
            {
              requirementId: ownId,
              status: 'complete',
              resultId: 'past-result',
              requirement: {
                id: ownId,
                name: 'Past preparation exam',
                patientApplicability: 'wife',
                validityDays: 180,
              },
            },
          ],
        },
      });
    if (url.pathname.endsWith('/records') && request.method() === 'GET')
      return route.fulfill({
        json: [
          {
            id: 'past-file',
            originalName: 'past-result.pdf',
            uploadedBy: '123169226',
            uploadedAt: '2025-05-15',
            results: [
              {
                id: 'past-result',
                versionNumber: 1,
                testName: 'Past preparation exam',
                resultDate: '2025-05-15',
                interpretationStatus: 'confirmed',
                requirements: [{ id: ownId }],
              },
            ],
          },
        ],
      });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'synthetic', initDataUnsafe: { user: { id: 123169226 } } },
    };
  });

  await page.goto('/records');
  await page.getByRole('button', { name: 'Выбрать подготовку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '12.05.2025' }).click();
  await expect(page).toHaveURL(/\/cycles\/past-cycle$/);
  await expect(page.getByRole('heading', { name: 'Все анализы' })).toBeVisible();
  await expect(page.getByText('Подготовка от 12.05.2025')).toBeVisible();
  const exam = page.getByRole('button', { name: 'Past preparation exam' });
  await expect(exam).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Есть результат: Past preparation exam' }),
  ).toBeChecked();
  await exam.click();
  const linked = page.locator('.linked-result');
  await expect(linked).toContainText('past-result.pdf');
  await expect(linked).toContainText('15.05.2025');
  await expect(linked).toContainText('ваш анализ');
  await expect(linked).toContainText('11.11.2025');
  await expect(page.getByRole('link', { name: '← Все анализы' })).toBeVisible();
});
