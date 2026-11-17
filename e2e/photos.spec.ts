import { GPS_PHOTO, NO_GPS_PHOTO, expect, test, upload } from './fixtures.ts';

test('a geotagged photo appears in the list and as a pin on the map', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Drop photos here')).toBeVisible();
  await upload(page, GPS_PHOTO);
  await expect(page.getByRole('button', { name: 'gps.jpg, on map' })).toBeVisible();
  await expect(page.locator('.leaflet-marker-pane .photo-pin')).toHaveCount(1);
});

test('a photo without GPS can be placed by hand, then unpinned', async ({ page }) => {
  await page.goto('/');
  await upload(page, NO_GPS_PHOTO);
  await expect(page.getByRole('button', { name: 'no-gps.jpg, no GPS' })).toBeVisible();

  await page.getByRole('button', { name: /Place on map/ }).click();
  await expect(page.getByRole('status')).toContainText('Click the map to place');
  await page.locator('.map-container').click({ position: { x: 400, y: 300 } });
  await expect(page.getByText('Placed “no-gps.jpg” on the map')).toBeVisible();
  await expect(page.getByRole('button', { name: 'no-gps.jpg, on map' })).toBeVisible();
  await expect(page.locator('.leaflet-marker-pane .photo-pin--manual')).toHaveCount(1);

  await page.getByRole('button', { name: /Remove pin/ }).click();
  await expect(page.getByRole('button', { name: 'no-gps.jpg, no GPS' })).toBeVisible();
});

test('uploading the same photo again is reported as a duplicate', async ({
  page,
  allowConsoleError,
}) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO);
  await expect(page.getByRole('button', { name: 'gps.jpg, on map' })).toBeVisible();
  await upload(page, GPS_PHOTO);
  await expect(page.locator('.upload-item.duplicate')).toContainText('Already uploaded');
  await expect(page.locator('[data-photo-item]')).toHaveCount(1);
  // The browser logs the server's 409 for the duplicate as a failed request.
  allowConsoleError(/status of 409/);
});

test('field notes and tags are saved', async ({ page }) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO);
  await page.getByRole('button', { name: 'View gps.jpg' }).click();
  await page.getByPlaceholder('Add observation notes…').fill('Standing water at the toe.');
  const tag = page.getByPlaceholder('Add tag…');
  await tag.fill('drainage');
  await tag.press('Enter');
  await expect(page.getByText('✓ Saved')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'View gps.jpg' }).click();
  await expect(page.getByPlaceholder('Add observation notes…')).toHaveValue(
    'Standing water at the toe.'
  );
  await expect(page.locator('.lightbox-overlay')).toContainText('drainage');
});

test('deleting a photo asks first, then removes it', async ({ page }) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO);
  await page.getByRole('button', { name: 'Delete gps.jpg' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Photo deleted')).toBeVisible();
  await expect(page.locator('.leaflet-marker-pane .photo-pin')).toHaveCount(0);
});
