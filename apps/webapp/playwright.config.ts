import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL;
const baseURL = externalBaseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4200';
const { hostname, port } = new URL(baseURL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL, ...devices['Desktop Chrome'] },
  ...(externalBaseURL ? {} : {
    webServer: {
      command: `npm start -- --host ${hostname} --port ${port || 80}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  }),
});
