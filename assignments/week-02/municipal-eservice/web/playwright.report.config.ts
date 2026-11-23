// Step-4 report run: same suite and settings as playwright.config.ts, plus full traces.
// Tests open their own browser contexts, so screencast frames from the traces are used to build GIF evidence.
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  use: { ...base.use, trace: { mode: 'on', screenshots: true, snapshots: false, sources: false } },
});
