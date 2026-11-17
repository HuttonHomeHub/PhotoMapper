// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { PhotoLightbox } from '../../src/components/PhotoLightbox.tsx';
import { photo as makePhoto, must } from '../factories.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const full = makePhoto({
  id: 'a',
  filename: 'a.jpg',
  originalName: 'A.jpg',
  locationName: 'Ben Nevis',
  dateTaken: '2021-06-01T10:00:00.000Z',
  cameraMake: 'Canon',
  cameraModel: 'EOS R5',
  focalLength: 35,
  fNumber: 2.8,
  iso: 400,
  exposureTime: '1/250',
  altitude: 1344.6,
  imgDirection: 89.6,
  hasGps: true,
  lat: 56.796851,
  lng: -5.003508,
  description: 'Summit cairn',
  tags: ['summit'],
  surveyDate: '2021-06-02',
});
const b = makePhoto({ id: 'b', filename: 'b.jpg', originalName: 'B.jpg', tags: ['ridge'] });
const c = makePhoto({ id: 'c', filename: 'c.jpg', originalName: 'C.jpg' });
const all = [full, b, c];

function notes(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Add observation notes…');
}
function tagInput(): HTMLInputElement {
  return screen.getByPlaceholderText('Add tag…');
}
function surveyInput(): HTMLInputElement {
  return must(
    document.querySelector<HTMLInputElement>('.lightbox-survey-date-input'),
    'survey date input'
  );
}

