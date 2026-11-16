// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { UploadDrawer } from '../../src/components/UploadDrawer.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const done = [
  { id: '1', name: 'a.jpg', status: 'success' },
  { id: '2', name: 'b.jpg', status: 'duplicate', detail: 'Already uploaded' },
];

function drawer(props) {
  return <UploadDrawer results={done} open onClose={() => {}} onClear={() => {}} {...props} />;
}

describe('UploadDrawer', () => {
  it('shows progress, then closes itself once every upload has finished', () => {
    vi.useFakeTimers();
    const onAllDone = vi.fn();
    const { rerender } = render(
      drawer({ results: [{ id: '1', name: 'a.jpg', status: 'uploading' }], onAllDone })
    );
    expect(screen.getByText('Uploading…')).toBeTruthy();
    rerender(drawer({ onAllDone }));
    expect(screen.getByText('Upload complete')).toBeTruthy();
    expect(screen.getByText('Already uploaded')).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(onAllDone).toHaveBeenCalledTimes(1);
  });

  it('stays open when asked, until it is closed', () => {
    vi.useFakeTimers();
    const onAllDone = vi.fn();
    const { rerender } = render(drawer({ onAllDone }));
    fireEvent.click(screen.getByText('Keep open'));
    act(() => vi.advanceTimersByTime(5000));
    expect(onAllDone).not.toHaveBeenCalled();
    // Closing ends "keep open": next time it closes itself again.
    rerender(drawer({ onAllDone, open: false }));
    rerender(drawer({ onAllDone, open: true }));
    expect(screen.getByText('Keep open')).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(onAllDone).toHaveBeenCalledTimes(1);
  });
});
