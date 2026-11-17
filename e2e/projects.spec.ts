import { GPS_PHOTO, expect, test, upload } from './fixtures.ts';

test('a client and project made while uploading appear in the tree and filter the list', async ({
  page,
}) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO, { client: 'Acme Civils', project: 'Embankment survey' });
  await expect(page.getByRole('button', { name: 'gps.jpg, on map' })).toBeVisible();

  const tree = page.locator('.client-tree');
  await expect(tree).toContainText('Acme Civils');
  await tree.getByRole('button', { name: 'Expand' }).first().click();
  await tree.getByText('Embankment survey').click();
  await expect(page.locator('.filter-chip', { hasText: 'Embankment survey' })).toBeVisible();
  await expect(page.locator('[data-photo-item]')).toHaveCount(1);
});

test('a shared project opens read-only at its link', async ({ page, context }) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO, { client: 'Peak Water', project: 'Reservoir inspection' });
  const tree = page.locator('.client-tree');
  await tree.getByRole('button', { name: 'Expand' }).first().click();
  await tree.getByText('Reservoir inspection').hover(); // row actions show on hover
  await tree.getByRole('button', { name: 'Share project' }).click();
  const link = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(link).toMatch(/\/share\/[\w-]{32}$/);

  const shared = await context.newPage();
  await shared.goto(new URL(link).pathname);
  await expect(shared.getByRole('heading', { name: 'Reservoir inspection' })).toBeVisible();
  await expect(shared.getByText('1 photo on the map · read-only')).toBeVisible();
  await expect(shared.locator('.leaflet-marker-pane .photo-pin')).toHaveCount(1);
});
