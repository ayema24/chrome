import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

const PGN = `[White "Me"]
[Black "Opp"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 h6 14. Qe2 hxg5 15. Re1 Be6 16. dxe6 f6 17. Re3 c6 18. Rh3 Rxh3 19. gxh3 g6 20. Qf3 Qa5 21. Rd1 1-0`;

test('stepping through moves on a phone keeps the board where it is', async ({ page }) => {
  await page.goto('./#/analysis');
  await page.locator('textarea').fill(PGN);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.board')).toBeVisible();

  // Moves and engine lines sit right under the board; navigation is docked.
  const dock = page.locator('.nav-dock');
  await expect(dock).toBeVisible();
  expect(await dock.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  const boardBox = (await page.locator('.board').boundingBox())!;
  const movesBox = (await page.locator('.mobile-under-board .movelist').boundingBox())!;
  expect(movesBox.y).toBeGreaterThan(boardBox.y + boardBox.height - 1);
  expect(movesBox.y).toBeLessThan(780);

  const next = dock.getByRole('button', { name: 'Next' });
  for (let i = 0; i < 30; i++) await next.tap();
  await expect(page.locator('.mv.active')).toHaveText(/Be6/);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The strip scrolled sideways to keep the current move visible.
  const strip = page.locator('.mobile-under-board .movelist');
  expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const active = (await page.locator('.mv.active').boundingBox())!;
  const sb = (await strip.boundingBox())!;
  expect(active.x).toBeGreaterThanOrEqual(sb.x - 1);
  expect(active.x + active.width).toBeLessThanOrEqual(sb.x + sb.width + 1);

  // Even after scrolling down, stepping doesn't yank the page anywhere.
  await page.evaluate(() => window.scrollTo(0, 200));
  const y = await page.evaluate(() => window.scrollY);
  await next.tap();
  await next.tap();
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/mobile-analysis.png' });
});

test('page fits the phone width', async ({ page }) => {
  for (const p of ['home', 'play', 'puzzles', 'openings', 'analysis', 'games', 'progress', 'settings']) {
    await page.goto(`./#/${p}`);
    await expect(page.locator('.content h1:visible, .content .board:visible').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
});
