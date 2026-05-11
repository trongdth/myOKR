import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx vite --config vite.screenshots.config.ts',
    port: 5173,
    reuseExistingServer: true,
  },
});
