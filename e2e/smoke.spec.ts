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

test('opening drill: play the opponent, deviate, get engine advice, return to the line', async ({ page }) => {
  await page.goto('./#/openings?id=italian&line=0&mode=practice');
  await page.getByText('I play the opponent too').click();
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  // Opponent's turn: the book move is 1...e5; play 1...f6?! instead
  await expect(page.getByText(/Now move for your opponent/)).toBeVisible();
  await clickSquare(page, 'f7');
  await clickSquare(page, 'f6');
  await expect(page.getByText(/off the book/)).toBeVisible();
  await expect(page.locator('.engine-suggest .best-move')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.cls-badge').first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'test-results/drill-offbook.png' });
  await page.getByRole('button', { name: '↩ Back to the line' }).click();
  await clickSquare(page, 'e7');
  await clickSquare(page, 'e5');
  await expect(page.getByText(/Book move e5/)).toBeVisible();
});

test('perfect drills mark lines and the opening as learned', async ({ page }) => {
  // Bird's Opening has a single line; White's moves:
  const moves = [['f2', 'f4'], ['g1', 'f3'], ['e2', 'e3'], ['b2', 'b3'], ['c1', 'b2'], ['f1', 'e2'], ['e1', 'g1']];
  await page.goto('./#/openings?id=bird&line=0&mode=practice');
  for (let run = 0; run < 2; run++) {
    if (run === 1) await page.getByRole('button', { name: 'Restart' }).click();
    for (const [a, b] of moves) {
      await clickSquare(page, a);
      await clickSquare(page, b);
      await page.waitForTimeout(650); // opponent's book reply
    }
    if (run === 0) await expect(page.getByText(/Perfect! 1 more perfect drill/)).toBeVisible();
  }
  await expect(page.locator('.result-banner')).toContainText('Opening learned');
  await page.screenshot({ path: 'test-results/opening-learned.png' });
  await page.goto('./#/openings?id=bird');
  await expect(page.locator('h1')).toContainText('Learned');
  await expect(page.getByText(/to master it/)).toBeVisible();
});

test("Queen's Gambit Declined can be chosen as the defence to 1.d4", async ({ page }) => {
  await page.goto('./#/openings?id=qgd');
  await page.getByRole('button', { name: /Add as “My defence vs 1.d4”/ }).click();
  await expect(page.getByRole('button', { name: '★ In your repertoire' })).toBeVisible();
  await page.goto('./#/openings');
  await expect(page.locator('.notice').filter({ hasText: 'vs 1.d4' })).toContainText("Queen's Gambit Declined");
});
