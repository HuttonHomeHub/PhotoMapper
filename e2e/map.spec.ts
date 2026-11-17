import { GPS_PHOTO, expect, test, upload } from './fixtures.ts';

// The heatmap comes from heatmap.js, a UMD library patched in src/lib and bundled
// through a CommonJS step (see vite.config.js). This checks it really draws, so a
// bundler change that breaks that step fails here rather than in someone's browser.
test('the heatmap overlay draws over the photo locations', async ({ page }) => {
  await page.goto('/');
  await upload(page, GPS_PHOTO);
  await expect(page.locator('.leaflet-marker-pane .photo-pin')).toHaveCount(1);

  await page.getByRole('button', { name: 'Heatmap' }).click();
  await expect(page.locator('.map-legend')).toContainText('dense');
  await expect(page.locator('.leaflet-marker-pane .photo-pin')).toHaveCount(0);

  const canvas = page.locator('.leaflet-overlay-pane canvas').first();
  await expect(canvas).toBeAttached();
  // Some pixel of the heat layer must be painted (alpha > 0).
  await expect
    .poll(() =>
      // Browser code as a string: the e2e TypeScript project has no DOM types.
      page.evaluate(`(() => {
        const c = document.querySelector('.leaflet-overlay-pane canvas');
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
        return painted;
      })()`)
    )
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Heatmap' }).click();
  await expect(page.locator('.leaflet-marker-pane .photo-pin')).toHaveCount(1);
});
