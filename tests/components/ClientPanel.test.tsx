// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ClientPanel, type ClientPanelProps } from '../../src/components/ClientPanel.tsx';
import { client, must, photo, project } from '../factories.ts';

afterEach(cleanup);

// FE-06: the navigation panel must distinguish "still loading" from "loaded but
// empty" and surface load errors with a retry.
const base = {
  clients: [],
  projects: [],
  photos: [],
  activeClientId: null,
  activeProjectId: null,
  activeSurveyDate: null,
  onSelectClient: vi.fn(),
  onSelectProject: vi.fn(),
  onSelectSurveyDate: vi.fn(),
  onUpdateClient: vi.fn(),
  onDeleteClient: vi.fn(),
  onUpdateProject: vi.fn(),
  onDeleteProject: vi.fn(),
};

describe('ClientPanel loading/empty/error states (FE-06)', () => {
  it('shows a loading hint while the first fetch is in flight (no empty hint)', () => {
    render(<ClientPanel {...base} loading={true} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText(/No clients yet/)).not.toBeInTheDocument();
  });

  it('shows the empty hint only once loaded with no clients', () => {
    render(<ClientPanel {...base} loading={false} />);
    expect(screen.getByText(/No clients yet/)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('shows an error with a working retry, and no empty/loading hint', () => {
    const onRetry = vi.fn();
    render(<ClientPanel {...base} loading={false} error="HTTP 500" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/No clients yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ─── Tree, selection, rename, delete and sharing ─────────────────────────────

const acme = client({ id: 'c1', name: 'Acme', projectCount: 2 });
const beta = client({ id: 'c2', name: 'Beta', projectCount: 0 });
const siteA = project({ id: 'pr1', name: 'Site A', clientId: 'c1', photoCount: 4 });
const siteB = project({
  id: 'pr2',
  name: 'Site B',
  clientId: 'c1',
  status: 'archived',
  shareToken: 'tok123',
});
const treePhotos = [
  photo({ id: 'a', projectId: 'pr1', surveyDate: '2026-03-05' }),
  photo({ id: 'b', projectId: 'pr1', surveyDate: '2026-03-05' }),
  photo({ id: 'c', projectId: 'pr1', surveyDate: '2026-04-01' }),
  photo({ id: 'd', projectId: 'pr1', surveyDate: null }),
  photo({ id: 'e', projectId: null, surveyDate: '2026-05-01' }),
];

function setup(overrides: Partial<ClientPanelProps> = {}) {
  const props: ClientPanelProps = {
    clients: [acme, beta],
    projects: [siteA, siteB],
    photos: treePhotos,
    activeClientId: null,
    activeProjectId: null,
    activeSurveyDate: null,
    onSelectClient: vi.fn(),
    onSelectProject: vi.fn(),
    onSelectSurveyDate: vi.fn(),
    onUpdateClient: vi.fn(() => Promise.resolve()),
    onDeleteClient: vi.fn(() => Promise.resolve()),
    onUpdateProject: vi.fn(() => Promise.resolve()),
    onDeleteProject: vi.fn(() => Promise.resolve()),
    onEnableShare: vi.fn(() => Promise.resolve()),
    onDisableShare: vi.fn(() => Promise.resolve()),
    toast: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  const view = render(<ClientPanel {...props} />);
  return { props, user, ...view };
}

/** The tree row (chevron, name, actions) holding the given name. */
function row(name: string): HTMLElement {
  return must(screen.getByText(name).closest('.client-tree-row'), `row for ${name}`);
}

function chevron(name: string): HTMLElement {
  return within(row(name)).getByRole('button', { name: /Expand|Collapse/ });
}

describe('ClientPanel tree', () => {
  it('expands and collapses clients and projects, showing survey dates with counts', async () => {
    const { user } = setup();
    expect(screen.queryByText('Site A')).not.toBeInTheDocument();
    expect(chevron('Acme')).toHaveAccessibleName('Expand');

    await user.click(chevron('Acme'));
    expect(chevron('Acme')).toHaveAccessibleName('Collapse');
    expect(screen.getByText('Site A')).toBeInTheDocument();
    expect(screen.getByText('Site B')).toBeInTheDocument();
    expect(screen.queryByText('Undated')).not.toBeInTheDocument();

    await user.click(chevron('Site A'));
    // Most recent first, displayed as DD/MM/YYYY, Undated last.
    const labels = [...document.querySelectorAll('.survey-date-label')].map((e) => e.textContent);
    expect(labels).toEqual(['01/04/2026', '05/03/2026', 'Undated']);
    expect(within(row('05/03/2026')).getByText('2')).toBeInTheDocument();
    expect(within(row('01/04/2026')).getByText('1')).toBeInTheDocument();
    expect(within(row('Undated')).getByText('1')).toBeInTheDocument();
    // The photo without a project is not counted anywhere.
    expect(screen.queryByText('01/05/2026')).not.toBeInTheDocument();

    await user.click(chevron('Site B'));
    expect(screen.getByText('No photos yet')).toBeInTheDocument();

    await user.click(chevron('Site A'));
    expect(screen.queryByText('Undated')).not.toBeInTheDocument();
    await user.click(chevron('Acme'));
    expect(screen.queryByText('Site A')).not.toBeInTheDocument();
  });

  it('selecting a client clears project and date, and expands it', async () => {
    const { user, props } = setup();
    await user.click(screen.getByText('Acme'));
    expect(props.onSelectClient).toHaveBeenCalledWith('c1');
    expect(props.onSelectProject).toHaveBeenCalledWith(null);
    expect(props.onSelectSurveyDate).toHaveBeenCalledWith(null);
    expect(screen.getByText('Site A')).toBeInTheDocument();
  });

  it('selecting a project selects its client and expands it', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    await user.click(screen.getByText('Site A'));
    expect(props.onSelectClient).toHaveBeenCalledWith('c1');
    expect(props.onSelectProject).toHaveBeenCalledWith('pr1');
    expect(props.onSelectSurveyDate).toHaveBeenCalledWith(null);
    expect(screen.getByText('Undated')).toBeInTheDocument();
  });

  it('marks the active client, project and survey date rows', () => {
    const first = setup({ activeClientId: 'c1' });
    expect(row('Acme')).toHaveClass('active');
    first.unmount();

    const second = setup({ activeClientId: 'c1', activeProjectId: 'pr1' });
    expect(row('Acme')).not.toHaveClass('active');
    expect(row('Site A')).toHaveClass('active');
    second.unmount();

    setup({ activeClientId: 'c1', activeProjectId: 'pr1', activeSurveyDate: 'undated' });
    expect(row('Site A')).not.toHaveClass('active');
    expect(row('Undated')).toHaveClass('active');
  });

  it('selects a survey date, and clicking the active one toggles it off', async () => {
    const { user, props } = setup({
      activeClientId: 'c1',
      activeProjectId: 'pr1',
      activeSurveyDate: '2026-03-05',
    });
    await user.click(screen.getByText('01/04/2026'));
    expect(props.onSelectClient).toHaveBeenLastCalledWith('c1');
    expect(props.onSelectProject).toHaveBeenLastCalledWith('pr1');
    expect(props.onSelectSurveyDate).toHaveBeenLastCalledWith('2026-04-01');

    await user.click(screen.getByText('Undated'));
    expect(props.onSelectSurveyDate).toHaveBeenLastCalledWith('undated');

    await user.click(screen.getByText('05/03/2026'));
    expect(props.onSelectSurveyDate).toHaveBeenLastCalledWith(null);
  });

  it('expands a client and project when they become active', () => {
    const { props, rerender } = setup();
    expect(screen.queryByText('Site A')).not.toBeInTheDocument();

    rerender(<ClientPanel {...props} activeClientId="c1" />);
    expect(screen.getByText('Site A')).toBeInTheDocument();
    expect(screen.queryByText('Undated')).not.toBeInTheDocument();

    rerender(<ClientPanel {...props} activeClientId="c1" activeProjectId="pr1" />);
    expect(screen.getByText('Undated')).toBeInTheDocument();

    // Going back to nothing active leaves the tree as the user had it.
    rerender(<ClientPanel {...props} />);
    expect(screen.getByText('Undated')).toBeInTheDocument();
  });

  it('toggles a project between active and archived', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    await user.click(screen.getByRole('button', { name: 'active' }));
    expect(props.onUpdateProject).toHaveBeenCalledWith('pr1', {
      name: 'Site A',
      clientId: 'c1',
      color: siteA.color,
      status: 'archived',
    });
    await user.click(screen.getByTitle('Mark as active'));
    expect(props.onUpdateProject).toHaveBeenLastCalledWith(
      'pr2',
      expect.objectContaining({ status: 'active' })
    );
    expect(props.onSelectProject).not.toHaveBeenCalled();
  });

  it('reports a failed status change', async () => {
    const { user, props } = setup({
      activeClientId: 'c1',
      onUpdateProject: vi.fn(() => Promise.reject(new Error('Server error'))),
    });
    await user.click(screen.getByRole('button', { name: 'active' }));
    await waitFor(() => expect(props.toast).toHaveBeenCalledWith('Server error', 'error'));
  });
});

describe('ClientPanel inline rename', () => {
  it('renames a client on Enter with the trimmed name', async () => {
    const { user, props } = setup();
    await user.dblClick(screen.getByText('Acme'));
    const input = screen.getByDisplayValue('Acme');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '  Acme Ltd  {Enter}');
    expect(props.onUpdateClient).toHaveBeenCalledTimes(1);
    expect(props.onUpdateClient).toHaveBeenCalledWith('c1', { name: 'Acme Ltd' });
    expect(screen.queryByDisplayValue(/Acme/)).not.toBeInTheDocument();
  });

  it('cancels a client rename on Escape', async () => {
    const { user, props } = setup();
    await user.dblClick(screen.getByText('Acme'));
    // A double-click is also two clicks, which select the client (as in a browser).
    expect(props.onSelectClient).toHaveBeenCalledWith('c1');
    vi.mocked(props.onSelectClient).mockClear();
    const input = screen.getByDisplayValue('Acme');
    await user.type(input, 'xyz');
    await user.click(input); // clicks inside the input do not select the client
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(props.onUpdateClient).not.toHaveBeenCalled();
    expect(props.onSelectClient).not.toHaveBeenCalled();
  });

  it('commits a client rename on blur, but not an empty name', async () => {
    const { user, props } = setup();
    await user.dblClick(screen.getByText('Beta'));
    await user.clear(screen.getByDisplayValue('Beta'));
    await user.type(screen.getByRole('textbox'), '   ');
    fireEvent.blur(screen.getByRole('textbox'));
    expect(props.onUpdateClient).not.toHaveBeenCalled();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    await user.dblClick(screen.getByText('Beta'));
    await user.type(screen.getByDisplayValue('Beta'), ' Co');
    fireEvent.blur(screen.getByRole('textbox'));
    expect(props.onUpdateClient).toHaveBeenCalledWith('c2', { name: 'Beta Co' });
  });

  it('renames a project on Enter, cancels on Escape, commits on blur, ignores empty', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    await user.dblClick(screen.getByText('Site A'));
    vi.mocked(props.onSelectProject).mockClear();
    const input = screen.getByDisplayValue('Site A');
    await user.clear(input);
    await user.type(input, ' North {Enter}');
    expect(props.onUpdateProject).toHaveBeenCalledWith('pr1', { name: 'North' });
    // Typing and clicking inside the input do not select the project.
    expect(props.onSelectProject).not.toHaveBeenCalled();

    await user.dblClick(screen.getByText('Site B'));
    await user.type(screen.getByDisplayValue('Site B'), 'x');
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(props.onUpdateProject).toHaveBeenCalledTimes(1);

    await user.dblClick(screen.getByText('Site B'));
    await user.clear(screen.getByDisplayValue('Site B'));
    fireEvent.blur(screen.getByRole('textbox'));
    expect(props.onUpdateProject).toHaveBeenCalledTimes(1);

    await user.dblClick(screen.getByText('Site B'));
    await user.type(screen.getByDisplayValue('Site B'), '2');
    fireEvent.blur(screen.getByRole('textbox'));
    expect(props.onUpdateProject).toHaveBeenLastCalledWith('pr2', { name: 'Site B2' });
  });
});

describe('ClientPanel delete', () => {
  it('asks before deleting a client, and does nothing on cancel', async () => {
    const { user, props } = setup();
    await user.click(within(row('Acme')).getByTitle('Delete'));
    expect(screen.getByText('Delete client?')).toBeInTheDocument();
    expect(screen.getByText(/Its projects will be unassigned/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete client?')).not.toBeInTheDocument();
    expect(props.onDeleteClient).not.toHaveBeenCalled();
    expect(props.onSelectClient).not.toHaveBeenCalled();

    await user.click(within(row('Acme')).getByTitle('Delete'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDeleteClient).toHaveBeenCalledWith('c1');
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete client?')).not.toBeInTheDocument();
  });

  it('asks before deleting a project', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    await user.click(within(row('Site B')).getByTitle('Delete'));
    expect(screen.getByText('Delete project?')).toBeInTheDocument();
    expect(screen.getByText(/Its photos will be unassigned/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDeleteProject).toHaveBeenCalledWith('pr2');
    expect(props.onDeleteClient).not.toHaveBeenCalled();
    expect(props.onSelectProject).not.toHaveBeenCalled();
  });
});

describe('ClientPanel sharing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubClipboard(writeText: (text: string) => Promise<void>) {
    const fn = vi.fn(writeText);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: fn }, configurable: true });
    return fn;
  }

  it('creates a link for an unshared project, then shows it once it has a token', async () => {
    const { user, props, rerender } = setup({ activeClientId: 'c1' });
    await user.click(within(row('Site A')).getByRole('button', { name: 'Share project' }));
    expect(props.onEnableShare).toHaveBeenCalledWith('pr1');
    expect(props.onSelectProject).not.toHaveBeenCalled();
    // No token yet in this render: nothing to show.
    expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument();

    const shared = { ...siteA, shareToken: 'newtok' };
    rerender(<ClientPanel {...props} projects={[shared, siteB]} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(
      `${window.location.origin}/share/newtok`
    );
  });

  it('opens and closes the panel of an already shared project without re-enabling', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    const manage = within(row('Site B')).getByRole('button', { name: 'Manage share link' });
    expect(manage).toHaveClass('active');
    await user.click(manage);
    expect(props.onEnableShare).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Share link');
    expect(input).toHaveValue(`${window.location.origin}/share/tok123`);
    await user.click(input);
    expect(props.onSelectProject).not.toHaveBeenCalled();
    await user.click(manage);
    expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument();
  });

  it('copies the link and reports success', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    const writeText = stubClipboard(() => Promise.resolve());
    await user.click(within(row('Site B')).getByRole('button', { name: 'Manage share link' }));
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/tok123`);
    expect(props.toast).toHaveBeenCalledWith('Share link copied', 'success');
  });

  it('reports a failed copy', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    stubClipboard(() => Promise.reject(new Error('denied')));
    await user.click(within(row('Site B')).getByRole('button', { name: 'Manage share link' }));
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(props.toast).toHaveBeenCalledWith(
        'Could not copy — select and copy the link manually',
        'error'
      )
    );
  });

  it('stops sharing and closes the panel', async () => {
    const { user, props } = setup({ activeClientId: 'c1' });
    await user.click(within(row('Site B')).getByRole('button', { name: 'Manage share link' }));
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(props.onDisableShare).toHaveBeenCalledWith('pr2');
    expect(props.toast).toHaveBeenCalledWith('Sharing stopped', 'info');
    expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument();
  });

  it('keeps the panel open and shows the error when stopping fails', async () => {
    const { user, props } = setup({
      activeClientId: 'c1',
      onDisableShare: vi.fn(() => Promise.reject(new Error('Server said no'))),
    });
    await user.click(within(row('Site B')).getByRole('button', { name: 'Manage share link' }));
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(props.toast).toHaveBeenCalledWith('Server said no', 'error'));
    expect(screen.getByLabelText('Share link')).toBeInTheDocument();
  });

  it('falls back to a generic message when stopping fails without one', async () => {
    const { user, props } = setup({
      activeClientId: 'c1',
      onDisableShare: vi.fn(() => Promise.reject(new Error(''))),
    });
    await user.click(within(row('Site B')).getByRole('button', { name: 'Manage share link' }));
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() =>
      expect(props.toast).toHaveBeenCalledWith('Could not stop sharing', 'error')
    );
  });

  it('shows an error when creating a link fails', async () => {
    const { user, props } = setup({
      activeClientId: 'c1',
      onEnableShare: vi.fn(() => Promise.reject(new Error('Quota reached'))),
    });
    await user.click(within(row('Site A')).getByRole('button', { name: 'Share project' }));
    await waitFor(() => expect(props.toast).toHaveBeenCalledWith('Quota reached', 'error'));

    const fallback = vi.fn(() => Promise.reject(new Error('')));
    cleanup();
    const second = setup({ activeClientId: 'c1', onEnableShare: fallback });
    await second.user.click(within(row('Site A')).getByRole('button', { name: 'Share project' }));
    await waitFor(() =>
      expect(second.props.toast).toHaveBeenCalledWith('Could not create share link', 'error')
    );
  });

  it('works without share callbacks or a toast', async () => {
    const user = userEvent.setup();
    render(
      <ClientPanel {...base} clients={[acme]} projects={[siteA, siteB]} activeClientId="c1" />
    );
    await user.click(within(row('Site B')).getByRole('button', { name: 'Manage share link' }));
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument();
  });
});
