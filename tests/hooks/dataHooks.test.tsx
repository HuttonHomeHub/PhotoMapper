// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePhotos } from '../../src/hooks/usePhotos.ts';
import { useClients } from '../../src/hooks/useClients.ts';
import { useProjects } from '../../src/hooks/useProjects.ts';
import { isGet, stubFetch } from '../fetchStub.ts';

afterEach(() => vi.unstubAllGlobals());

describe('usePhotos', () => {
  it('loads photos on mount; deletePhoto removes from state', async () => {
    stubFetch((url: string, opts: RequestInit) => {
      if (url === '/api/photos' && isGet(opts)) return { body: [{ id: 'a' }, { id: 'b' }] };
      if (url.startsWith('/api/photos/') && opts.method === 'DELETE') return { body: { id: 'a' } };
      return { body: [] };
    });
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.photos).toHaveLength(2));
    await act(async () => {
      await result.current.deletePhoto('a');
    });
    expect(result.current.photos.map((p) => p.id)).toEqual(['b']);
  });
});

describe('useClients', () => {
  it('loads on mount; createClient appends', async () => {
    stubFetch((url: string, opts: RequestInit) => {
      if (url === '/api/clients' && isGet(opts)) return { body: [{ id: 'c1', name: 'A' }] };
      if (url === '/api/clients' && opts.method === 'POST')
        return { body: { id: 'c2', name: 'B' } };
      return { body: [] };
    });
    const { result } = renderHook(() => useClients());
    await waitFor(() => expect(result.current.clients).toHaveLength(1));
    await act(async () => {
      await result.current.createClient({ name: 'B' });
    });
    expect(result.current.clients.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

describe('useProjects', () => {
  it('deleteProject removes it and notifies onPhotosChanged', async () => {
    const onPhotosChanged = vi.fn().mockResolvedValue(undefined);
    stubFetch((url: string, opts: RequestInit) => {
      if (url === '/api/projects' && isGet(opts)) return { body: [{ id: 'p1' }] };
      if (url.startsWith('/api/projects/') && opts.method === 'DELETE')
        return { body: { id: 'p1' } };
      return { body: [] };
    });
    const { result } = renderHook(() => useProjects({ onPhotosChanged }));
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    await act(async () => {
      await result.current.deleteProject('p1');
    });
    expect(result.current.projects).toHaveLength(0);
    expect(onPhotosChanged).toHaveBeenCalled();
  });
});
