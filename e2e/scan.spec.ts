import { test, expect } from '@playwright/test';

const POSITIONS = [
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  'r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 b - - 0 10',
  '8/5pk1/6p1/3R4/1r6/6P1/5PK1/8 w - - 0 40',
];

for (const theme of ['brown', 'blue']) {
  for (const [i, fen] of POSITIONS.entries()) {
    test(`recognises position ${i + 1} on ${theme} board`, async ({ page }) => {
      // 1. Render the position and take a "screenshot" with some page around it
      await page.goto('./#/settings');
      await page.getByRole('button', { name: theme, exact: true }).click();
      await page.goto(`./#/analysis?fen=${encodeURIComponent(fen)}`);
      await page.getByLabel('Engine').uncheck();
      const flip = i === 1; // view from Black's side
      if (flip) await page.getByRole('button', { name: '⇅' }).first().click();
      await page.waitForTimeout(400);
      const box = (await page.locator('.board').boundingBox())!;
      const shot = await page.screenshot({ clip: { x: box.x - 30, y: box.y - 25, width: box.width + 260, height: box.height + 60 } });

      // 2. Feed it to the scanner
      await page.goto('./#/scan');
      await page.locator('input[type=file]').first().setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: shot });
      await page.getByRole('button', { name: 'Recognise position' }).click();
      const fenBox = page.locator('input[readonly]');
      await expect(fenBox).toBeVisible();
      if (fen.split(' ')[1] === 'b') await page.getByRole('button', { name: 'Black to move' }).click();
      await page.screenshot({ path: `test-results/scan-${theme}-${i}.png` });
      const got = await fenBox.inputValue();
      expect(got.split(' ')[0]).toBe(fen.split(' ')[0]);
    });
  }
}
