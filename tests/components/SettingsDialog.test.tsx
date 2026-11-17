// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { SettingsDialog } from '../../src/components/SettingsDialog.tsx';

beforeAll(() => {
  // jsdom has no native <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INFO = {
  version: '1.3.0',
  counts: { photos: 8, projects: 2, clients: 2 },
  paths: { database: '/config/photos.db', uploads: '/config/uploads', backups: '/config/backups' },
  limits: { maxUploadMb: 60, apiRate: { limit: 1000, windowMs: 900000 } },
  trustProxyHops: 1,
};

function backupsReply(overrides = {}) {
  return {
    enabled: true,
    dir: '/config/backups',
    intervalHours: 24,
    keep: 7,
    includeUploads: true,
    backups: [
      {
        name: 'photomapper-backup-20261116-030000.zip',
        size: 3 * 1024 * 1024,
        createdAt: '2026-11-16T03:00:00.000Z',
      },
    ],
    scheduler: { enabled: true, intervalHours: 24, lastSuccessAt: '2026-11-16T03:00:00.000Z' },
    ...overrides,
  };
}

function stub(backups = backupsReply()) {
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const get = !opts.method || opts.method === 'GET';
    const body = url === '/api/info' ? INFO : url === '/api/backup' && get ? backups : {};
    return new Response(JSON.stringify(body), { status: opts.method === 'POST' ? 201 : 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SettingsDialog', () => {
  it('shows the instance and its backups', async () => {
    stub();
    render(<SettingsDialog open onClose={() => {}} onRestored={async () => {}} />);
    expect(await screen.findByText('8 photos · 2 projects · 2 clients')).toBeTruthy();
    expect(screen.getByText('/config/backups')).toBeTruthy();
    expect(screen.getByText('1000 per 15 min')).toBeTruthy();
    expect(screen.getByText('yes (1 hop)')).toBeTruthy();
    expect(screen.getByText('photomapper-backup-20261116-030000.zip')).toBeTruthy();
    expect(screen.getByText(/· 3.0 MB$/)).toBeTruthy();
    expect(screen.getByText(/^Latest /)).toBeTruthy();
    expect(screen.getByText(/^Daily, database and photos, keeping 7/)).toBeTruthy();
  });

  it('backs up now, then reloads', async () => {
    const fetchMock = stub();
    render(<SettingsDialog open onClose={() => {}} onRestored={async () => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u, o]) => u === '/api/backup' && o?.method === 'POST')
      ).toBe(true)
    );
  });

  it('says when the last scheduled backup failed, or the schedule is off', async () => {
    stub(backupsReply({ scheduler: { enabled: true, intervalHours: 24, lastError: 'disk full' } }));
    render(<SettingsDialog open onClose={() => {}} onRestored={async () => {}} />);
    expect(await screen.findByText('Last scheduled backup failed')).toBeTruthy();
    cleanup();
    stub(backupsReply({ enabled: false, backups: [] }));
    render(<SettingsDialog open onClose={() => {}} onRestored={async () => {}} />);
    expect(await screen.findByText('Schedule off')).toBeTruthy();
  });

  it('shows why when the settings cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"Boom"}', { status: 500 }))
    );
    render(<SettingsDialog open onClose={() => {}} onRestored={async () => {}} />);
    expect(await screen.findByText('Boom')).toBeTruthy();
  });
});
