// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, renderHook, act } from '@testing-library/react'
import { TimelinePanel } from '../../src/components/TimelinePanel.jsx'
import { useTimeline } from '../../src/hooks/useTimeline.js'

afterEach(cleanup)

function makeTimeline(overrides = {}) {
  return {
    active: false,
    setActive: vi.fn(),
    index: 0,
    setIndex: vi.fn(),
    playing: false,
    setPlaying: vi.fn(),
    speed: 800,
    setSpeed: vi.fn(),
    sorted: [],
    slicePhotos: [],
    currentPhoto: undefined,
    currentDate: '',
    ...overrides,
  }
}

describe('TimelinePanel', () => {
  it('shows the play toggle, disabled when there are no photos', () => {
    render(<TimelinePanel timeline={makeTimeline()} photoCount={0} />)
    expect(screen.getByRole('button', { name: /play timeline/i })).toBeDisabled()
  })

  it('renders the scrubber and controls when active', () => {
    const timeline = makeTimeline({
      active: true,
      sorted: [{ id: 'a' }, { id: 'b' }],
      currentDate: 'Jan 1, 2020',
    })
    render(<TimelinePanel timeline={timeline} photoCount={2} />)
    expect(screen.getByText('Jan 1, 2020')).toBeInTheDocument()
    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    // FE-03: screen readers announce the date, not the raw index.
    expect(slider).toHaveAttribute('aria-valuetext', 'Jan 1, 2020')
    expect(screen.getByRole('button', { name: /play timeline \(space\)/i })).toBeInTheDocument()
  })
})

describe('useTimeline', () => {
  it('sorts chronologically and slices to the current index', () => {
    const photos = [
      { id: 'a', dateTaken: '2021-01-01' },
      { id: 'b', dateTaken: '2020-01-01' },
      { id: 'c', dateTaken: '2022-01-01' },
    ]
    const { result } = renderHook(() => useTimeline(photos))
    expect(result.current.sorted.map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(result.current.slicePhotos.map((p) => p.id)).toEqual(['b'])

    act(() => result.current.setIndex(1))
    expect(result.current.slicePhotos.map((p) => p.id)).toEqual(['b', 'a'])
    expect(result.current.currentPhoto.id).toBe('a')
  })
})
