/**
 * Tests for ThreadList component
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThreadList } from './ThreadList';
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

describe('ThreadList', () => {
  const mockThreads: Thread[] = [
    {
      id: 'thread-1',
      title: 'First Thread',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    } as Thread,
    {
      id: 'thread-2',
      title: 'Second Thread',
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    } as Thread,
  ];

  const defaultProps = {
    threads: mockThreads,
    currentThreadId: 'thread-1',
    isLoading: false,
    onSelectThread: jest.fn(),
    onDeleteThread: jest.fn(),
    onNewThread: jest.fn(),
    onRefresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders thread list container', () => {
    render(<ThreadList {...defaultProps} />);
    
    expect(screen.getByTestId('thread-list')).toBeTruthy();
  });

  it('renders new chat button', () => {
    render(<ThreadList {...defaultProps} />);
    
    expect(screen.getByTestId('new-chat-button')).toBeTruthy();
  });

  it('calls onNewThread when new chat button is pressed', () => {
    render(<ThreadList {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('new-chat-button'));
    
    expect(defaultProps.onNewThread).toHaveBeenCalled();
  });

  it('renders all threads', () => {
    render(<ThreadList {...defaultProps} />);
    
    expect(screen.getByTestId('thread-item-thread-1')).toBeTruthy();
    expect(screen.getByTestId('thread-item-thread-2')).toBeTruthy();
  });

  it('displays thread titles', () => {
    render(<ThreadList {...defaultProps} />);
    
    expect(screen.getByText('First Thread')).toBeTruthy();
    expect(screen.getByText('Second Thread')).toBeTruthy();
  });

  it('shows empty state when no threads', () => {
    render(<ThreadList {...defaultProps} threads={[]} />);
    
    expect(screen.getByTestId('empty-thread-list')).toBeTruthy();
    expect(screen.getByText('No conversations yet')).toBeTruthy();
  });

  it('calls onSelectThread when thread is pressed', () => {
    render(<ThreadList {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('thread-item-thread-2'));
    
    expect(defaultProps.onSelectThread).toHaveBeenCalledWith('thread-2');
  });

  it('renders FlatList for threads', () => {
    render(<ThreadList {...defaultProps} />);
    
    expect(screen.getByTestId('thread-list-flatlist')).toBeTruthy();
  });

  it('does not show empty state while loading', () => {
    render(<ThreadList {...defaultProps} threads={[]} isLoading={true} />);
    
    // FlatList should still render, empty state should not show during loading
    expect(screen.getByTestId('thread-list-flatlist')).toBeTruthy();
  });
});
