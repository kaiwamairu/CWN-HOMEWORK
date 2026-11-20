import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import acceptance from './playwright.config';

const evidence = resolve(process.env.AUTH_UI_EVIDENCE_DIR ?? 'evidence/milestone4-ui');

/** Supplemental runtime checks have their own directory/report and never enter canonical discovery. */
export default defineConfig({
  ...acceptance,
  testDir: './tests/ui',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: resolve(evidence, 'artifacts'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(evidence, 'results.json') }],
    ['html', { outputFolder: resolve(evidence, 'html'), open: 'never' }],
  ],
});