describe('PhotoLightbox: details', () => {
  it('shows the image, title, location and every EXIF row', () => {
    render(<PhotoLightbox photo={full} photos={all} onClose={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'A.jpg' })).toHaveAttribute('src', '/uploads/a.jpg');
    expect(screen.getByText('Ben Nevis')).toBeInTheDocument();
    expect(
      screen.getByText(new Date('2021-06-01T10:00:00.000Z').toLocaleString())
    ).toBeInTheDocument();
    expect(screen.getByText('Canon EOS R5')).toBeInTheDocument();
    expect(screen.getByText('35mm')).toBeInTheDocument();
    expect(screen.getByText('f/2.8')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
    expect(screen.getByText('1/250')).toBeInTheDocument();
    expect(screen.getByText('1345m')).toBeInTheDocument();
    expect(screen.getByText('90°')).toBeInTheDocument();
    expect(screen.getByText('56.79685, -5.00351')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=56.796851,-5.003508'
    );
    const download = screen.getByRole('link', { name: /download/i });
    expect(download).toHaveAttribute('href', '/uploads/a.jpg');
    expect(download).toHaveAttribute('download', 'A.jpg');
    expect(notes()).toHaveValue('Summit cairn');
    expect(screen.getByText('summit')).toBeInTheDocument();
    expect(surveyInput()).toHaveValue('2021-06-02');
  });

  it('hides empty EXIF rows and says when there is no GPS', () => {
    render(<PhotoLightbox photo={c} photos={[c]} onClose={vi.fn()} />);
    for (const label of [
      'Taken',
      'Camera',
      'Focal length',
      'Aperture',
      'ISO',
      'Exposure',
      'Altitude',
      'Direction',
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.getByText('No GPS data')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy coords' })).not.toBeInTheDocument();
    // a single photo has no prev/next buttons
    expect(screen.queryByRole('button', { name: 'Previous photo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
    expect(notes()).toHaveValue('');
    expect(surveyInput()).toHaveValue('');
  });

  it('shows only the make when there is no model', () => {
    render(
      <PhotoLightbox photo={makePhoto({ cameraMake: 'Nikon' })} photos={[]} onClose={vi.fn()} />
    );
    expect(screen.getByText('Nikon')).toBeInTheDocument();
  });

  it('copies the coordinates and briefly shows "Copied"', () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<PhotoLightbox photo={full} photos={all} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy coords' }));
    expect(writeText).toHaveBeenCalledWith('56.79685, -5.00351');
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole('button', { name: 'Copy coords' })).toBeInTheDocument();
  });
});

describe('PhotoLightbox: navigation and closing', () => {
  it('prev/next buttons move to the neighbour photo, wrapping around', () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photo={full} photos={all} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(onClose).toHaveBeenLastCalledWith(c);
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(onClose).toHaveBeenLastCalledWith(b);
    expect(onClose).toHaveBeenCalledTimes(2); // the buttons don't also close via the overlay
  });

  it('arrow keys move between photos, wrapping at the end', () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photo={c} photos={all} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onClose).toHaveBeenLastCalledWith(full);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onClose).toHaveBeenLastCalledWith(b);
  });

  it('ignores arrow keys while typing in the notes or tag input', () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photo={full} photos={all} onClose={onClose} />);
    fireEvent.keyDown(notes(), { key: 'ArrowLeft' });
    fireEvent.keyDown(tagInput(), { key: 'ArrowRight' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes with null, even from a text field', () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photo={full} photos={all} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(notes(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('clicking the overlay or the close button closes; clicking inside the box does not', () => {
    const onClose = vi.fn();
    const { container } = render(<PhotoLightbox photo={full} photos={all} onClose={onClose} />);
    fireEvent.click(screen.getByRole('img', { name: 'A.jpg' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(must(container.querySelector('.lightbox-overlay'), 'overlay'));
    expect(onClose).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenLastCalledWith(null);
  });
});

describe('PhotoLightbox: notes, tags and survey date', () => {
  it('debounces notes and saves once after 600 ms, then shows Saved and clears it', () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<PhotoLightbox photo={full} photos={all} onClose={vi.fn()} onUpdate={onUpdate} />);
    fireEvent.change(notes(), { target: { value: 'Summit' } });
    expect(screen.getByText('saving…')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300));
    fireEvent.change(notes(), { target: { value: 'Summit cairn, windy' } });
    act(() => vi.advanceTimersByTime(599));
    expect(onUpdate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('a', {
      description: 'Summit cairn, windy',
      tags: ['summit'],
      surveyDate: '2021-06-02',
    });
    expect(screen.getByText('✓ Saved')).toBeInTheDocument();
    expect(screen.queryByText('saving…')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('✓ Saved')).not.toBeInTheDocument();
  });

  it("doesn't carry the Saved note over to the next photo", () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <PhotoLightbox photo={full} photos={all} onClose={vi.fn()} onUpdate={onUpdate} />
    );
    fireEvent.change(notes(), { target: { value: 'Summit' } });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByText('✓ Saved')).toBeInTheDocument();
    rerender(<PhotoLightbox photo={b} photos={all} onClose={vi.fn()} onUpdate={onUpdate} />);
    expect(screen.queryByText('✓ Saved')).not.toBeInTheDocument();
  });

  it('adds tags with Enter or comma, skips blanks and duplicates, and removes tags', () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<PhotoLightbox photo={full} photos={all} onClose={vi.fn()} onUpdate={onUpdate} />);

    fireEvent.change(tagInput(), { target: { value: ' ridge ' } });
    fireEvent.keyDown(tagInput(), { key: 'Enter' });
    expect(screen.getByText('ridge')).toBeInTheDocument();
    expect(tagInput()).toHaveValue('');

    fireEvent.change(tagInput(), { target: { value: 'cairn,' } });
    fireEvent.keyDown(tagInput(), { key: ',' });
    expect(screen.getByText('cairn')).toBeInTheDocument();

    // duplicate: not added, input cleared
    fireEvent.change(tagInput(), { target: { value: 'summit' } });
    fireEvent.keyDown(tagInput(), { key: 'Enter' });
    expect(screen.getAllByText('summit')).toHaveLength(1);
    expect(tagInput()).toHaveValue('');

    // blank: nothing happens; other keys don't add
    fireEvent.keyDown(tagInput(), { key: 'Enter' });
    fireEvent.change(tagInput(), { target: { value: 'x' } });
    fireEvent.keyDown(tagInput(), { key: 'a' });
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    // ...but blurring the input adds what was typed
    fireEvent.blur(tagInput());
    expect(screen.getByText('x')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag summit' }));
    expect(screen.queryByText('summit')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(600));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('a', {
      description: 'Summit cairn',
      tags: ['ridge', 'cairn', 'x'],
      surveyDate: '2021-06-02',
    });
  });

  it('saves a changed survey date, and a cleared one as null', () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<PhotoLightbox photo={full} photos={all} onClose={vi.fn()} onUpdate={onUpdate} />);
    fireEvent.change(surveyInput(), { target: { value: '2022-01-15' } });
    act(() => vi.advanceTimersByTime(600));
    expect(onUpdate).toHaveBeenLastCalledWith('a', {
      description: 'Summit cairn',
      tags: ['summit'],
      surveyDate: '2022-01-15',
    });
    fireEvent.change(surveyInput(), { target: { value: '' } });
    act(() => vi.advanceTimersByTime(600));
    expect(onUpdate).toHaveBeenLastCalledWith('a', {
      description: 'Summit cairn',
      tags: ['summit'],
      surveyDate: null,
    });
  });

  it('still shows the save state without an onUpdate handler', () => {
    vi.useFakeTimers();
    render(<PhotoLightbox photo={full} photos={all} onClose={vi.fn()} />);
    fireEvent.change(notes(), { target: { value: 'x' } });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByText('✓ Saved')).toBeInTheDocument();
  });

  it('moving to another photo shows that photo’s notes, tags and survey date', () => {
    const onClose = vi.fn();
    const { rerender } = render(<PhotoLightbox photo={full} photos={all} onClose={onClose} />);
    fireEvent.change(tagInput(), { target: { value: 'half-typed' } });
    rerender(<PhotoLightbox photo={b} photos={all} onClose={onClose} />);
    expect(screen.getByRole('img', { name: 'B.jpg' })).toBeInTheDocument();
    expect(notes()).toHaveValue('');
    expect(screen.getByText('ridge')).toBeInTheDocument();
    expect(screen.queryByText('summit')).not.toBeInTheDocument();
    expect(tagInput()).toHaveValue('');
    expect(surveyInput()).toHaveValue('');
    // keyboard navigation follows the new photo
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onClose).toHaveBeenLastCalledWith(c);
  });

  it('cancels a pending save on unmount', () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <PhotoLightbox photo={full} photos={all} onClose={vi.fn()} onUpdate={onUpdate} />
    );
    fireEvent.change(notes(), { target: { value: 'lost' } });
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
