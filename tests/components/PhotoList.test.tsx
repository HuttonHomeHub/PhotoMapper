// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { PhotoList, type PhotoListProps } from '../../src/components/PhotoList.tsx';
import { must, photo } from '../factories.ts';

afterEach(cleanup);

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

const alpha = photo({
  id: 'a',
  originalName: 'Alpha.jpg',
  dateTaken: '2024-03-01',
  hasGps: true,
  locationName: 'Leeds',
  tags: ['roof'],
});
const bravo = photo({
  id: 'b',
  originalName: 'Bravo.jpg',
  dateTaken: null,
  uploadedAt: '2025-01-01T00:00:00.000Z',
  description: 'Gutter detail',
});
const charlie = photo({
  id: 'c',
  originalName: 'Charlie.jpg',
  dateTaken: '2023-06-01',
  hasGps: true,
  manualGps: true,
  tags: ['wall', 'roof', 'north', 'damp'],
  surveyDate: '2024-05-17',
});

function props(overrides: Partial<PhotoListProps> = {}): PhotoListProps {
  return {
    photos: [bravo, alpha, charlie],
    loading: false,
    onDelete: vi.fn(() => Promise.resolve()),
    onView: vi.fn(),
    activeTag: null,
    onTagClick: vi.fn(),
    selectionMode: false,
    selectedPhotoIds: new Set<string>(),
    onToggleSelection: vi.fn(),
    onToggleSelectionMode: vi.fn(),
    onBatchUpdate: vi.fn(() => Promise.resolve()),
    comparingPhotoId: null,
    onCompareClick: vi.fn(),
    onPlacePhoto: vi.fn(),
    onClearLocation: vi.fn(),
    placingPhotoId: null,
    toast: vi.fn(),
    hasActiveFilters: false,
    onClearAllFilters: vi.fn(),
    timelinePhotoId: null,
    ...overrides,
  };
}

type OptionalHandler = 'onTagClick' | 'onPlacePhoto' | 'onClearLocation' | 'toast';

/** Props with some optional handlers left out entirely. */
function propsWithout(
  keys: OptionalHandler[],
  overrides: Partial<PhotoListProps> = {}
): PhotoListProps {
  const { onTagClick, onPlacePhoto, onClearLocation, toast, ...rest } = props(overrides);
  const keep = (k: OptionalHandler) => !keys.includes(k);
  return {
    ...rest,
    ...(onTagClick && keep('onTagClick') ? { onTagClick } : {}),
    ...(onPlacePhoto && keep('onPlacePhoto') ? { onPlacePhoto } : {}),
    ...(onClearLocation && keep('onClearLocation') ? { onClearLocation } : {}),
    ...(toast && keep('toast') ? { toast } : {}),
  };
}

/** Photo names in the order the list shows them. */
function names(): string[] {
  return [...document.querySelectorAll('.photo-list-name')].map((el) => el.textContent ?? '');
}

function item(name: string): HTMLElement {
  return must(
    screen.getAllByRole('button', { name: new RegExp(`^${name}, `) })[0],
    `list item ${name}`
  );
}

