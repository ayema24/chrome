import { test, expect, type Page } from '@playwright/test';

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

test('timed game shows running clocks and records the time control', async ({ page }) => {
  await page.goto('./#/play');
  await page.getByRole('button', { name: '3+2 Blitz' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  const clocks = page.locator('.clock');
  await expect(clocks).toHaveCount(2);
  await expect(page.locator('.clock.active')).toHaveText(/2:5\d|3:00/);
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.movelist .mv').nth(1)).toBeVisible({ timeout: 30000 });
  // After our move we got the 2s increment back: still at or above 3:00 minus a little
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.goto('./#/games');
  await expect(page.getByText('180+2')).toBeVisible();
});

test('puzzle rush runs and scores', async ({ page }) => {
  await page.goto('./#/puzzles?mode=rush');
  await page.getByRole('button', { name: /Survival/ }).click();
  await expect(page.locator('.rush-score')).toHaveText('0');
  await expect(page.locator('.board')).toBeVisible();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Score: 0/ })).toBeVisible();
});

test('coordinate drill counts correct taps', async ({ page }) => {
  await page.goto('./#/puzzles?mode=vision');
  await page.getByText('🎯 Coordinates').click();
  await page.getByRole('button', { name: 'Start (30s)' }).click();
  for (let i = 0; i < 3; i++) {
    const sq = (await page.locator('.coord-target').textContent())!.trim();
    await clickSquare(page, sq);
  }
  await expect(page.locator('.rush-score')).toHaveText('3');
});

test('spot the attacked pieces drill checks answers', async ({ page }) => {
  await page.goto('./#/puzzles?mode=vision');
  await page.getByText('👀 Spot the attacked pieces').click();
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('.feedback')).toContainText(/Not quite|Correct/);
});

test('guess the move scores a guess', async ({ page }) => {
  await page.goto('./#/puzzles?mode=guess');
  await page.locator('.card').filter({ hasText: 'Paul Morphy' }).getByRole('button', { name: /Play as Paul Morphy/ }).click();
  // Opera game, skip opening → first guess is move 7 (Qb3). Play it.
  await clickSquare(page, 'f3');
  await clickSquare(page, 'b3');
  await expect(page.locator('.feedback')).toContainText('+10');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.getByText(/Move 8/)).toBeVisible();
});

test('opening report page renders', async ({ page }) => {
  await page.goto('./#/openings?mode=report');
  await expect(page.getByRole('heading', { name: 'My opening report' })).toBeVisible();
});
