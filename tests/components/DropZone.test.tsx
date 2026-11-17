// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { SetStateAction } from 'react';
import { DropZone, type DropZoneProps } from '../../src/components/DropZone.tsx';
import type { UploadResult } from '../../src/components/UploadDrawer.tsx';
import { client, must, photo, project } from '../factories.ts';
import { stubFetch, type RouteReply } from '../fetchStub.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const acme = client({ id: 'c1', name: 'Acme' });
const beta = client({ id: 'c2', name: 'Beta' });
const siteA = project({ id: 'pr1', name: 'Site A', clientId: 'c1' });
const siteB = project({ id: 'pr2', name: 'Site B', clientId: 'c1' });

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

interface Upload {
  name: string;
  projectId: string | null;
}

/**
 * Stubs the API: uploads are answered by file name (gps → success, nogps → no GPS,
 * dup → 409, bad → 400), and client/project creation by `create`.
 */
function stubApi(create: (url: string, body: unknown) => RouteReply = () => ({ status: 201 })) {
  const uploads: Upload[] = [];
  const created: { url: string; body: unknown }[] = [];
  const fetchMock = stubFetch((url, init) => {
    if (url === '/api/photos' && init.body instanceof FormData) {
      const sent = init.body.get('photo');
      const name = sent instanceof File ? sent.name : '';
      const projectId = init.body.get('projectId');
      uploads.push({ name, projectId: typeof projectId === 'string' ? projectId : null });
      if (name.startsWith('dup')) return { status: 409, body: { error: 'duplicate' } };
      if (name.startsWith('bad')) return { status: 400, body: { error: 'Unsupported file type' } };
      return { status: 201, body: photo({ hasGps: name.startsWith('gps') }) };
    }
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    created.push({ url, body });
    return create(url, body);
  });
  return { fetchMock, uploads, created };
}

function setup(overrides: Partial<DropZoneProps> = {}) {
  let results: UploadResult[] = [];
  const setResults = vi.fn((value: SetStateAction<UploadResult[]>) => {
    results = typeof value === 'function' ? value(results) : value;
  });
  const props: DropZoneProps = {
    onUploadComplete: vi.fn(),
    openDrawer: vi.fn(),
    setResults,
    clients: [acme, beta],
    projects: [siteA, siteB],
    ...overrides,
  };
  const user = userEvent.setup();
  render(<DropZone {...props} />);
  const zone = screen.getByRole('button', { name: /Drop photos here/ });
  const input = must(zone.querySelector<HTMLInputElement>('input[type="file"]'), 'file input');
  return { props, user, zone, input, results: () => results };
}

/** Picks files with the input the way Chrome does: clearing the input empties its list. */
function pick(input: HTMLInputElement, files: File[]) {
  const live = [...files];
  Object.defineProperty(input, 'files', { configurable: true, get: () => live });
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => (live.length ? `C:\\fakepath\\${live[0]?.name ?? ''}` : ''),
    set: (v: string) => {
      if (v === '') live.length = 0;
    },
  });
  fireEvent.change(input);
  return live;
}

function drop(zone: HTMLElement, files: File[]) {
  fireEvent.drop(zone, { dataTransfer: { files } });
}

const statuses = (results: UploadResult[]) =>
  Object.fromEntries(results.map((r) => [r.name, [r.status, r.detail]]));

