import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameLoadState } from './GameLoadState.js';

describe('GameLoadState', () => {
  it('shows the loading message when there is no error', () => {
    render(<GameLoadState error="" onBack={() => {}} />);
    expect(screen.getByText(/loading game/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the error and a back button when loading failed', async () => {
    const onBack = vi.fn();
    render(<GameLoadState error="Game not found" onBack={onBack} />);
    expect(screen.getByText('Game not found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /lobby/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
