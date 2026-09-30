import { test, expect } from "@playwright/test";

// Counts fullscreen requests instead of really going full screen.
const spy = (supported = true) => `
  window.__fs = 0;
  ${supported ? "Element.prototype.requestFullscreen = function () { window.__fs++; return Promise.resolve(); };" : "delete Element.prototype.requestFullscreen;"}
`;
async function tapCanvas(page) {
  const box = await page.locator("canvas").boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test("the first tap starts the game in full screen, later taps do not ask again", async ({ page }) => {
  await page.addInitScript(spy());
  await page.goto("/?seed=42&lang=en");
  await page.waitForFunction(() => window.__game.scene === "title");
  expect(await page.evaluate(() => window.__fs)).toBe(0);      // never on load: browsers forbid it
  await tapCanvas(page);
  await page.waitForFunction(() => window.__game.scene === "select");
  expect(await page.evaluate(() => window.__fs)).toBe(1);
  await tapCanvas(page);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__fs)).toBe(1);
});

test("?fullscreen=0 opts out, and a browser without the API still starts", async ({ page }) => {
  await page.addInitScript(spy());
  await page.goto("/?seed=42&lang=en&fullscreen=0");
  await page.waitForFunction(() => window.__game.scene === "title");
  await tapCanvas(page);
  await page.waitForFunction(() => window.__game.scene === "select");
  expect(await page.evaluate(() => window.__fs)).toBe(0);

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(spy(false));
  await page.goto("/?seed=42&lang=en");
  await page.waitForFunction(() => window.__game.scene === "title");
  await tapCanvas(page);
  await page.waitForFunction(() => window.__game.scene === "select");
  expect(errors).toEqual([]);
});

test("the page links a manifest that opens full screen in landscape", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(new URL(href, page.url()).href)).json();
  expect(manifest.display).toBe("fullscreen");
  expect(manifest.orientation).toBe("landscape");
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, page.url()).href)).ok()).toBe(true);
});
