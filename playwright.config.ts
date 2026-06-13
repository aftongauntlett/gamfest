import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const baseURL = `http://127.0.0.1:${PORT}`;
const isCI =
  (Reflect.get(globalThis, 'process') as { env?: { CI?: string } } | undefined)
    ?.env?.CI !== undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
