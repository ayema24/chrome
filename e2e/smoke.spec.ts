import { test, expect, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::|explorer|lichess|chess\.com/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** Clicks the centre of a square on the (white-oriented) board. */
async function clickSquare(page: Page, sq: string, flipped = false) {
  const board = page.locator('.board').first();
  await board.waitFor();
  const box = (await board.boundingBox())!;
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  const x = flipped ? 7 - f : f;
  const y = flipped ? r : 7 - r;
  await page.mouse.click(box.x + (x + 0.5) * (box.width / 8), box.y + (y + 0.5) * (box.height / 8));
}

test('all pages render without errors', async ({ page }) => {
  const errors = trackErrors(page);
  for (const p of ['home', 'play', 'puzzles', 'puzzles?mode=endgames', 'puzzles?mode=mistakes', 'openings', 'openings?id=italian', 'analysis', 'games', 'scan', 'progress', 'settings']) {
    await page.goto(`./#/${p}`);
    await expect(page.locator('.content h1:visible, .content .board:visible').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('board colours are correct (a1 dark, h1 light) in both orientations', async ({ page }) => {
  await page.goto('./#/analysis?fen=' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  for (let flip = 0; flip < 2; flip++) {
    await expect(page.locator('[data-square=a1]')).toHaveClass(/dark/);
    await expect(page.locator('[data-square=h1]')).toHaveClass(/light/);
    await expect(page.locator('[data-square=d1]')).toHaveClass(/light/); // queen on her own colour
    await expect(page.locator('[data-square=e8]')).toHaveClass(/light/);
    await page.getByRole('button', { name: '⇅' }).first().click();
  }
});

test('play a move against the engine and get coach feedback', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/play');
  await page.getByRole('button', { name: 'Start game' }).click();
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  // Coach review appears and the engine replies (black piece moves)
  await expect(page.locator('.cls-badge').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.movelist .mv').nth(1)).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'test-results/play.png' });
  expect(errors).toEqual([]);
});

test('solve flow on a puzzle and opening drill', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/puzzles');
  await expect(page.locator('.board')).toBeVisible();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await expect(page.getByRole('button', { name: /Next puzzle/ })).toBeVisible();
  // Retry resets the same puzzle as practice
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '↻ Retry' }).click();
  await expect(page.getByText('Practice attempt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible({ timeout: 3000 });
  await page.screenshot({ path: 'test-results/puzzle.png' });

  await page.goto('./#/openings?id=italian&line=0&mode=practice');
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.feedback.ok')).toBeVisible();
  await page.screenshot({ path: 'test-results/opening.png' });
  expect(errors).toEqual([]);
});

test('analysis of a pasted game', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/analysis');
  await page.locator('textarea').fill('[White "Me"]\n[Black "Opp"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.locator('.cls-badge, .evalgraph').first()).toBeVisible({ timeout: 60000 });
  await page.keyboard.press('End');
  await page.screenshot({ path: 'test-results/analysis.png' });
  await page.goto('./#/progress');
  await page.goto('./#/home');
  await page.screenshot({ path: 'test-results/home.png', fullPage: true });
  expect(errors).toEqual([]);
});
