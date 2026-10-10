import { test, expect, type Page } from '@playwright/test';

async function clickSquare(page: Page, sq: string) {
  const board = page.locator('.board').first();
  await board.waitFor();
  const box = (await board.boundingBox())!;
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  await page.mouse.click(box.x + (f + 0.5) * (box.width / 8), box.y + (7 - r + 0.5) * (box.height / 8));
}

test.beforeEach(async ({ page }) => {
  // Count sounds actually scheduled through Web Audio
  await page.addInitScript(() => {
    (window as any).__sounds = 0;
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a: any[]) {
      (window as any).__sounds++;
      return orig.apply(this, a as any);
    };
    const origO = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a: any[]) {
      (window as any).__sounds++;
      return origO.apply(this, a as any);
    };
  });
});

test('moves make sounds, coach badge appears, resign shows banner', async ({ page }) => {
  await page.goto('./#/play');
  await page.getByRole('button', { name: 'Start game' }).click();
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.move-badge')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.movelist .mv').nth(1)).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => (window as any).__sounds)).toBeGreaterThan(3);
  const state = await page.evaluate(async () => {
    const c = new AudioContext();
    return c.state;
  });
  expect(['running', 'suspended']).toContain(state);
  await page.getByRole('button', { name: 'Resign' }).click();
  await expect(page.locator('.result-banner')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/fx-banner.png' });
});

test('puzzle actions play sounds', async ({ page }) => {
  await page.goto('./#/puzzles');
  await page.locator('.board').waitFor();
  await page.waitForTimeout(900); // intro animation
  const before = await page.evaluate(() => (window as any).__sounds);
  await page.getByRole('button', { name: 'Show solution' }).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__sounds)).toBeGreaterThan(before);
  await page.screenshot({ path: 'test-results/fx-puzzle.png' });
});

test('settings sound test buttons play', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('button', { name: '▶ Capture' }).click();
  await page.getByRole('button', { name: '▶ Win' }).click();
  expect(await page.evaluate(() => (window as any).__sounds)).toBeGreaterThan(5);
});
