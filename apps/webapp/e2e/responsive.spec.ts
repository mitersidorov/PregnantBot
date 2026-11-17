import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const requirementId = 'req-a';
const viewports = [
  { name: '320px phone', width: 320, height: 740 },
  { name: '375px phone', width: 375, height: 812 },
  { name: '390px phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

test.describe('responsive Telegram screens and workflows', () => {
  for (const viewport of viewports) {
    test(`${viewport.name}: upload, review, assignment and history fit`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      let uploaded = false;
      let cycleStarted = false;
      let confirmed = false;
      let interpretationCalls = 0;
      let confirmedIds: string[] = [];
      const file = {
        id: 'file-a',
        originalName: 'sample.pdf',
        uploadedBy: '123169226',
        uploadedAt: '2026-11-15',
      };
      const proposedResult = {
        id: 'result-a',
        versionNumber: 1,
        testName: 'Биохимический анализ крови (АЛТ)',
        resultDate: '2026-11-15',
        summary: 'Synthetic result',
        interpretationStatus: 'proposed',
      };
      await page.route('**/api/**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.pathname.endsWith('/auth/me'))
          return route.fulfill({ json: { patientRole: 'wife', telegramUserId: '123169226' } });
        if (url.pathname.endsWith('/cycles') && req.method() === 'GET')
          return route.fulfill({
            json: cycleStarted
              ? [{ id: 'cycle-a', startDate: '2026-11-15', status: 'active' }]
              : [],
          });
        if (url.pathname.endsWith('/cycles') && req.method() === 'POST') {
          cycleStarted = true;
          return route.fulfill({
            status: 201,
            json: { id: 'cycle-a', startDate: '2026-11-15', status: 'active' },
          });
        }
        if (url.pathname.endsWith('/cycles/cycle-a') && req.method() === 'GET')
          return route.fulfill({
            json: {
              id: 'cycle-a',
              checklist: [
                {
                  requirementId,
                  status: confirmed ? 'complete' : 'pending',
                  resultId: confirmed ? proposedResult.id : null,
                  requirement: {
                    id: requirementId,
                    name: 'Биохимический анализ крови (АЛТ)',
                    description: 'Запланируйте после окончания менструации.',
                    validityDays: 180,
                    patientApplicability: 'both',
                  },
                },
              ],
            },
          });
        if (url.pathname.endsWith('/checklist/req-a'))
          return route.fulfill({ json: { status: 'complete' } });
        if (url.pathname.endsWith('/records') && req.method() === 'GET')
          return route.fulfill({
            json: uploaded
              ? [
                  {
                    ...file,
                    results: [
                      {
                        ...proposedResult,
                        interpretationStatus: confirmed ? 'confirmed' : 'proposed',
                        requirements: confirmed ? [{ id: requirementId }] : [],
                      },
                    ],
                  },
                ]
              : [],
          });
        if (url.pathname.endsWith('/records/uploads')) {
          uploaded = true;
          return route.fulfill({
            status: 201,
            json: {
              file,
              result: { id: 'result-a', versionNumber: 1, interpretationStatus: 'pending' },
            },
          });
        }
        if (url.pathname.endsWith('/interpret')) {
          interpretationCalls += 1;
          return route.fulfill({ status: 201, json: proposedResult });
        }
        if (url.pathname.endsWith('/confirm')) {
          confirmedIds = req.postDataJSON().requirementIds;
          confirmed = true;
          return route.fulfill({ json: { ...proposedResult, interpretationStatus: 'confirmed' } });
        }
        if (url.pathname.endsWith('/records/file-a/download'))
          return route.fulfill({ body: 'synthetic file' });
        if (url.pathname.endsWith('/health'))
          return route.fulfill({ json: { appName: 'PregnantBot' } });
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
      const noOverflow = async () => {
        const issues = await page.evaluate(() => {
          const selectors = '.content,form,form > *,button,input,fieldset,.checklist-item,.modal';
          return [...document.querySelectorAll<HTMLElement>(selectors)].flatMap((el) => {
            const rect = el.getBoundingClientRect();
            const errors: string[] = [];
            if (rect.left < -1 || rect.right > innerWidth + 1)
              errors.push(`bounds ${Math.round(rect.left)}..${Math.round(rect.right)}`);
            if (el.scrollWidth > el.clientWidth + 1)
              errors.push(`scroll ${el.scrollWidth}/${el.clientWidth}`);
            return errors.length ? [`${el.tagName}.${el.className}: ${errors.join(', ')}`] : [];
          });
        });
        expect(issues, 'responsive element overflow').toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      };

      await page.goto('/');
      const favicon = await page.request.get('/favicon.svg');
      expect(favicon.status()).toBe(200);
      expect(favicon.headers()['content-type']).toContain('image/svg+xml');
      expect((await page.request.get('/favicon.ico')).status()).toBe(200);
      await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0);
      await noOverflow();
      const homeRobot = page.locator('.home-robot');
      const startPreparation = page.getByRole('button', { name: 'Начать подготовку' });
      await expect(homeRobot).toHaveAttribute('alt', 'Беременный робот');
      const robotBox = await homeRobot.boundingBox();
      const startBox = await startPreparation.boundingBox();
      expect(robotBox).not.toBeNull();
      expect(startBox).not.toBeNull();
      expect(robotBox!.y + robotBox!.height).toBeLessThanOrEqual(startBox!.y);
      await startPreparation.click();
      const nav = page.getByRole('navigation', { name: 'Основная навигация' });
      await expect(nav).toBeVisible();
      const homeLink = nav.getByRole('link', { name: 'Загрузить анализ' });
      expect((await homeLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.goto('/cycles/cycle-a');
      await expect(page.getByRole('heading', { name: 'Все анализы' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Биохимический анализ крови (АЛТ)' }),
      ).toBeVisible();

      await page.goto('/');
      await expect(page.locator('.home-robot')).toBeVisible();
      const uploadResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/records/uploads'),
      );
      await page.locator('#file').setInputFiles({
        name: 'sample.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF synthetic'),
      });
      await uploadResponse;
      await expect(page.locator('.upload-review')).toBeVisible();
      await expect(page.getByText('Synthetic result')).toBeVisible();
      await expect(page.locator('.preview')).toHaveCount(0);
      await expect(page.locator('.file-name')).toHaveText('sample.pdf');
      const proposalBox = await page.locator('.proposal').boundingBox();
      const reviewActionBox = await page.locator('.review-actions .review-primary').boundingBox();
      expect(proposalBox).not.toBeNull();
      expect(reviewActionBox).not.toBeNull();
      expect(
        Math.abs(
          reviewActionBox!.x + reviewActionBox!.width / 2 - proposalBox!.x - proposalBox!.width / 2,
        ),
      ).toBeLessThanOrEqual(2);
      expect(interpretationCalls).toBe(1);
      await noOverflow();
      if (viewport.width === 320 || viewport.width === 390) {
        await mkdir('reports/screenshots', { recursive: true });
        await page.screenshot({
          path: `reports/screenshots/upload-review-${viewport.width}.png`,
          fullPage: true,
        });
      }
      await page.getByRole('button', { name: 'Отмена' }).click();
      await expect(page.locator('label.upload-select-button')).toBeVisible();
      await page.goto('/records');
      await expect(page.locator('#file')).toHaveCount(0);
      const tabs = page.getByRole('group', { name: 'Чьи анализы показывать' });
      await tabs.getByRole('button', { name: 'Анализы партнёра' }).click();
      await expect(page.locator('.unmatched-file')).toHaveCount(0);
      await tabs.getByRole('button', { name: 'Мои анализы' }).click();
      const unmatchedFile = page.locator('.unmatched-file');
      await expect(unmatchedFile).toHaveCount(1);
      await expect(
        unmatchedFile.getByRole('link', { name: 'Скачать файл sample.pdf' }),
      ).toBeVisible();
      await expect(unmatchedFile.getByRole('button', { name: 'Назначить' })).toBeVisible();
      await expect(unmatchedFile.locator('button, a')).toHaveCount(2);

      const choosePreparation = page.getByRole('button', { name: 'Выбрать подготовку' });
      await choosePreparation.scrollIntoViewIfNeeded();
      const chooseBox = await choosePreparation.boundingBox();
      const unmatchedBox = await unmatchedFile.boundingBox();
      expect(chooseBox).not.toBeNull();
      expect(unmatchedBox).not.toBeNull();
      expect(chooseBox!.x).toBeLessThan(viewport.width / 2);
      expect(chooseBox!.y).toBeGreaterThan(unmatchedBox!.y);
      await choosePreparation.click();
      const attemptsDialog = page.getByRole('dialog');
      await expect(
        attemptsDialog.getByRole('heading', { name: 'Выбрать подготовку' }),
      ).toBeVisible();
      await expect(
        attemptsDialog.getByRole('button', { name: 'Начать новую подготовку' }),
      ).toBeVisible();
      await attemptsDialog.getByRole('button', { name: 'Закрыть' }).click();

      await unmatchedFile.getByRole('button', { name: 'Назначить' }).click();
      const assignment = page.getByRole('dialog');
      await expect(assignment.locator('.assignment-result')).toContainText('Synthetic result');
      await expect(assignment.locator('.assignment-result')).toContainText(
        'Биохимический анализ крови (АЛТ)',
      );
      await expect(assignment.locator('.assignment-result')).toContainText('15.11.2026');
      await assignment.getByRole('button', { name: 'Биохимический анализ крови (АЛТ)' }).click();
      await assignment.getByRole('button', { name: 'Назначить' }).click();
      await expect(page.getByText('Анализ назначен.')).toBeVisible();
      expect(confirmedIds).toEqual([requirementId]);
      await page.getByRole('button', { name: /Биохимический анализ крови \(АЛТ\)/ }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: 'Скачать файл sample.pdf' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('sample.pdf');
      await noOverflow();
    });
  }
});