describe('DropZone', () => {
  it('highlights while dragging over and clears on leave', () => {
    const { zone } = setup();
    fireEvent.dragOver(zone);
    expect(zone).toHaveClass('active');
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass('active');
    fireEvent.dragOver(zone);
    drop(zone, []);
    expect(zone).not.toHaveClass('active');
  });

  it('opens the file picker on click and on Enter, not on other keys', () => {
    const { zone, input } = setup();
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(zone);
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(zone, { key: ' ' });
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('ignores a drop or pick with no files', () => {
    const { fetchMock } = stubApi();
    const { zone, input, props } = setup();
    drop(zone, []);
    pick(input, []);
    expect(screen.queryByText(/Where should/)).not.toBeInTheDocument();
    expect(props.openDrawer).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads straight into the active project and reports each result', async () => {
    const { uploads } = stubApi();
    const { zone, props, results } = setup({ activeProjectId: 'pr1' });
    drop(zone, [file('gps.jpg'), file('nogps.jpg'), file('dup.jpg'), file('bad.jpg')]);

    expect(screen.queryByText(/Where should/)).not.toBeInTheDocument();
    expect(props.openDrawer).toHaveBeenCalledTimes(1);
    expect(results().map((r) => r.status)).toEqual([
      'uploading',
      'uploading',
      'uploading',
      'uploading',
    ]);
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalledTimes(1));
    expect(uploads).toEqual([
      { name: 'gps.jpg', projectId: 'pr1' },
      { name: 'nogps.jpg', projectId: 'pr1' },
      { name: 'dup.jpg', projectId: 'pr1' },
      { name: 'bad.jpg', projectId: 'pr1' },
    ]);
    expect(statuses(results())).toEqual({
      'gps.jpg': ['success', null],
      'nogps.jpg': ['no-gps', 'No GPS data — pin not shown on map'],
      'dup.jpg': ['duplicate', 'Already uploaded'],
      'bad.jpg': ['error', 'Unsupported file type'],
    });
    // Each row keeps a unique key.
    expect(new Set(results().map((r) => r.id)).size).toBe(4);
  });

  it('does not report completion when nothing was uploaded', async () => {
    stubApi();
    const { zone, props, results } = setup({ activeProjectId: 'pr1' });
    drop(zone, [file('dup.jpg'), file('bad.jpg')]);
    await waitFor(() => expect(results().every((r) => r.status !== 'uploading')).toBe(true));
    expect(props.onUploadComplete).not.toHaveBeenCalled();
  });

  it('counts a photo without GPS as a completed upload', async () => {
    stubApi();
    const { zone, props } = setup({ activeProjectId: 'pr1' });
    drop(zone, [file('nogps.jpg')]);
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalledTimes(1));
  });

  it('uploads files picked with the input even though the input is then cleared', async () => {
    const { uploads } = stubApi();
    const { input, user, props } = setup();
    const live = pick(input, [file('gps-1.jpg'), file('gps-2.jpg')]);
    expect(live).toHaveLength(0); // the input was cleared so the same file can be picked again
    expect(screen.getByText('Where should these 2 photos go?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'No assignment' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalledTimes(1));
    expect(uploads.map((u) => u.name)).toEqual(['gps-1.jpg', 'gps-2.jpg']);
  });

  it('uploads into the active project straight from the input', async () => {
    const { uploads } = stubApi();
    const { input, props } = setup({ activeProjectId: 'pr2' });
    pick(input, [file('gps.jpg')]);
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalledTimes(1));
    expect(uploads).toEqual([{ name: 'gps.jpg', projectId: 'pr2' }]);
  });
});

describe('DropZone assignment dialog', () => {
  it('assigns to an existing client and project', async () => {
    const { uploads } = stubApi();
    const { zone, user, props } = setup({
      projects: [siteA, siteB, project({ id: 'pr3', name: 'Other', clientId: 'c2' })],
    });
    drop(zone, [file('gps-1.jpg'), file('gps-2.jpg')]);
    expect(screen.getByText('Where should these 2 photos go?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Existing client / project' })).toHaveClass('active');

    const [clientSelect, projectSelect] = screen.getAllByRole('combobox');
    const clientBox = must(clientSelect, 'client select');
    const projectBox = must(projectSelect, 'project select');
    // With no client chosen every project is offered.
    expect(projectBox).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument();

    await user.selectOptions(projectBox, 'pr3');
    // Choosing a client narrows the projects and clears the project choice.
    await user.selectOptions(clientBox, 'c1');
    expect(projectBox).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Other' })).not.toBeInTheDocument();
    await user.selectOptions(projectBox, 'pr2');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.queryByText(/Where should/)).not.toBeInTheDocument();
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalledTimes(1));
    expect(uploads).toEqual([
      { name: 'gps-1.jpg', projectId: 'pr2' },
      { name: 'gps-2.jpg', projectId: 'pr2' },
    ]);
  });

  it('uploads unassigned when no project is chosen, and disables the project list for a client without projects', async () => {
    const { uploads } = stubApi();
    const { zone, user, props } = setup();
    drop(zone, [file('gps.jpg')]);
    expect(screen.getByText('Where should this photo go?')).toBeInTheDocument();
    const [clientSelect, projectSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(must(clientSelect, 'client select'), 'c2');
    expect(projectSelect).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalled());
    expect(uploads).toEqual([{ name: 'gps.jpg', projectId: null }]);
  });

  it('creates a new client only, and uploads unassigned to a project', async () => {
    const { uploads, created } = stubApi(() => ({ status: 201, body: client({ id: 'c9' }) }));
    const { zone, user, props } = setup();
    drop(zone, [file('gps.jpg')]);
    await user.click(screen.getByRole('button', { name: 'New client' }));

    const upload = screen.getByRole('button', { name: 'Upload' });
    expect(upload).toBeDisabled();
    const name = screen.getByPlaceholderText('e.g. Acme Corp');
    expect(name).toHaveFocus();
    await user.type(name, '   ');
    expect(upload).toBeDisabled();
    await user.click(upload);
    expect(created).toEqual([]);

    await user.type(name, 'New Co ');
    expect(upload).toBeEnabled();
    await user.click(upload);
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalled());
    expect(created).toEqual([{ url: '/api/clients', body: { name: 'New Co' } }]);
    expect(uploads).toEqual([{ name: 'gps.jpg', projectId: null }]);
  });

  it('creates a new client with a project on Enter and uploads into it', async () => {
    const { uploads, created } = stubApi((url) =>
      url === '/api/clients'
        ? { status: 201, body: client({ id: 'c9' }) }
        : { status: 201, body: project({ id: 'pr9' }) }
    );
    const { zone, user, props } = setup({ clients: [] });
    drop(zone, [file('gps.jpg')]);
    // With no clients yet, the dialog starts on "New client" and has no existing mode.
    expect(
      screen.queryByRole('button', { name: 'Existing client / project' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New client' })).toHaveClass('active');

    // Enter does nothing while the client name is empty.
    await user.type(screen.getByPlaceholderText('e.g. Site Survey'), 'Survey 1{Enter}');
    expect(created).toEqual([]);
    await user.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'Acme');
    await user.type(screen.getByPlaceholderText('e.g. Site Survey'), '{Enter}');

    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalled());
    expect(created).toEqual([
      { url: '/api/clients', body: { name: 'Acme' } },
      {
        url: '/api/projects',
        body: { name: 'Survey 1', clientId: 'c9', status: 'active', color: '#3a86ff' },
      },
    ]);
    expect(uploads).toEqual([{ name: 'gps.jpg', projectId: 'pr9' }]);
  });

  it('submits from the client name field on Enter', async () => {
    const { uploads } = stubApi(() => ({ status: 201, body: client({ id: 'c9' }) }));
    const { zone, user, props } = setup({ clients: [] });
    drop(zone, [file('gps.jpg')]);
    await user.type(screen.getByPlaceholderText('e.g. Acme Corp'), '{Enter}');
    expect(screen.getByText(/Where should/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'Acme{Enter}');
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalled());
    expect(uploads).toHaveLength(1);
  });

  it('shows progress while creating and stays open when creating fails', async () => {
    let fail: (reply: RouteReply) => void = () => {};
    const pending = new Promise<RouteReply>((resolve) => {
      fail = resolve;
    });
    const fetchMock = vi.fn(async () => {
      const r = await pending;
      return new Response(JSON.stringify(r.body ?? null), { status: r.status ?? 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { zone, user, props } = setup({ clients: [] });
    drop(zone, [file('gps.jpg')]);
    await user.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    fail({ status: 500, body: { error: 'boom' } });
    expect(await screen.findByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.getByText(/Where should/)).toBeInTheDocument();
    // The dialog says why, instead of silently re-enabling the button.
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(props.openDrawer).not.toHaveBeenCalled();
  });

  it('ignores a second Enter while the client is still being created', async () => {
    // Pressing Enter twice used to create the client twice and upload every photo twice.
    let release: (reply: RouteReply) => void = () => {};
    const held = new Promise<RouteReply>((resolve) => {
      release = resolve;
    });
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        requests.push(url);
        const r = url === '/api/clients' ? await held : { status: 201, body: photo() };
        return new Response(JSON.stringify(r.body ?? null), { status: r.status ?? 200 });
      })
    );
    const { zone, user } = setup({ clients: [] });
    drop(zone, [file('gps.jpg')]);
    await user.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'Acme{Enter}{Enter}');
    release({ status: 201, body: client({ id: 'c9', name: 'Acme' }) });
    await waitFor(() => expect(requests).toContain('/api/photos'));
    expect(requests.filter((u) => u === '/api/clients')).toHaveLength(1);
    expect(requests.filter((u) => u === '/api/photos')).toHaveLength(1);
  });

  it('uploads without assignment from the skip mode', async () => {
    const { uploads } = stubApi();
    const { zone, user } = setup();
    drop(zone, [file('gps.jpg')]);
    await user.click(screen.getByRole('button', { name: 'No assignment' }));
    expect(screen.getByText(/Photos will upload without a client or project/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Existing client / project' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'No assignment' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(uploads).toEqual([{ name: 'gps.jpg', projectId: null }]));
  });

  it('skips assignment when the overlay is clicked, but not on clicks inside the dialog', async () => {
    const { uploads } = stubApi();
    const { zone, user, props } = setup();
    drop(zone, [file('gps.jpg')]);
    await user.click(screen.getByText('Where should this photo go?'));
    expect(screen.getByText(/Where should/)).toBeInTheDocument();

    const overlay = must(document.querySelector('.assign-modal-overlay'), 'overlay');
    await user.click(overlay);
    expect(screen.queryByText(/Where should/)).not.toBeInTheDocument();
    await waitFor(() => expect(props.onUploadComplete).toHaveBeenCalled());
    expect(uploads).toEqual([{ name: 'gps.jpg', projectId: null }]);
  });
});
