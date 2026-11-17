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
  await expect(page.getByText('Spermogram', { exact: true })).toBeVisible();
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
  await expect(page.getByText('Already interpreted')).toBeVisible();
  expect(interpretationCalls).toBe(0);
});

test('reviews every finding from a multipage PDF and confirms each checklist mapping', async ({
  page,
}) => {
  const urineId = '00000000-0000-4000-8000-000000000011';
  const rhFactorId = '00000000-0000-4000-8000-000000000042';
  const manualId = '12345678-1234-4234-8234-123456789043';
  let confirmation: Record<string, unknown> | undefined;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { patientRole: 'wife', telegramUserId: '288092250' } });
    if (url.pathname.endsWith('/cycles') && request.method() === 'GET')
      return route.fulfill({
        json: [{ id: 'cycle-multi', startDate: '2026-11-15', status: 'active' }],
      });
    if (url.pathname.endsWith('/cycles/cycle-multi'))
      return route.fulfill({
        json: {
          id: 'cycle-multi',
          checklist: [
            {
              requirementId: urineId,
              status: 'pending',
              requirement: { id: urineId, name: 'Общий анализ мочи', patientApplicability: 'wife' },
            },
            {
              requirementId: rhFactorId,
              status: 'pending',
              requirement: {
                id: rhFactorId,
                name: 'Группа крови, резус-фактор',
                patientApplicability: 'wife',
              },
            },
            {
              requirementId: manualId,
              status: 'pending',
              requirement: {
                id: manualId,
                name: 'Дополнительное обследование',
                patientApplicability: 'wife',
              },
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
            id: 'file-multi',
            originalName: 'multi-page.pdf',
            uploadedBy: '288092250',
            uploadedAt: '2026-11-15',
          },
          result: { id: 'result-multi', versionNumber: 1, interpretationStatus: 'pending' },
        },
      });
    if (url.pathname.endsWith('/interpret'))
      return route.fulfill({
        status: 200,
        json: {
          id: 'result-multi',
          versionNumber: 1,
          testName: 'Общий анализ мочи',
          resultDate: '2026-10-01',
          summary: 'Результат мочи.',
          interpretationStatus: 'proposed',
          extractedFindings: [
            {
              testName: 'Общий анализ мочи',
              resultDate: '2026-10-01',
              summary: 'Результат мочи.',
              pageNumber: 1,
            },
            {
              testName: 'Группа крови, резус-фактор',
              resultDate: '2018-04-12',
              summary: 'Группа крови и резус-фактор.',
              pageNumber: 9,
            },
            {
              testName: 'Неизвестный анализ',
              resultDate: '2026-10-02',
              summary: 'Результат неизвестного анализа.',
              pageNumber: 12,
            },
          ],
        },
      });
    if (url.pathname.endsWith('/confirm')) {
      confirmation = request.postDataJSON();
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
    name: 'multi-page.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF synthetic multipage'),
  });
  expect((await (await interpretationResponse).json()).extractedFindings).toHaveLength(3);
  await expect(page.getByText('Общий анализ мочи', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Группа крови, резус-фактор', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Страница 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Страница 9', { exact: true })).toBeVisible();
  await expect(page.getByText('Неизвестный анализ', { exact: true }).first()).toBeVisible();
  await page
    .getByRole('group', { name: 'Неизвестный анализ' })
    .getByLabel(/Дополнительное обследование/)
    .check();
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Анализ подтверждён.')).toBeVisible();
  expect(confirmation?.requirementIds).toEqual([urineId, rhFactorId, manualId]);
  expect(confirmation?.extractedFindings).toEqual([
    expect.objectContaining({ pageNumber: 1, requirementIds: [urineId] }),
    expect.objectContaining({ pageNumber: 9, requirementIds: [rhFactorId] }),
    expect.objectContaining({ pageNumber: 12, requirementIds: [manualId] }),
  ]);
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
