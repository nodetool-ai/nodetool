import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import NotificationsList from '../NotificationsList';
import { useNotificationStore } from '../../../stores/NotificationStore';
import { useClipboard } from '../../../hooks/browser/useClipboard';

jest.mock('../../../stores/NotificationStore');
jest.mock('../../../hooks/browser/useClipboard');

const mockWriteClipboard = jest.fn();
(useClipboard as unknown as jest.Mock).mockReturnValue({ writeClipboard: mockWriteClipboard });
const theme = createTheme({ palette: { c_gray4: '#000' } } as any);

describe('NotificationsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const notifications = [
    { id: '1', type: 'info', content: 'first', timestamp: new Date('2023-01-01T00:00:01Z') },
    { id: '2', type: 'error', content: 'second', timestamp: new Date('2023-01-01T00:00:02Z') },
  ];

  it('renders sorted notifications', () => {
    (useNotificationStore as unknown as jest.Mock).mockImplementation((sel: any) => sel({ notifications }));
    render(
      <ThemeProvider theme={theme}>
        <NotificationsList />
      </ThemeProvider>
    );
    const items = screen.getAllByText(/first|second/);
    expect(items[0]).toHaveTextContent('second');
    expect(items[1]).toHaveTextContent('first');
  });

  it('copies content on button click', () => {
    (useNotificationStore as unknown as jest.Mock).mockImplementation((sel: any) => sel({ notifications }));
    render(
      <ThemeProvider theme={theme}>
        <NotificationsList />
      </ThemeProvider>
    );
    const btns = screen.getAllByTitle('Copy to clipboard');
    fireEvent.click(btns[0]);
    expect(mockWriteClipboard).toHaveBeenCalledWith('second', true);
  });
});
