import { test, expect } from "@playwright/test";

const shot = (page, name) => page.screenshot({ path: `e2e/screenshots/${name}.png` });

test("boots, toggles language, plays a round with the keyboard and pauses", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => errors.push(`failed: ${r.url()}`));

  await page.goto("/?seed=42&lang=en");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => window.__game.scene === "title");
  await page.waitForTimeout(300);

  // The canvas is not blank: some pixel differs from the first one.
  const drawn = await canvas.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) return true;
    return false;
  });
  expect(drawn).toBe(true);
  await shot(page, "desktop-title");

  // EN/PT toggle changes the visible text.
  const before = await page.locator("body").innerText();
  await page.getByRole("button", { name: /^(PT|EN)$/ }).click();
  expect(await page.locator("body").innerText()).not.toBe(before);
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await page.getByRole("button", { name: /^(PT|EN)$/ }).click();

  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__game.scene === "select");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await shot(page, "desktop-select");

  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => window.__game.scene === "vs");
  await page.waitForTimeout(500);
  await shot(page, "desktop-vs");

  await page.waitForFunction(() => window.__game.scene === "fight" && window.__game.match.phase === "fight", null, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__game.match.fighters[0].id)).toBe("rachel");
  const x0 = await page.evaluate(() => window.__game.match.fighters[0].x);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowRight");
  expect(await page.evaluate(() => window.__game.match.fighters[0].x)).toBeGreaterThan(x0);
  await page.keyboard.down("KeyX");
  await page.waitForFunction(() => window.__game.match.fighters[0].state === "kick");
  await page.keyboard.up("KeyX");
  await shot(page, "desktop-fight");

  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeVisible();
  expect(await page.evaluate(() => window.__game.paused)).toBe(true);
  await shot(page, "desktop-pause");

  // Arrow keys walk the menu (wrapping), Enter presses the highlighted item, Esc resumes.
  const focused = () => page.evaluate(() => document.activeElement?.id);
  expect(await focused()).toBe("resumeBtn");
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe("soundBtn");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe("quitBtn");
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe("resumeBtn");
  await page.keyboard.press("ArrowUp");
  expect(await focused()).toBe("quitBtn");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  expect(await page.locator("#soundBtn").textContent()).toContain("off");
  await page.keyboard.press("Enter");
  await shot(page, "desktop-pause-keys");
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeHidden();
  expect(await page.evaluate(() => window.__game.paused)).toBe(false);

  await page.waitForTimeout(250);                      // let the game read the key release first
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator("#menu")).toBeHidden();

  expect(errors).toEqual([]);
});
