// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useFocusTrap } from '../../src/hooks/useFocusTrap.ts';

afterEach(cleanup);

function Trap({
  active,
  empty = false,
}: {
  active?: boolean | undefined;
  empty?: boolean | undefined;
}) {
  const ref = useFocusTrap(active);
  return (
    <div ref={ref} tabIndex={-1} data-testid="trap">
      {!empty && (
        <>
          <button>First</button>
          <button disabled>Disabled</button>
          <input aria-label="Middle" />
          <button>Last</button>
        </>
      )}
    </div>
  );
}

function Page({ open, active, empty }: { open: boolean; active?: boolean; empty?: boolean }) {
  return (
    <>
      <button>Outside</button>
      {open && <Trap active={active} empty={empty} />}
    </>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when activated', () => {
    render(<Trap />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('wraps Tab from the last element back to the first', () => {
    render(<Trap />);
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    const notCancelled = fireEvent.keyDown(document, { key: 'Tab' });
    expect(notCancelled).toBe(false);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    render(<Trap />);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('leaves Tab alone when focus is not at either edge', () => {
    render(<Trap />);
    const middle = screen.getByRole('textbox', { name: 'Middle' });
    middle.focus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(middle).toHaveFocus();
  });

  it('ignores keys other than Tab', () => {
    render(<Trap />);
    screen.getByRole('button', { name: 'Last' }).focus();
    expect(fireEvent.keyDown(document, { key: 'Enter' })).toBe(true);
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('focuses the container itself when it has nothing focusable, and Tab is not trapped', () => {
    render(<Trap empty />);
    expect(screen.getByTestId('trap')).toHaveFocus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });

  it('does nothing while inactive', () => {
    render(<Page open active={false} />);
    expect(screen.getByRole('button', { name: 'First' })).not.toHaveFocus();
    screen.getByRole('button', { name: 'Last' }).focus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });

  it('restores focus to the previously focused element and stops trapping on close', () => {
    const { rerender } = render(<Page open={false} />);
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();
    rerender(<Page open />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    rerender(<Page open={false} />);
    expect(outside).toHaveFocus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });
});
