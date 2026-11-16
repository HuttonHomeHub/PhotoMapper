// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterChips } from '../../src/components/FilterChips.tsx';

afterEach(cleanup);

const base = {
  isFiltered: false,
  activeTag: null,
  regionPolygon: null,
  activeClientId: null,
  activeProjectId: null,
  activeSurveyDate: null,
  clients: [],
  projects: [],
  onClearDate: vi.fn(),
  onClearTag: vi.fn(),
  onClearRegion: vi.fn(),
  onClearClient: vi.fn(),
  onClearProject: vi.fn(),
  onClearSurvey: vi.fn(),
  onClearAll: vi.fn(),
};

describe('FilterChips', () => {
  it('renders nothing when no filter is active', () => {
    const { container } = render(<FilterChips {...base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a chip per active filter and resolves client/project names', () => {
    render(
      <FilterChips
        {...base}
        activeTag="foo"
        activeClientId="c1"
        activeProjectId="p1"
        clients={[{ id: 'c1', name: 'Acme' }]}
        projects={[{ id: 'p1', name: 'Survey' }]}
      />
    );
    expect(screen.getByRole('button', { name: /#foo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Acme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Survey/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('calls the matching clear callback', () => {
    const onClearTag = vi.fn();
    render(<FilterChips {...base} activeTag="foo" onClearTag={onClearTag} />);
    fireEvent.click(screen.getByRole('button', { name: /#foo/i }));
    expect(onClearTag).toHaveBeenCalledOnce();
  });

  it('formats a survey date, and shows "Undated"', () => {
    const { rerender } = render(<FilterChips {...base} activeSurveyDate="2021-06-01" />);
    expect(screen.getByRole('button', { name: /01\/06\/2021/ })).toBeInTheDocument();
    rerender(<FilterChips {...base} activeSurveyDate="undated" />);
    expect(screen.getByRole('button', { name: /Undated/i })).toBeInTheDocument();
  });
});
