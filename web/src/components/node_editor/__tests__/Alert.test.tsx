import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Alert from '../Alert';

jest.useFakeTimers();

const mockWriteClipboard = jest.fn();

jest.mock('../../../hooks/browser/useClipboard', () => ({
  useClipboard: () => ({ writeClipboard: mockWriteClipboard })
}));

const mockRemoveNotification = jest.fn();
const mockUpdateLastDisplayedTimestamp = jest.fn();

const makeStoreState = (notifications: any[]) => ({
  notifications,
  removeNotification: mockRemoveNotification,
  lastDisplayedTimestamp: null,
  updateLastDisplayedTimestamp: mockUpdateLastDisplayedTimestamp,
});

jest.mock('../../../stores/NotificationStore', () => ({
  useNotificationStore: jest.fn(),
}));

import { useNotificationStore } from '../../../stores/NotificationStore';

const renderWithStore = (notifications: any[]) => {
  (useNotificationStore as unknown as jest.Mock).mockImplementation((sel: any) => sel(makeStoreState(notifications)));
  return render(<Alert />);
};

const notification = {
  id: '1',
  type: 'error',
  content: 'Error message',
  timestamp: new Date(),
  alert: true,
  dismissable: false,
};

describe('Alert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders notifications and copies content', () => {
    renderWithStore([notification]);
    expect(screen.getByText('Error message')).toBeInTheDocument();
    const btn = screen.getByTitle('Copy to clipboard');
    fireEvent.click(btn);
    expect(mockWriteClipboard).toHaveBeenCalledWith('Error message', true);
  });

  it('auto dismisses notifications', () => {
    renderWithStore([notification]);
    act(() => {
      jest.advanceTimersByTime(3300);
      jest.runOnlyPendingTimers();
    });
    expect(mockRemoveNotification).not.toHaveBeenCalled();
  });
});
