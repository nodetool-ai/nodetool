import { asMock } from "../../test-utils/doubles";
import { render, screen, waitFor } from '@testing-library/react';
import ProtectedRoute from '../ProtectedRoute';
import { useLocation, useNavigate } from 'react-router-dom';
import { consumePostLoginReturn } from '../../utils/postLoginReturn';
import useAuth from '../../stores/useAuth';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useLocation: jest.fn(),
}));

jest.mock('../../stores/useAuth', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('ProtectedRoute', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    asMock(useNavigate).mockReturnValue(mockNavigate);
    asMock(useLocation).mockReturnValue({ pathname: '/', search: '' });
  });

  it('redirects to /login when logged_out', async () => {
    asMock(useAuth).mockImplementation(<T,>(selector: (s: { state: string }) => T) =>
      selector({ state: 'logged_out' })
    );
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
  });

  it('brings a signed-out user back to the OAuth consent page after sign-in', async () => {
    asMock(useLocation).mockReturnValue({
      pathname: '/oauth/consent',
      search: '?request_id=0123456789abcdef0123456789abcdef'
    });
    asMock(useAuth).mockImplementation(<T,>(selector: (s: { state: string }) => T) =>
      selector({ state: 'logged_out' })
    );
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(consumePostLoginReturn()).toBe(
      '/oauth/consent?request_id=0123456789abcdef0123456789abcdef'
    );
  });

  it('does not remember an ordinary protected page', async () => {
    asMock(useLocation).mockReturnValue({ pathname: '/assets', search: '' });
    asMock(useAuth).mockImplementation(<T,>(selector: (s: { state: string }) => T) =>
      selector({ state: 'logged_out' })
    );
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(consumePostLoginReturn()).toBeNull();
  });

  it('shows loading spinner when state is loading', () => {
    asMock(useAuth).mockImplementation(<T,>(selector: (s: { state: string }) => T) =>
      selector({ state: 'loading' })
    );
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders children when logged_in', () => {
    asMock(useAuth).mockImplementation(<T,>(selector: (s: { state: string }) => T) =>
      selector({ state: 'logged_in' })
    );
    render(
      <ProtectedRoute>
        <div>secure</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('secure')).toBeInTheDocument();
  });
});
