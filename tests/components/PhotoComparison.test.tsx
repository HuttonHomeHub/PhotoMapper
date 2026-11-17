// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { PhotoComparison } from '../../src/components/PhotoComparison.tsx';
import { photo as makePhoto, must } from '../factories.ts';

afterEach(cleanup);

const a = makePhoto({
  id: 'a',
  filename: 'a.jpg',
  originalName: 'A.jpg',
  dateTaken: '2021-06-01T10:00:00.000Z',
  cameraMake: 'Canon',
  cameraModel: 'EOS',
  focalLength: 50,
  fNumber: 4,
  iso: 200,
  exposureTime: '1/500',
  altitude: 99.6,
  imgDirection: 179.5,
  hasGps: true,
  lat: 51.5,
  lng: -0.12,
});
const b = makePhoto({ id: 'b', filename: 'b.jpg', originalName: 'B.jpg', exposureTime: '' });
const c = makePhoto({ id: 'c', filename: 'c.jpg', originalName: 'C.jpg' });
const photos = [a, b, c];

function setup(leftId = 'a', rightId = 'b') {
  const props = {
    onClose: vi.fn(),
    onChangeLeft: vi.fn(),
    onChangeRight: vi.fn(),
  };
  const view = render(
    <PhotoComparison photos={photos} leftId={leftId} rightId={rightId} {...props} />
  );
  const panels = [...view.container.querySelectorAll<HTMLElement>('.comparison-panel')];
  return {
    ...props,
    ...view,
    left: must(panels[0], 'left panel'),
    right: must(panels[1], 'right panel'),
  };
}

describe('PhotoComparison', () => {
  it('shows both photos with their metadata, hiding empty values', () => {
    const { left, right } = setup();
    const l = within(left);
    expect(l.getByText('A.jpg')).toBeInTheDocument();
    expect(l.getByRole('img', { name: 'A.jpg' })).toHaveAttribute('src', '/uploads/a.jpg');
    expect(l.getByText(new Date('2021-06-01T10:00:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(l.getByText('Canon EOS')).toBeInTheDocument();
    expect(l.getByText('50mm')).toBeInTheDocument();
    expect(l.getByText('f/4')).toBeInTheDocument();
    expect(l.getByText('200')).toBeInTheDocument();
    expect(l.getByText('1/500')).toBeInTheDocument();
    expect(l.getByText('100m')).toBeInTheDocument();
    expect(l.getByText('180°')).toBeInTheDocument();
    expect(l.getByText('51.50000, -0.12000')).toBeInTheDocument();
    const dl = l.getByRole('link', { name: /download/i });
    expect(dl).toHaveAttribute('href', '/uploads/a.jpg');
    expect(dl).toHaveAttribute('download', 'A.jpg');

    const r = within(right);
    expect(r.getByText('B.jpg')).toBeInTheDocument();
    expect(r.getByText('No GPS')).toBeInTheDocument();
    for (const label of [
      'Taken',
      'Camera',
      'Focal len.',
      'Aperture',
      'ISO',
      'Exposure', // empty string is hidden too
      'Altitude',
      'Direction',
    ]) {
      expect(r.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('per-panel prev/next buttons wrap around and change only that side', () => {
    const { left, right, onChangeLeft, onChangeRight, onClose } = setup('a', 'c');
    fireEvent.click(within(left).getByRole('button', { name: 'Previous photo' }));
    expect(onChangeLeft).toHaveBeenLastCalledWith('c');
    fireEvent.click(within(left).getByRole('button', { name: 'Next photo' }));
    expect(onChangeLeft).toHaveBeenLastCalledWith('b');
    fireEvent.click(within(right).getByRole('button', { name: 'Next photo' }));
    expect(onChangeRight).toHaveBeenLastCalledWith('a');
    fireEvent.click(within(right).getByRole('button', { name: 'Previous photo' }));
    expect(onChangeRight).toHaveBeenLastCalledWith('b');
    expect(onChangeLeft).toHaveBeenCalledTimes(2);
    expect(onChangeRight).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('arrow keys move the focused panel, left by default', () => {
    const { left, right, onChangeLeft, onChangeRight } = setup();
    expect(left).toHaveClass('focused');
    expect(right).not.toHaveClass('focused');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChangeLeft).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onChangeLeft).toHaveBeenLastCalledWith('c');

    fireEvent.click(right);
    expect(right).toHaveClass('focused');
    expect(left).not.toHaveClass('focused');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChangeRight).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onChangeRight).toHaveBeenLastCalledWith('a');
    expect(onChangeLeft).toHaveBeenCalledTimes(2);

    fireEvent.click(left);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChangeLeft).toHaveBeenCalledTimes(3);

    // other keys do nothing
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onChangeLeft).toHaveBeenCalledTimes(3);
    expect(onChangeRight).toHaveBeenCalledTimes(2);
  });

  it('Escape and the close button call onClose', () => {
    const { onClose, onChangeLeft } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChangeLeft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('clicking the backdrop closes, but clicking inside the container does not', () => {
    const { container, left, onClose } = setup();
    fireEvent.click(must(container.querySelector('.comparison-container'), 'container'));
    fireEvent.click(within(left).getByRole('link', { name: /download/i }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(must(container.querySelector('.comparison-overlay'), 'overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "No photo selected" for a missing id; arrows then jump to the first photo', () => {
    const { left, right, onChangeRight } = setup('a', 'gone');
    expect(within(right).getByText('No photo selected')).toBeInTheDocument();
    expect(within(right).queryByRole('button')).not.toBeInTheDocument();
    expect(within(left).getByText('A.jpg')).toBeInTheDocument();
    fireEvent.click(right);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChangeRight).toHaveBeenLastCalledWith('a');
  });

  it('does nothing on arrow keys when there are no photos at all', () => {
    const onChangeLeft = vi.fn();
    render(
      <PhotoComparison
        photos={[]}
        leftId="x"
        rightId="y"
        onClose={vi.fn()}
        onChangeLeft={onChangeLeft}
        onChangeRight={vi.fn()}
      />
    );
    expect(screen.getAllByText('No photo selected')).toHaveLength(2);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChangeLeft).not.toHaveBeenCalled();
  });
});
