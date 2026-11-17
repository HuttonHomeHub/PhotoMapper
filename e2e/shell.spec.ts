import { GPS_PHOTO, expect, test, upload } from './fixtures.ts';

test('a backup can be made and restored from Settings', async ({ page }) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO);
  await expect(page.getByRole('button', { name: 'gps.jpg, on map' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toContainText('1 photos · 0 projects · 0 clients');
  await settings.getByRole('button', { name: 'Back up now' }).click();
  const newest = settings.locator('.hhh-backups__item').first();
  await expect(newest).toContainText(/photomapper-backup-\d{8}-\d{6}\.zip/);
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Delete gps.jpg' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('[data-photo-item]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await newest.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
  await expect(page.getByText('Backup restored')).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Settings' })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(page.getByRole('button', { name: 'gps.jpg, on map' })).toBeVisible();
});

test('the theme choice is kept, and applied before the page draws', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
  const chosen = await root.getAttribute('data-theme');
  expect(chosen).toMatch(/^(dark|light)$/);
  await page.reload({ waitUntil: 'commit' });
  await expect(root).toHaveAttribute('data-theme', chosen ?? '');
  // Behind Cloudflare, Rocket Loader would rewrite any script without this (and the CSP
  // would then block it), including theme-init.js, which the kit's plugin adds.
  await expect(page.locator('script[src]:not([data-cfasync="false"])')).toHaveCount(0);
  await expect(page.locator('script[src="/theme-init.js"]')).toHaveCount(1);
});

test('the app bar shows the running version and opens the shortcuts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hhh-version')).toHaveText(/^\d+\.\d+\.\d+|^dev$|^e2e$/);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Keyboard Shortcuts')).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the menu opens the sidebar below the app bar, to upload from', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).not.toHaveClass(/mobile-open/);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(sidebar).toHaveClass(/mobile-open/);
    await upload(page, GPS_PHOTO);
    await expect(page.getByRole('button', { name: 'gps.jpg, on map' })).toBeInViewport();
  });
});
