import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:4173" },
  webServer: { command: "npx serve -l 4173 .", url: "http://localhost:4173", reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } }, testMatch: /desktop/ },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 915, height: 412 } }, testMatch: /phone/ },
  ],
});
