import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const systemChromiumPath = existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

export default defineConfig({
  testDir: './src/test/browser',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: systemChromiumPath
          ? {
              executablePath: systemChromiumPath,
            }
          : {},
      },
    },
  ],
});
