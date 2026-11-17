import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export { expect };

export const GPS_PHOTO = fileURLToPath(new URL('./fixtures/gps.jpg', import.meta.url));
export const NO_GPS_PHOTO = fileURLToPath(new URL('./fixtures/no-gps.jpg', import.meta.url));

// A 1×1 transparent PNG, served for every map tile so the tests never depend on the
// tile servers (or the network).
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/** Wipes every photo, project and client (the e2e server runs with ALLOW_RESET=true). */
export async function resetData(request: APIRequestContext): Promise<void> {
  await request.get('/'); // issues the CSRF cookie
  const { cookies } = await request.storageState();
  const token = cookies.find((c) => c.name === 'hhh_csrf')?.value ?? '';
  const res = await request.delete('/api/reset', { headers: { 'X-CSRF-Token': token } });
  expect(res.ok(), `reset failed: ${res.status()}`).toBe(true);
}

/** Uploads files through the sidebar, answering the "where should these go?" dialog. */
export async function upload(
  page: Page,
  files: string | string[],
  assign: { skip: true } | { client: string; project?: string } = { skip: true }
): Promise<void> {
  const drop = page.locator('.dropzone input[type="file"]');
  if ((await drop.count()) === 0) await page.getByRole('button', { name: 'Upload Photos' }).click();
  await drop.first().setInputFiles(files);
  const dialog = page.locator('.assign-modal');
  if (await dialog.isVisible().catch(() => false)) {
    if ('skip' in assign) {
      await dialog.getByRole('button', { name: 'No assignment' }).click();
    } else {
      await dialog.getByRole('button', { name: 'New client' }).click();
      await dialog.getByPlaceholder('e.g. Acme Corp').fill(assign.client);
      if (assign.project) await dialog.getByPlaceholder('e.g. Site Survey').fill(assign.project);
    }
    await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
  }
}

/**
 * Every test starts from an empty library, with map tiles stubbed, and fails if the
 * page logged an error or threw (a CSP violation, a crash, a failed request). A test
 * that provokes an error on purpose says so with `allowConsoleError(/pattern/)`.
 */
export const test = base.extend<{
  consoleErrors: string[];
  allowConsoleError: (pattern: RegExp) => void;
}>({
  allowConsoleError: async ({ consoleErrors }, use) => {
    await use((pattern) => {
      const kept = consoleErrors.filter((e) => !pattern.test(e));
      consoleErrors.splice(0, consoleErrors.length, ...kept);
    });
  },
  consoleErrors: [
    async ({ page, request, baseURL }, use) => {
      await resetData(request);
      const origin = new URL(baseURL ?? 'http://localhost').origin;
      await page.route(
        (url) => url.origin !== origin,
        (route) => route.fulfill({ contentType: 'image/png', body: BLANK_TILE })
      );
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
      page.on('console', (msg) => {
        // Chrome warns that COOP is ignored on a plain-HTTP test origin; not an app error.
        if (msg.type() === 'error' && !msg.text().includes('Cross-Origin-Opener-Policy'))
          errors.push(msg.text());
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});
