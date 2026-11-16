// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PhotoPopup } from '../../src/components/PhotoPopup.tsx';

afterEach(cleanup);

const photo = {
  id: 'p1',
  originalName: 'IMG_1234.jpg',
  dateTaken: '2021-06-01T10:00:00.000Z',
  cameraMake: 'Canon',
  cameraModel: 'EOS',
  iso: 100,
  altitude: 42.6,
  hasGps: true,
  lat: 51.5,
  lng: -0.12,
};

describe('PhotoPopup', () => {
  it('renders the title, metadata and a Google Maps link', () => {
    render(<PhotoPopup photo={photo} onView={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('IMG_1234.jpg')).toBeInTheDocument();
    expect(screen.getByText('Canon EOS')).toBeInTheDocument();
    expect(screen.getByText('43m')).toBeInTheDocument(); // rounded altitude
    const link = screen.getByRole('link', { name: /google maps/i });
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps?q=51.5,-0.12');
  });

  it('does not render an XSS payload as markup', () => {
    render(
      <PhotoPopup
        photo={{ ...photo, originalName: '<img src=x onerror=alert(1)>' }}
        onView={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    // React renders it as text — the literal string is present, no <img> injected
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('calls onView', () => {
    const onView = vi.fn();
    render(<PhotoPopup photo={photo} onView={onView} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /view photo/i }));
    expect(onView).toHaveBeenCalledWith(photo);
  });

  it('CQ-04: deletes via the inline two-step confirm and calls onClose', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<PhotoPopup photo={photo} onView={vi.fn()} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /delete photo/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('CQ-04: cancel backs out without deleting', () => {
    const onDelete = vi.fn();
    render(<PhotoPopup photo={photo} onView={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete photo/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /delete photo/i })).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('surfaces a delete error and stays open', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    render(<PhotoPopup photo={photo} onView={vi.fn()} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /delete photo/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(await screen.findByText(/Could not delete: boom/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
