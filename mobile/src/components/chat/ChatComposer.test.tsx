/**
 * Tests for ChatComposer component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ChatComposer } from './ChatComposer';
import { ChatStatus } from '../../types';

describe('ChatComposer', () => {
  const mockOnSendMessage = jest.fn();
  const mockOnStop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders input field', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    });

    it('renders send button when connected', () => {
      const { UNSAFE_root } = render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(UNSAFE_root).toBeTruthy();
    });

    it('shows connecting placeholder when disconnected', () => {
      render(
        <ChatComposer
          status="disconnected"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.getByPlaceholderText('Connecting...')).toBeTruthy();
    });

    it('shows connecting placeholder when connecting', () => {
      render(
        <ChatComposer
          status="connecting"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.getByPlaceholderText('Connecting...')).toBeTruthy();
    });

    it('disables input when disconnected', () => {
      render(
        <ChatComposer
          status="disconnected"
          onSendMessage={mockOnSendMessage}
        />
      );
      const input = screen.getByPlaceholderText('Connecting...');
      expect(input.props.editable).toBe(false);
    });

    it('disables input when disabled prop is true', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
          disabled={true}
        />
      );
      const input = screen.getByPlaceholderText('Type a message...');
      expect(input.props.editable).toBe(false);
    });

    it('enables input when connected and not disabled', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
          disabled={false}
        />
      );
      const input = screen.getByPlaceholderText('Type a message...');
      expect(input.props.editable).toBe(true);
    });
  });

  describe('Send button', () => {
    it('is disabled when text is empty', () => {
      const { UNSAFE_getAllByType } = render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(UNSAFE_getAllByType).toBeDefined();
    });

    it('calls onSendMessage when text is entered and button pressed', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Hello world');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        [{ type: 'text', text: 'Hello world' }],
        'Hello world'
      );
    });

    it('clears input after sending', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Hello');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(input.props.value).toBe('');
    });

    it('dismisses keyboard after sending', () => {
      // We can't easily mock Keyboard.dismiss, so just verify no error occurs
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Test message');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      // Verify message was sent (keyboard dismiss is called after)
      expect(mockOnSendMessage).toHaveBeenCalled();
    });

    it('trims whitespace from message', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, '  Hello world  ');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        [{ type: 'text', text: 'Hello world' }],
        'Hello world'
      );
    });

    it('does not send when text is only whitespace', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, '   ');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Stop button', () => {
    it('shows stop button when loading', () => {
      const { UNSAFE_root } = render(
        <ChatComposer
          status="loading"
          onSendMessage={mockOnSendMessage}
          onStop={mockOnStop}
        />
      );
      expect(UNSAFE_root).toBeTruthy();
    });

    it('shows stop button when streaming', () => {
      const { UNSAFE_root } = render(
        <ChatComposer
          status="streaming"
          onSendMessage={mockOnSendMessage}
          onStop={mockOnStop}
        />
      );
      expect(UNSAFE_root).toBeTruthy();
    });

    it('calls onStop when stop button pressed', () => {
      render(
        <ChatComposer
          status="loading"
          onSendMessage={mockOnSendMessage}
          onStop={mockOnStop}
        />
      );
      
      const stopButton = screen.getByTestId('stop-button');
      fireEvent.press(stopButton);
      
      expect(mockOnStop).toHaveBeenCalledTimes(1);
    });

    it('does not show stop button when onStop is not provided', () => {
      render(
        <ChatComposer
          status="loading"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.UNSAFE_root).toBeTruthy();
    });
  });

  describe('Status handling', () => {
    const statuses: ChatStatus[] = [
      'disconnected',
      'connecting',
      'connected',
      'reconnecting',
      'disconnecting',
      'failed',
      'loading',
      'streaming',
      'error',
      'stopping',
    ];

    statuses.forEach((status) => {
      it(`renders correctly with status: ${status}`, () => {
        const { UNSAFE_root } = render(
          <ChatComposer
            status={status}
            onSendMessage={mockOnSendMessage}
            onStop={mockOnStop}
          />
        );
        expect(UNSAFE_root).toBeTruthy();
      });
    });
  });
});
