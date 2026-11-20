import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const evidence = resolve(process.env.ACCEPTANCE_EVIDENCE_DIR ?? 'evidence/default');
// Only an explicit campaign coordinator may supply its already-owned ready server.
const coordinated = process.env.ACCEPTANCE_OWNED_SERVER === '1';
if (coordinated && (process.env.TEST_MODE !== '1' || process.env.BUG_MODE === undefined || !process.env.DB_PATH)) {
  throw new Error('An owned campaign server requires explicit TEST_MODE=1, BUG_MODE and DB_PATH');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  globalSetup: './tests/fixtures/reset.ts',
  outputDir: resolve(evidence, 'artifacts'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(evidence, 'results.json') }],
    ['html', { outputFolder: resolve(evidence, 'html'), open: 'never' }],
  ],
  use: {
    baseURL,
    timezoneId: 'Asia/Bangkok',
    locale: 'th-TH',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: coordinated ? undefined : {
    command: 'node --import tsx scripts/start-acceptance-server.ts',
    cwd: import.meta.dirname,
    url: new URL('/api/health', baseURL).href,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      TEST_MODE: '1',
      BUG_MODE: process.env.BUG_MODE ?? '',
      DB_PATH: resolve(process.env.DB_PATH ?? 'var/acceptance.sqlite'),
      TZ: 'Asia/Bangkok',
      PORT: new URL(baseURL).port || '3000',
      HOSTNAME: new URL(baseURL).hostname,
    },
  },
});
