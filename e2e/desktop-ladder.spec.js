import { test, expect } from "@playwright/test";

const shot = (page, name) => page.screenshot({ path: `e2e/screenshots/${name}.png` });
const scene = (page, name, timeout = 30_000) => page.waitForFunction((n) => window.__game.scene === n, name, { timeout });
const fighting = (page) => page.waitForFunction(() => window.__game.scene === "fight" && window.__game.match.phase === "fight", null, { timeout: 30_000 });

// Skips the actual fighting: leaves one side with 1 HP and lets a projectile finish it.
async function finishMatch(page, loser) {
  for (let round = 0; round < 2; round++) {
    await fighting(page);
    await page.evaluate((l) => {
      const m = window.__game.match;
      m.fighters[l].hp = 0.5;
      m.fighters[1 - l].meter = 0;
      m.fighters[0].x = 500;
      m.fighters[1].x = 590;
    }, loser);
    const before = await page.evaluate(() => window.__game.match.round);
    if (loser === 1) {
      await page.waitForFunction(() => {
        const m = window.__game.match;
        return m.phase !== "fight" || m.fighters[0].state === "idle" || m.fighters[0].state === "walk";
      });
      for (let i = 0; i < 40 && (await page.evaluate(() => window.__game.match.phase === "fight")); i++) {
        await page.keyboard.press("KeyZ");
        await page.waitForTimeout(120);
      }
    }
    await page.waitForFunction(() => window.__game.match.phase !== "fight", null, { timeout: 30_000 });
    if (round === 0) {
      await page.waitForTimeout(1200);
      await shot(page, loser === 1 ? "desktop-ko" : "desktop-lose");
      await page.waitForFunction((r) => window.__game.match.round > r || window.__game.scene !== "fight", before, { timeout: 30_000 });
    }
  }
}

test("arcade ladder: beat both friends and the shadow, see the ending; losing offers a continue", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/?seed=7&lang=en");
  await scene(page, "title");
  await page.keyboard.press("Enter");
  await scene(page, "select");
  await page.keyboard.press("KeyZ");
  await scene(page, "vs");
  await page.keyboard.press("KeyZ");

  // Lose stage 1 first: continue screen, then retry.
  await finishMatch(page, 0);
  await scene(page, "continue");
  await page.waitForTimeout(800);
  await shot(page, "desktop-continue");
  await page.keyboard.press("Enter");
  await scene(page, "vs");

  for (let stage = 0; stage < 3; stage++) {
    expect(await page.evaluate(() => window.__game.scene)).toBe("vs");
    if (stage === 2) {
      await page.waitForTimeout(500);
      await shot(page, "desktop-vs-shadow");
    }
    await finishMatch(page, 1);
    await page.waitForFunction(() => window.__game.scene !== "fight", null, { timeout: 30_000 });
  }
  await scene(page, "ending");
  await page.waitForTimeout(1500);
  await shot(page, "desktop-ending");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  await scene(page, "title");
  expect(errors).toEqual([]);
});
