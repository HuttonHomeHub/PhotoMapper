// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePhotos } from '../../src/hooks/usePhotos.ts';
import { useClients } from '../../src/hooks/useClients.ts';
import { useProjects } from '../../src/hooks/useProjects.ts';
import { useAppVersion, useSettings } from '../../src/hooks/useSettings.ts';
import { isGet, stubFetch, type Route } from '../fetchStub.ts';
import { client, must, photo, project } from '../factories.ts';

afterEach(() => vi.unstubAllGlobals());

/** Every request the stub saw, as "METHOD url". */
const seen = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);

const bodyOf = (fetchMock: ReturnType<typeof stubFetch>, n: number): unknown =>
  JSON.parse(String(must(fetchMock.mock.calls[n], `call ${n}`)[1]?.body));

describe('usePhotos actions', () => {
  const start = [photo({ id: 'a' }), photo({ id: 'b' })];
  const route: Route = (url, init) => {
    if (url === '/api/photos' && isGet(init)) return { body: start };
    if (url === '/api/photos/a' && init.method === 'PATCH')
      return { body: photo({ id: 'a', description: 'edited', surveyDate: '2026-03-01' }) };
    if (url === '/api/photos/a/location' && init.method === 'PUT')
      return { body: photo({ id: 'a', hasGps: true, manualGps: true, lat: 1, lng: 2 }) };
    if (url === '/api/photos/a/location' && init.method === 'DELETE')
      return { body: photo({ id: 'a' }) };
    if (url === '/api/photos/b' && init.method === 'DELETE')
      return { status: 404, body: { error: 'Photo not found' } };
    return { body: {} };
  };

  it('edits, places and unpins a photo, keeping the list in step', async () => {
    const fetchMock = stubFetch(route);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.photos).toHaveLength(2));

    await act(() => result.current.updatePhoto('a', { description: 'edited' }));
    expect(result.current.photos[0]?.description).toBe('edited');
    expect(bodyOf(fetchMock, 1)).toEqual({ description: 'edited' });

    await act(() => result.current.updatePhotoSurveyDate('a', '2026-03-01'));
    expect(bodyOf(fetchMock, 2)).toEqual({ surveyDate: '2026-03-01' });
    await act(() => result.current.updatePhotoProject('a', 'pr1'));
    expect(bodyOf(fetchMock, 3)).toEqual({ projectId: 'pr1' });

    await act(() => result.current.setPhotoLocation('a', 1, 2));
    expect(result.current.photos[0]?.manualGps).toBe(true);
    expect(bodyOf(fetchMock, 4)).toEqual({ lat: 1, lng: 2 });

    await act(() => result.current.clearPhotoLocation('a'));
    expect(result.current.photos[0]?.manualGps).toBe(false);
  });

  it("reports the server's message when a delete fails", async () => {
    stubFetch(route);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.photos).toHaveLength(2));
    await expect(result.current.deletePhoto('b')).rejects.toThrow('Photo not found');
    expect(result.current.photos).toHaveLength(2);
  });

  it('batch-updates and batch-deletes, then reloads', async () => {
    const fetchMock = stubFetch(route);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.photos).toHaveLength(2));
    await act(() => result.current.batchUpdate(['a', 'b'], { tags: ['x'], mergeTags: true }));
    expect(seen(fetchMock)).toContain('PATCH /api/photos/batch');
    expect(bodyOf(fetchMock, 1)).toEqual({ ids: ['a', 'b'], tags: ['x'], mergeTags: true });
    // One delete fails (404); the reload still happens.
    await act(() => result.current.batchDelete(['a', 'b']));
    expect(seen(fetchMock).filter((r) => r === 'GET /api/photos')).toHaveLength(3);
  });

  it('exports by following a download link', () => {
    stubFetch(route);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => usePhotos());
    result.current.exportPhotos('kml');
    const link = must(click.mock.contexts[0], 'clicked link') as HTMLAnchorElement;
    expect(link.href).toMatch(/\/api\/photos\/export\?format=kml$/);
    expect(link.download).toBe('photos.kml');
    click.mockRestore();
  });

  it('shows a load failure as an error', async () => {
    stubFetch(() => ({ status: 503, body: { error: 'Database unavailable' } }));
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Database unavailable');
  });
});

