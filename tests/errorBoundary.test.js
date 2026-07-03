import { describe, it, expect } from 'vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary.jsx';

// FE-01: state-logic coverage without a DOM. Full render behaviour is covered
// once the jsdom component harness lands (TEST-03).
describe('ErrorBoundary', () => {
  it('derives error state from a thrown error', () => {
    const err = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });
});
