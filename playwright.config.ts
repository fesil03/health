import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173/health/',
    viewport: { width: 412, height: 915 }, // Galaxy-sized phone
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/health/',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
