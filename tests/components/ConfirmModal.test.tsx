// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ConfirmModal } from '../../src/components/ConfirmModal.tsx';

afterEach(cleanup);

function setup(props: Partial<Parameters<typeof ConfirmModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmModal
      title="Delete photo?"
      message="This cannot be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel, ...view };
}

describe('ConfirmModal', () => {
  it('shows the title, message and a danger-styled Delete button by default', () => {
    const { container } = setup();
    expect(screen.getByText('Delete photo?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('confirm-modal-delete');
    expect(container.querySelector('.confirm-modal-icon--danger')).toBeInTheDocument();
  });

  it('focuses the first button (Cancel) on open', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('uses a custom label and neutral style when not dangerous', () => {
    const { container } = setup({ confirmLabel: 'Move', danger: false });
    expect(screen.getByRole('button', { name: 'Move' })).toHaveClass('confirm-modal-confirm');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(container.querySelector('.confirm-modal-icon--danger')).not.toBeInTheDocument();
  });

  it('calls onConfirm from the confirm button', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel from the Cancel button', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on a backdrop click but not on a click inside the box', async () => {
    const { onCancel, container } = setup();
    await userEvent.click(screen.getByText('This cannot be undone.'));
    expect(onCancel).not.toHaveBeenCalled();
    const overlay = container.querySelector('.confirm-modal-overlay');
    if (!(overlay instanceof HTMLElement)) throw new Error('expected overlay');
    await userEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    setup();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});
