import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  tsconfig: './tsconfig.e2e.json',
  timeout: 120000,
  use: {
    headless: true,
  },
});
