import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  tsconfig: './tsconfig.e2e.json',
  timeout: 120000,
  use: {
    headless: true,
  },
  webServer: {
    command: 'npm --prefix frontend run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
