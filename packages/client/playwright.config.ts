import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:9000',
  },
  webServer: {
    command: 'cd ../.. && docker compose up -d',
    url: 'http://localhost:9000/api/health',
    reuseExistingServer: true,
  },
});
