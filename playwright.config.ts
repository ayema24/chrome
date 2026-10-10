import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90000,
  use: {
    baseURL: 'http://localhost:4173/',
    launchOptions: existsSync(local) ? { executablePath: local } : {},
    viewport: { width: 1280, height: 860 },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});
