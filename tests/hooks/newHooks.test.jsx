// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useShare } from '../../src/hooks/useShare.ts';
import { useUpload, DuplicatePhotoError } from '../../src/hooks/useUpload.ts';
import { useReset } from '../../src/hooks/useReset.ts';
import { useGeocode } from '../../src/hooks/useGeocode.ts';
import { useTimeline } from '../../src/hooks/useTimeline.ts';
import { useMediaQuery } from '../../src/hooks/useMediaQuery.ts';
import { useApiList } from '../../src/hooks/useApiList.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

function stubFetch(handler) {
  const fetchMock = vi.fn(async (url, opts = {}) => handler(String(url), opts));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useShare', () => {
  it('loads a share', async () => {
    stubFetch(() => json({ project: { name: 'P', color: '#fff' }, photos: [] }));
    const { result } = renderHook(() => useShare('tok'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.share.project.name).toBe('P');
  });

  it('tells a missing share from a failure', async () => {
    stubFetch(() => json({ error: 'Share not found' }, 404));
    const missing = renderHook(() => useShare('gone'));
    await waitFor(() => expect(missing.result.current.status).toBe('notfound'));
    stubFetch(() => json({ error: 'boom' }, 500));
    const failed = renderHook(() => useShare('x'));
    await waitFor(() => expect(failed.result.current.status).toBe('error'));
  });
});

describe('useUpload', () => {
  it('uploads a photo with its project, and reports duplicates', async () => {
    const fetchMock = stubFetch(() => json({ id: 'p1', hasGps: true }, 201));
    const { result } = renderHook(() => useUpload());
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await expect(result.current.uploadPhoto(file, 'proj1')).resolves.toMatchObject({ id: 'p1' });
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get('projectId')).toBe('proj1');

    stubFetch(() => json({ error: 'duplicate' }, 409));
    await expect(result.current.uploadPhoto(file, null)).rejects.toBeInstanceOf(
      DuplicatePhotoError
    );
    stubFetch(() => json({ error: 'Unsupported file type' }, 400));
    await expect(result.current.uploadPhoto(file, null)).rejects.toThrow('Unsupported file type');
  });

  it('creates a client and, when named, its first project', async () => {
    const fetchMock = stubFetch((url) =>
      url === '/api/clients' ? json({ id: 'c1' }, 201) : json({ id: 'pr1' }, 201)
    );
    const { result } = renderHook(() => useUpload());
    await expect(result.current.createClientWithProject('Acme', 'Survey')).resolves.toBe('pr1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      name: 'Survey',
      clientId: 'c1',
    });
    await expect(result.current.createClientWithProject('Solo', '')).resolves.toBeNull();
  });
});

describe('useReset and useGeocode', () => {
  it('call their endpoints', async () => {
    const fetchMock = stubFetch(() => json([]));
    const reset = renderHook(() => useReset()).result.current;
    await reset();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reset');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    const geocode = renderHook(() => useGeocode()).result.current;
    await geocode('Leeds & York');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/geocode/search?q=Leeds%20%26%20York');
  });
});

describe('useApiList', () => {
  it('loads on mount, reports errors, and reloads', async () => {
    let fail = true;
    stubFetch(() => (fail ? json({ error: 'Down' }, 503) : json([{ id: 1 }])));
    const { result } = renderHook(() => useApiList('/api/things'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Down');
    fail = false;
    await act(() => result.current.refresh());
    expect(result.current.items).toEqual([{ id: 1 }]);
    expect(result.current.error).toBeNull();
  });
});

describe('useTimeline', () => {
  const photos = ['2026-01-03', '2026-01-01', '2026-01-02'].map((d, i) => ({
    id: `p${i}`,
    dateTaken: `${d}T10:00:00Z`,
    uploadedAt: d,
  }));

  it('starts from the beginning when activated, and stops at the end', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimeline(photos));
    expect(result.current.sorted.map((p) => p.id)).toEqual(['p1', 'p2', 'p0']);
    act(() => result.current.setIndex(2));
    act(() => result.current.setActive(true));
    expect(result.current.index).toBe(0);
    act(() => result.current.setPlaying(true));
    act(() => vi.advanceTimersByTime(result.current.speed));
    act(() => vi.advanceTimersByTime(result.current.speed));
    expect(result.current.index).toBe(2);
    expect(result.current.playing).toBe(false);
    expect(result.current.slicePhotos).toHaveLength(3);
  });
});

describe('useMediaQuery', () => {
  it('follows the media query', () => {
    let listener;
    const list = {
      matches: false,
      addEventListener: (_e, fn) => (listener = fn),
      removeEventListener: () => {},
    };
    vi.stubGlobal('matchMedia', () => list);
    window.matchMedia = () => list;
    const { result } = renderHook(() => useMediaQuery('(max-width: 599px)'));
    expect(result.current).toBe(false);
    list.matches = true;
    act(() => listener());
    expect(result.current).toBe(true);
  });
});