describe('useProjects actions', () => {
  it('creates, renames, assigns, shares and unshares projects', async () => {
    const onPhotosChanged = vi.fn();
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/projects' && isGet(init)) return { body: [project({ id: 'p1' })] };
      if (url === '/api/projects' && init.method === 'POST')
        return { status: 201, body: project({ id: 'p2', name: 'New' }) };
      if (url === '/api/projects/p1' && init.method === 'PATCH')
        return { body: project({ id: 'p1', name: 'Renamed' }) };
      if (url === '/api/projects/p1/share' && init.method === 'POST')
        return { body: { id: 'p1', shareToken: 'tok' } };
      return { body: {} };
    });
    const { result } = renderHook(() => useProjects({ onPhotosChanged }));
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    await act(() => result.current.createProject({ name: 'New' }));
    expect(result.current.projects.map((p) => p.id)).toEqual(['p2', 'p1']);
    await act(() => result.current.updateProject('p1', { name: 'Renamed' }));
    expect(result.current.projects[1]?.name).toBe('Renamed');

    await act(() => result.current.assignToProject('p1', ['a', 'b']));
    expect(onPhotosChanged).toHaveBeenCalledTimes(1);
    expect(seen(fetchMock)).toContain('PATCH /api/projects/p1/photos');

    let token = '';
    await act(async () => {
      token = await result.current.enableShare('p1');
    });
    expect(token).toBe('tok');
    expect(result.current.projects.find((p) => p.id === 'p1')?.shareToken).toBe('tok');
    await act(() => result.current.disableShare('p1'));
    expect(result.current.projects.find((p) => p.id === 'p1')?.shareToken).toBeNull();
  });

  it('re-reads the list when a delete fails, instead of hiding the project', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/projects' && isGet(init)) return { body: [project({ id: 'p1' })] };
      return { status: 500, body: { error: 'boom' } };
    });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    await act(() => result.current.deleteProject('p1'));
    expect(result.current.projects).toHaveLength(1);
    expect(seen(fetchMock).filter((r) => r === 'GET /api/projects')).toHaveLength(2);
  });
});

describe('useClients actions', () => {
  it('renames a client, and re-reads the list when a delete fails', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/clients' && isGet(init)) return { body: [client({ id: 'c1' })] };
      if (url === '/api/clients/c1' && init.method === 'PATCH')
        return { body: client({ id: 'c1', name: 'Acme' }) };
      return { status: 500, body: { error: 'boom' } };
    });
    const { result } = renderHook(() => useClients());
    await waitFor(() => expect(result.current.clients).toHaveLength(1));
    await act(() => result.current.updateClient('c1', { name: 'Acme' }));
    expect(result.current.clients[0]?.name).toBe('Acme');
    await act(() => result.current.deleteClient('c1'));
    expect(result.current.clients).toHaveLength(1);
    expect(seen(fetchMock).filter((r) => r === 'GET /api/clients')).toHaveLength(2);
  });
});

describe('useSettings actions', () => {
  const info = { version: '1.3.0', counts: { photos: 0, projects: 0, clients: 0 } };
  const backups = { enabled: true, backups: [], scheduler: { enabled: true, intervalHours: 24 } };

  it('backs up now and restores (by name or upload), reloading after each', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/info') return { body: info };
      if (url === '/api/backup' && isGet(init)) return { body: backups };
      if (url === '/api/backup/restore')
        return { body: { safetyBackup: 's.zip', restoredUploads: true, counts: info.counts } };
      return { status: 201, body: {} };
    });
    const { result } = renderHook(() => useSettings(true));
    await waitFor(() => expect(result.current.info).not.toBeNull());

    await act(() => result.current.backupNow());
    await act(async () => {
      await result.current.restore('photomapper-backup-20260101-000000.zip');
      await result.current.uploadRestore(new File(['zip'], 'mine.zip'));
    });
    const restores = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/backup/restore');
    expect(restores).toHaveLength(2);
    expect(must(restores[1], 'upload restore')[1]?.body).toBeInstanceOf(FormData);
    expect(seen(fetchMock).filter((r) => r === 'GET /api/info')).toHaveLength(4);
  });

  it('loads nothing while closed, and reports a load failure', async () => {
    const fetchMock = stubFetch(() => ({ status: 500, body: { error: 'Unavailable' } }));
    const { result, rerender } = renderHook(({ open }) => useSettings(open), {
      initialProps: { open: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current.error).toBe('Unavailable'));
  });

  it('reads the running version for the app bar', async () => {
    stubFetch(() => ({ body: { version: '1.3.0' } }));
    const { result } = renderHook(() => useAppVersion());
    await waitFor(() => expect(result.current).toBe('1.3.0'));
    stubFetch(() => ({ status: 404, body: {} }));
    const failed = renderHook(() => useAppVersion());
    await waitFor(() => expect(failed.result.current).toBe(''));
  });
});
