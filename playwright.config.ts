import { defineConfig } from "@playwright/test";
import { TEST_SECRET } from "./tests/browser/session-fixture";
export default defineConfig({
  testDir: "./tests/browser", workers: 1, timeout: 45_000, retries: 0,
  use: { baseURL: "http://127.0.0.1:3174", viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --port 3174 --host 127.0.0.1", url: "http://127.0.0.1:3174", reuseExistingServer: false, timeout: 90_000,
    env: { NODE_ENV: "development", LUDICORD_DEV_FAKE_AUTH: "true", LUDICORD_DISCORD_CLIENT_ID: "123456789012345678", LUDICORD_SESSION_SECRET: TEST_SECRET } },
});
