import { test, expect, type Page } from '@playwright/test';

// A fake GitHub Gist API shared by two browser contexts ("phone" and "laptop").
let gistContent: string | null = null;
async function mockGitHub(page: Page) {
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/gists?per_page')) {
      return route.fulfill({ json: gistContent ? [{ id: 'g1', description: 'x', files: { 'chess-coach-sync.b64': {} } }] : [] });
    }
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      gistContent = JSON.parse(req.postData()!).files['chess-coach-sync.b64'].content;
      return route.fulfill({ json: { id: 'g1' } });
    }
    if (url.endsWith('/gists/g1')) return route.fulfill({ json: { files: { 'chess-coach-sync.b64': { content: gistContent, raw_url: '' } } } });
    return route.fulfill({ status: 404, body: '' });
  });
}

test('progress syncs between two devices', async ({ browser }) => {
  gistContent = null;
  const phone = await browser.newPage();
  const laptop = await browser.newPage();
  await mockGitHub(phone);
  await mockGitHub(laptop);

  // Phone: choose a repertoire opening, then connect sync
  await phone.goto('./#/openings?id=caro-kann');
  await phone.getByRole('button', { name: /Add as “My defence vs 1.e4”/ }).click();
  await phone.goto('./#/settings');
  await phone.getByPlaceholder('ghp_…').fill('ghp_fake');
  await phone.getByRole('button', { name: 'Connect' }).click();
  await expect(phone.getByText(/Last synced just now/)).toBeVisible();

  // Laptop: connect with the same token – it pulls the phone's progress
  await laptop.goto('./#/settings');
  await laptop.getByPlaceholder('ghp_…').fill('ghp_fake');
  await laptop.getByRole('button', { name: 'Connect' }).click();
  await expect(laptop.getByText(/Last synced just now/)).toBeVisible();
  await laptop.goto('./#/openings');
  await expect(laptop.locator('.notice').filter({ hasText: 'vs 1.e4' })).toContainText('Caro-Kann');
});
