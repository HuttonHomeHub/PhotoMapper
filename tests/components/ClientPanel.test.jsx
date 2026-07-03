// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ClientPanel from '../../src/components/ClientPanel.jsx'

afterEach(cleanup)

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
}

describe('ClientPanel loading/empty/error states (FE-06)', () => {
  it('shows a loading hint while the first fetch is in flight (no empty hint)', () => {
    render(<ClientPanel {...base} loading={true} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText(/No clients yet/)).not.toBeInTheDocument()
  })

  it('shows the empty hint only once loaded with no clients', () => {
    render(<ClientPanel {...base} loading={false} />)
    expect(screen.getByText(/No clients yet/)).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('shows an error with a working retry, and no empty/loading hint', () => {
    const onRetry = vi.fn()
    render(<ClientPanel {...base} loading={false} error="HTTP 500" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/No clients yet/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
