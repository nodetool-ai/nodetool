import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import { useRouteError } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  useRouteError: jest.fn(),
}));

describe('ErrorBoundary', () => {
  const mockReload = jest.fn();

  beforeEach(() => {
    (useRouteError as jest.Mock).mockReturnValue(new Error('boom'));
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });
  });

  afterEach(() => {
    mockReload.mockReset();
  });

  it('renders error info', () => {
    render(<ErrorBoundary />);
    expect(screen.getByText('NodeTool has encountered an error')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('refreshes page when button clicked', () => {
    render(<ErrorBoundary />);
    fireEvent.click(screen.getByRole('button', { name: /refresh the page/i }));
    expect(mockReload).toHaveBeenCalled();
  });
});
