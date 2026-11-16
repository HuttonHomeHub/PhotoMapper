// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary.tsx';

// TEST-03: jsdom component harness. Also lands FE-01's full render coverage.

afterEach(cleanup);

function Boom() {
  throw new Error('kaboom');
}

describe('ErrorBoundary (render)', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>hello world</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('shows the fallback with the error message when a child throws', () => {
    // React (and componentDidCatch) log the error; silence for a clean run.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