describe('PhotoList loading and empty states', () => {
  it('shows a skeleton while loading, with no rows or controls', () => {
    const { container } = render(<PhotoList {...props({ loading: true })} />);
    expect(screen.getByLabelText('Loading photos…')).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton-item')).toHaveLength(6);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows "No photos yet" when there are no photos and no filters', () => {
    render(<PhotoList {...props({ photos: [] })} />);
    expect(screen.getByText('No photos yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('offers to clear filters when filters hide every photo', async () => {
    const p = props({ photos: [], hasActiveFilters: true });
    render(<PhotoList {...p} />);
    expect(screen.getByText('No photos match your filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(p.onClearAllFilters).toHaveBeenCalledTimes(1);
  });
});

describe('PhotoList rows', () => {
  it('shows each photo with its location status, tags, overflow and survey date', () => {
    render(<PhotoList {...props()} />);
    expect(names()).toEqual(['Bravo.jpg', 'Alpha.jpg', 'Charlie.jpg']);
    expect(within(item('Alpha.jpg')).getByText('Leeds')).toBeInTheDocument();
    expect(within(item('Bravo.jpg')).getByText('No GPS')).toBeInTheDocument();
    expect(within(item('Charlie.jpg')).getByText('Placed manually')).toBeInTheDocument();
    expect(item('Alpha.jpg')).toHaveAccessibleName('Alpha.jpg, on map');
    expect(item('Bravo.jpg')).toHaveAccessibleName('Bravo.jpg, no GPS');

    const charlieRow = item('Charlie.jpg');
    expect(within(charlieRow).getAllByRole('button', { name: /^Filter by tag/ })).toHaveLength(3);
    expect(within(charlieRow).getByText('+1')).toBeInTheDocument();
    expect(within(charlieRow).getByText('17/05/2024')).toBeInTheDocument();
    expect(within(item('Bravo.jpg')).queryByRole('button', { name: /^Filter by tag/ })).toBeNull();
  });

  it('shows "On map" for GPS photos without a place name', () => {
    render(<PhotoList {...props({ photos: [photo({ hasGps: true })] })} />);
    expect(screen.getByText('On map')).toBeInTheDocument();
  });

  it('uses the thumbnail, falling back to the full file, and the description as alt text', () => {
    render(
      <PhotoList
        {...props({
          photos: [photo({ id: 'x', thumbnailFilename: null, filename: 'x.jpg' }), bravo],
        })}
      />
    );
    expect(screen.getByRole('img', { name: 'P1.jpg' })).toHaveAttribute('src', '/uploads/x.jpg');
    expect(screen.getByRole('img', { name: 'Gutter detail' })).toHaveAttribute(
      'src',
      '/uploads/thumb_p1.jpg'
    );
  });

  it('opens a photo from its thumbnail', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'View Alpha.jpg' }));
    expect(p.onView).toHaveBeenCalledWith(alpha);
  });

  it('does nothing when the row itself is clicked outside selection mode', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    await userEvent.click(within(item('Alpha.jpg')).getByText('Leeds'));
    expect(p.onView).not.toHaveBeenCalled();
    expect(p.onToggleSelection).not.toHaveBeenCalled();
  });

  it('filters by a tag without opening the photo, and marks the active tag', async () => {
    const p = props({ activeTag: 'roof' });
    render(<PhotoList {...p} />);
    const wall = within(item('Charlie.jpg')).getByRole('button', { name: 'Filter by tag: wall' });
    await userEvent.click(wall);
    expect(p.onTagClick).toHaveBeenCalledWith('wall');
    expect(p.onView).not.toHaveBeenCalled();
    expect(wall).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(item('Alpha.jpg')).getByRole('button', { name: 'Filter by tag: roof' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('tolerates a missing tag handler', async () => {
    render(<PhotoList {...propsWithout(['onTagClick'])} />);
    await userEvent.click(
      within(item('Alpha.jpg')).getByRole('button', { name: 'Filter by tag: roof' })
    );
    expect(screen.getByText('Alpha.jpg')).toBeInTheDocument();
  });
});

describe('PhotoList placing and pins', () => {
  it('offers "Place on map" only for photos without GPS', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    const buttons = screen.getAllByRole('button', { name: /Place on map/ });
    expect(buttons).toHaveLength(1);
    await userEvent.click(must(buttons[0], 'place button'));
    expect(p.onPlacePhoto).toHaveBeenCalledWith(bravo);
    expect(p.onView).not.toHaveBeenCalled();
  });

  it('tells the user to click the map while that photo is being placed', () => {
    render(<PhotoList {...props({ placingPhotoId: 'b' })} />);
    expect(screen.getByRole('button', { name: /Click the map…/ })).toHaveClass('active');
  });

  it('offers "Remove pin" only for hand-placed photos', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    const buttons = screen.getAllByRole('button', { name: /Remove pin/ });
    expect(buttons).toHaveLength(1);
    await userEvent.click(must(buttons[0], 'remove pin button'));
    expect(p.onClearLocation).toHaveBeenCalledWith(charlie);
  });

  it('hides place and remove buttons when no handlers are given', () => {
    render(<PhotoList {...propsWithout(['onPlacePhoto', 'onClearLocation'])} />);
    expect(screen.queryByRole('button', { name: /Place on map/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove pin/ })).not.toBeInTheDocument();
  });
});

describe('PhotoList compare', () => {
  it('starts a comparison from the compare button', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    const btn = screen.getByRole('button', { name: 'Compare Alpha.jpg' });
    expect(btn).toHaveAttribute('title', 'Start comparison');
    await userEvent.click(btn);
    expect(p.onCompareClick).toHaveBeenCalledWith('a');
    expect(p.onView).not.toHaveBeenCalled();
    expect(screen.queryByText('Pick a second photo to compare')).not.toBeInTheDocument();
  });

  it('prompts for a second photo while comparing', () => {
    render(<PhotoList {...props({ comparingPhotoId: 'a' })} />);
    expect(screen.getByText('Pick a second photo to compare')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare Alpha.jpg' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Compare Alpha.jpg' })).toHaveAttribute(
      'title',
      'Start comparison'
    );
    expect(screen.getByRole('button', { name: 'Compare Bravo.jpg' })).toHaveAttribute(
      'title',
      'Compare with this photo'
    );
  });
});

