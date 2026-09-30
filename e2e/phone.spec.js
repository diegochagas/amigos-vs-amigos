import { test, expect } from "@playwright/test";

const shot = (page, name) => page.screenshot({ path: `e2e/screenshots/${name}.png` });
async function tapCanvas(page, fx, fy) {
  const box = await page.locator("canvas").boundingBox();
  await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
}
const centre = async (loc) => {
  const b = await loc.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

test("phone in landscape: touch controls overlay the game and drive the fighter", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/?seed=42&lang=pt");
  await page.waitForFunction(() => window.__game.scene === "title");
  await expect(page.locator("#pad")).toBeVisible();
  await expect(page.locator("#buttons")).toBeVisible();

  // Widescreen game fills the height; nothing scrolls.
  const box = await page.locator("canvas").boundingBox();
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, "phone-title");

  await tapCanvas(page, 0.5, 0.5);
  await page.waitForFunction(() => window.__game.scene === "select");
  await tapCanvas(page, 0.5 + 158 / 960, 0.73);         // third portrait
  await page.waitForTimeout(200);
  await shot(page, "phone-select");
  await page.touchscreen.tap(...(await centre(page.locator('[data-btn="a"]'))));
  await page.waitForFunction(() => window.__game.scene === "vs");
  await page.waitForFunction(() => window.__game.scene === "fight" && window.__game.match.phase === "fight", null, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__game.match.fighters[0].id)).toBe("diego");

  // Hold the pad's right arm: the fighter walks forward.
  const pad = await page.locator("#pad").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const x0 = await page.evaluate(() => window.__game.match.fighters[0].x);
  await touch("touchStart", [{ x: pad.x + pad.width * 0.88, y: pad.y + pad.height / 2, id: 1 }]);
  await page.waitForTimeout(350);
  await expect(page.locator("#pad")).toHaveClass(/right/);
  expect(await page.evaluate(() => window.__game.match.fighters[0].x)).toBeGreaterThan(x0);

  // Second finger between A and B while still holding the pad: both buttons = special.
  const [ax, ay] = await centre(page.locator('[data-btn="a"]'));
  const [bx] = await centre(page.locator('[data-btn="b"]'));
  await touch("touchStart", [
    { x: pad.x + pad.width * 0.88, y: pad.y + pad.height / 2, id: 1 },
    { x: (ax + bx) / 2, y: ay, id: 2 },
  ]);
  await page.waitForFunction(() => ["special", "hyper"].includes(window.__game.match.fighters[0].state));
  await page.waitForTimeout(250);
  await shot(page, "phone-fight");
  await touch("touchEnd", []);

  await page.getByRole("button", { name: "Menu" }).tap();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#menuTitle")).toHaveText("PAUSADO");
  await shot(page, "phone-pause");
  expect(errors).toEqual([]);
});

test("phone in portrait: game on top, controls below it", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/?seed=42&lang=en");
  await page.waitForFunction(() => window.__game.scene === "title");
  const game = await page.locator("canvas").boundingBox();
  const pad = await page.locator("#pad").boundingBox();
  expect(game.width).toBeGreaterThan(400);
  expect(pad.y).toBeGreaterThan(game.y + game.height);
  await page.waitForTimeout(300);
  await shot(page, "phone-portrait");
});
