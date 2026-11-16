// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../../src/components/Toast.tsx';

afterEach(cleanup);

function Trigger() {
  const { toast } = useToast();
  // long duration so the auto-dismiss timer doesn't fire during the test
  return <button onClick={() => toast('Saved!', 'success', 100000)}>go</button>;
}

describe('Toast (context)', () => {
  it('shows a toast raised from a child and dismisses it on click', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByText('Saved!')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
  });

  it('useToast is a safe no-op outside a provider', () => {
    function Solo() {
      const { toast } = useToast();
      return <button onClick={() => toast('x')}>solo</button>;
    }
    render(<Solo />);
    // clicking must not throw
    fireEvent.click(screen.getByRole('button', { name: 'solo' }));
    expect(screen.getByRole('button', { name: 'solo' })).toBeInTheDocument();
  });
});