describe('PhotoList search and sort', () => {
  it.each([
    ['name', 'charlie', ['Charlie.jpg']],
    ['description', 'GUTTER', ['Bravo.jpg']],
    ['tag', 'roof', ['Alpha.jpg', 'Charlie.jpg']],
    ['location', 'leeds', ['Alpha.jpg']],
  ])('matches on %s', async (_field, query, expected) => {
    render(<PhotoList {...props()} />);
    await userEvent.type(screen.getByRole('searchbox'), query);
    expect(names()).toEqual(expected);
  });

  it('ignores a whitespace-only search', async () => {
    render(<PhotoList {...props()} />);
    await userEvent.type(screen.getByRole('searchbox'), '   ');
    expect(names()).toHaveLength(3);
  });

  it('says when a search finds nothing', async () => {
    render(<PhotoList {...props()} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(names()).toEqual([]);
    expect(screen.getByText('No results for "zzz"')).toBeInTheDocument();
  });

  it.each([
    ['name-asc', ['Alpha.jpg', 'Bravo.jpg', 'Charlie.jpg']],
    ['name-desc', ['Charlie.jpg', 'Bravo.jpg', 'Alpha.jpg']],
    // Bravo has no dateTaken, so its upload date (2025) is used.
    ['date-asc', ['Charlie.jpg', 'Alpha.jpg', 'Bravo.jpg']],
    ['date-desc', ['Bravo.jpg', 'Alpha.jpg', 'Charlie.jpg']],
    ['gps-first', ['Alpha.jpg', 'Charlie.jpg', 'Bravo.jpg']],
    ['default', ['Bravo.jpg', 'Alpha.jpg', 'Charlie.jpg']],
  ])('sorts by %s', async (option, expected) => {
    render(<PhotoList {...props()} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort photos' }), option);
    expect(names()).toEqual(expected);
  });
});

describe('PhotoList keyboard navigation', () => {
  it('opens with Enter and moves between rows with the arrow keys', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    const user = userEvent.setup();
    item('Bravo.jpg').focus();
    await user.keyboard('{ArrowDown}');
    expect(item('Alpha.jpg')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(item('Charlie.jpg')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(item('Alpha.jpg')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(p.onView).toHaveBeenCalledWith(alpha);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(item('Bravo.jpg')).toHaveFocus();
  });

  it('rows are focusable only outside selection mode, and keys do nothing in it', () => {
    const p = props({ selectionMode: true });
    render(<PhotoList {...p} />);
    const row = item('Alpha.jpg');
    expect(row).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(p.onView).not.toHaveBeenCalled();
  });
});

describe('PhotoList timeline highlight', () => {
  it('highlights and scrolls to the timeline photo', () => {
    const { rerender } = render(<PhotoList {...props()} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<PhotoList {...props({ timelinePhotoId: 'c' })} />);
    expect(item('Charlie.jpg')).toHaveClass('timeline-active');
    expect(item('Alpha.jpg')).not.toHaveClass('timeline-active');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(item('Charlie.jpg'));
  });

  it('does not fail when the timeline photo is not in the list', () => {
    render(<PhotoList {...props({ timelinePhotoId: 'missing' })} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('PhotoList single delete', () => {
  it('asks for confirmation and deletes on confirm', async () => {
    let resolve: () => void = () => undefined;
    const onDelete = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const p = props({ onDelete });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha.jpg' }));
    expect(p.onView).not.toHaveBeenCalled();
    expect(screen.getByText('Delete photo?')).toBeInTheDocument();
    expect(screen.getByText('Alpha.jpg', { selector: '.confirm-modal-filename' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('a');
    expect(screen.queryByText('Delete photo?')).not.toBeInTheDocument();
    // While the delete is in flight the button is disabled and shows progress.
    const btn = screen.getByRole('button', { name: 'Delete Alpha.jpg' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('…');
    resolve();
    await waitFor(() => expect(btn).toBeEnabled());
    expect(btn).toHaveTextContent('✕');
    expect(p.toast).toHaveBeenCalledWith('Photo deleted', 'success');
  });

  it('cancels without deleting', async () => {
    const p = props();
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete photo?')).not.toBeInTheDocument();
    expect(p.onDelete).not.toHaveBeenCalled();
  });

  it('reports a failed delete', async () => {
    const p = props({ onDelete: vi.fn(() => Promise.reject(new Error('HTTP 500'))) });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(p.toast).toHaveBeenCalledWith('Could not delete: HTTP 500', 'error')
    );
    expect(screen.getByRole('button', { name: 'Delete Alpha.jpg' })).toBeEnabled();
  });

  it('works without a toast handler', async () => {
    const p = propsWithout(['toast']);
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(p.onDelete).toHaveBeenCalledWith('a'));
  });
});

describe('PhotoList selection mode', () => {
  it('toggles selection mode from the Select / Cancel button', async () => {
    const p = props();
    const { rerender } = render(<PhotoList {...p} />);
    const btn = screen.getByRole('button', { name: 'Select' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(p.onToggleSelectionMode).toHaveBeenCalledTimes(1);
    rerender(<PhotoList {...p} selectionMode />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects a photo by clicking its row or its checkbox, not opening it', async () => {
    const p = props({ selectionMode: true, selectedPhotoIds: new Set(['a']) });
    render(<PhotoList {...p} />);
    expect(screen.getByRole('checkbox', { name: 'Select Alpha.jpg' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bravo.jpg' })).not.toBeChecked();
    expect(item('Alpha.jpg')).toHaveClass('selected');

    await userEvent.click(within(item('Bravo.jpg')).getByText('No GPS'));
    expect(p.onToggleSelection).toHaveBeenLastCalledWith('b');
    expect(p.onToggleSelection).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Charlie.jpg' }));
    expect(p.onToggleSelection).toHaveBeenLastCalledWith('c');
    expect(p.onToggleSelection).toHaveBeenCalledTimes(2);
    expect(p.onView).not.toHaveBeenCalled();
  });

  it('clicking the thumbnail in selection mode toggles the photo once', async () => {
    // It used to toggle twice (the click bubbled to the row), so nothing changed.
    const p = props({ selectionMode: true });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'View Alpha.jpg' }));
    expect(p.onToggleSelection).toHaveBeenCalledTimes(1);
    expect(p.onView).not.toHaveBeenCalled();
  });

  it('shows the selection toolbar only when something is selected', () => {
    const { rerender } = render(<PhotoList {...props({ selectionMode: true })} />);
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    rerender(
      <PhotoList {...props({ selectionMode: true, selectedPhotoIds: new Set(['a', 'b']) })} />
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 2 selected photos' })).toBeInTheDocument();
  });
});

describe('PhotoList batch tag', () => {
  it('adds a tag to every selected photo with Enter', async () => {
    const p = props({ selectionMode: true, selectedPhotoIds: new Set(['a', 'b']) });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    const input = screen.getByPlaceholderText('Tag name');
    expect(input).toHaveFocus();
    // Enter with an empty value does nothing.
    await userEvent.keyboard('{Enter}');
    expect(p.onBatchUpdate).not.toHaveBeenCalled();
    await userEvent.type(input, '  facade  {Enter}');
    expect(p.onBatchUpdate).toHaveBeenCalledWith(['a', 'b'], {
      tags: ['facade'],
      mergeTags: true,
    });
    expect(p.toast).toHaveBeenCalledWith('Tag "facade" added to 2 photos', 'success');
    expect(screen.queryByPlaceholderText('Tag name')).not.toBeInTheDocument();
    // Reopening starts empty.
    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    expect(screen.getByPlaceholderText('Tag name')).toHaveValue('');
  });

  it('reports a failed batch tag instead of claiming success', async () => {
    const p = props({
      selectionMode: true,
      selectedPhotoIds: new Set(['a']),
      onBatchUpdate: vi.fn(() => Promise.reject(new Error('Server error'))),
    });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await userEvent.type(screen.getByPlaceholderText('Tag name'), 'x{Enter}');
    await waitFor(() =>
      expect(p.toast).toHaveBeenCalledWith('Could not add the tag: Server error', 'error')
    );
    expect(p.toast).not.toHaveBeenCalledWith(expect.stringContaining('added'), 'success');
  });

  it('uses the singular for one photo', async () => {
    const p = props({ selectionMode: true, selectedPhotoIds: new Set(['a']) });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await userEvent.type(screen.getByPlaceholderText('Tag name'), 'x{Enter}');
    expect(p.toast).toHaveBeenCalledWith('Tag "x" added to 1 photo', 'success');
  });

  it('closes the tag prompt with Escape or the cancel button, clearing the text', async () => {
    const p = propsWithout(['toast'], { selectionMode: true, selectedPhotoIds: new Set(['a']) });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    await userEvent.type(screen.getByPlaceholderText('Tag name'), 'half{Escape}');
    expect(screen.queryByPlaceholderText('Tag name')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    expect(screen.getByPlaceholderText('Tag name')).toHaveValue('');
    await userEvent.type(screen.getByPlaceholderText('Tag name'), 'half');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel tag' }));
    expect(screen.queryByPlaceholderText('Tag name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Tag' }));
    expect(screen.getByPlaceholderText('Tag name')).toHaveValue('');
    expect(p.onBatchUpdate).not.toHaveBeenCalled();
  });
});

describe('PhotoList batch delete', () => {
  it('confirms, shows progress, deletes each photo and reports success', async () => {
    const pending: (() => void)[] = [];
    const onDelete = vi.fn(
      () =>
        new Promise<void>((r) => {
          pending.push(r);
        })
    );
    const p = props({ selectionMode: true, selectedPhotoIds: new Set(['a', 'b']), onDelete });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2 selected photos' }));
    expect(screen.getByText('Delete 2 photos?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
    expect(screen.queryByText('Delete 2 photos?')).not.toBeInTheDocument();
    expect(screen.getByText('Deleting 0/2…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Tag' })).not.toBeInTheDocument();

    must(pending[0], 'first delete')();
    await screen.findByText('Deleting 1/2…');
    must(pending[1], 'second delete')();
    await waitFor(() => expect(p.toast).toHaveBeenCalledWith('2 photos deleted', 'success'));
    expect(onDelete.mock.calls).toEqual([['a'], ['b']]);
    expect(screen.queryByText(/Deleting/)).not.toBeInTheDocument();
  });

  it('uses the singular for one photo', async () => {
    const p = props({ selectionMode: true, selectedPhotoIds: new Set(['a']) });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete 1 selected photos' }));
    expect(screen.getByText('Delete 1 photo?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    await waitFor(() => expect(p.toast).toHaveBeenCalledWith('1 photo deleted', 'success'));
  });

  it('carries on past failures and reports them', async () => {
    const onDelete = vi.fn((id: string) =>
      id === 'b' ? Promise.reject(new Error('nope')) : Promise.resolve()
    );
    const p = props({ selectionMode: true, selectedPhotoIds: new Set(['a', 'b', 'c']), onDelete });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete 3 selected photos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete 3' }));
    await waitFor(() => expect(p.toast).toHaveBeenCalledWith('2 deleted, 1 failed', 'error'));
    expect(onDelete).toHaveBeenCalledTimes(3);
  });

  it('cancels the batch confirm without deleting', async () => {
    const p = propsWithout(['toast'], { selectionMode: true, selectedPhotoIds: new Set(['a']) });
    render(<PhotoList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete 1 selected photos' }));
    const dialog = must(document.querySelector<HTMLElement>('.confirm-modal-box'), 'dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete 1 photo?')).not.toBeInTheDocument();
    expect(p.onDelete).not.toHaveBeenCalled();
  });
});
