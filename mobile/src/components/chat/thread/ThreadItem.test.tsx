/**
 * Tests for ThreadItem component
 */

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ThreadItem } from './ThreadItem';
import { Thread } from '../../../types';

// Mock useTheme hook
jest.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      text: '#000000',
      textSecondary: '#666666',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#007AFF',
      error: '#FF0000',
      onPrimary: '#FFFFFF',
    },
    mode: 'light',
    isDark: false,
  }),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('ThreadItem', () => {
  const mockThread: Thread = {
    id: 'thread-1',
    title: 'Test Thread',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  } as Thread;

  const defaultProps = {
    thread: mockThread,
    isSelected: false,
    onSelect: jest.fn(),
    onDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders thread title', () => {
    render(<ThreadItem {...defaultProps} />);
    
    expect(screen.getByText('Test Thread')).toBeTruthy();
  });

  it('renders default title when thread has no title', () => {
    const threadWithoutTitle = { ...mockThread, title: '' };
    render(<ThreadItem {...defaultProps} thread={threadWithoutTitle} />);
    
    expect(screen.getByText('New conversation')).toBeTruthy();
  });

  it('displays relative time for updated_at', () => {
    // Mock a recent date
    const recentDate = new Date();
    recentDate.setMinutes(recentDate.getMinutes() - 5);
    
    const recentThread = {
      ...mockThread,
      updated_at: recentDate.toISOString(),
    };
    
    render(<ThreadItem {...defaultProps} thread={recentThread} />);
    
    // Should show "5m ago" or similar
    expect(screen.getByText(/ago|Just now/)).toBeTruthy();
  });

  it('calls onSelect when pressed', () => {
    render(<ThreadItem {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('thread-item-thread-1'));
    
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  it('shows delete confirmation when delete button is pressed', () => {
    render(<ThreadItem {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('delete-thread-thread-1'));
    
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ])
    );
  });

  it('calls onDelete when confirmed in alert', () => {
    render(<ThreadItem {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('delete-thread-thread-1'));
    
    // Get the onPress handler for the Delete button from Alert.alert call
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const deleteButton = alertCall[2].find((btn: any) => btn.text === 'Delete');
    
    // Simulate pressing delete
    deleteButton.onPress();
    
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  it('applies selected styles when isSelected is true', () => {
    const { getByTestId } = render(<ThreadItem {...defaultProps} isSelected={true} />);
    
    // The component should render with isSelected true
    // We verify the component renders without error
    expect(getByTestId('thread-item-thread-1')).toBeTruthy();
  });

  it('renders delete button', () => {
    render(<ThreadItem {...defaultProps} />);
    
    expect(screen.getByTestId('delete-thread-thread-1')).toBeTruthy();
  });
});
