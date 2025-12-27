/**
 * Tests for NewChatButton component
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { NewChatButton } from './NewChatButton';

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

describe('NewChatButton', () => {
  const defaultProps = {
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders button with correct text', () => {
    render(<NewChatButton {...defaultProps} />);
    
    expect(screen.getByText('New Chat')).toBeTruthy();
  });

  it('renders button with testID', () => {
    render(<NewChatButton {...defaultProps} />);
    
    expect(screen.getByTestId('new-chat-button')).toBeTruthy();
  });

  it('calls onPress when button is pressed', () => {
    render(<NewChatButton {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('new-chat-button'));
    
    expect(defaultProps.onPress).toHaveBeenCalled();
  });

  it('calls onPress only once per press', () => {
    render(<NewChatButton {...defaultProps} />);
    
    fireEvent.press(screen.getByTestId('new-chat-button'));
    fireEvent.press(screen.getByTestId('new-chat-button'));
    
    expect(defaultProps.onPress).toHaveBeenCalledTimes(2);
  });
});
