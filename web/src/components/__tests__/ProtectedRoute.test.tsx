import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ProtectedRoute from '../ProtectedRoute';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../stores/useAuth';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('../../stores/useAuth', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('ProtectedRoute', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    (useNavigate as unknown as jest.Mock).mockReturnValue(mockNavigate);
    jest.clearAllMocks();
  });

  it('redirects to /login when logged_out', async () => {
    (useAuth as unknown as jest.Mock).mockReturnValue({ state: 'logged_out' });
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
  });

  it('shows loading spinner when state is loading', () => {
    (useAuth as unknown as jest.Mock).mockReturnValue({ state: 'loading' });
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders children when logged_in', () => {
    (useAuth as unknown as jest.Mock).mockReturnValue({ state: 'logged_in' });
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('secure')).toBeInTheDocument();
  });
});
