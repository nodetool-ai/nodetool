/**
 * Tests for ChatView component
 */

import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HeaderHeightContext } from '@react-navigation/elements';
import { ChatView } from './ChatView';
import { Message, ChatStatus } from '../../types';

// Mock child components
jest.mock('./ChatMessageList', () => ({
  ChatMessageList: ({
    messages,
    isLoading,
    isStreaming,
  }: {
    messages: Message[];
    isLoading: boolean;
    isStreaming: boolean;
  }) => {
    const { Text, View } = require('react-native');
    return (
      <View testID="chat-message-list">
        <Text testID="message-count">{messages.length}</Text>
        <Text testID="is-loading">{isLoading.toString()}</Text>
        <Text testID="is-streaming">{isStreaming.toString()}</Text>
      </View>
    );
  },
}));

jest.mock('./ChatComposer', () => ({
  ChatComposer: ({
    status,
    onSendMessage,
    onStop,
  }: {
    status: ChatStatus;
    onSendMessage: (content: unknown[], prompt: string) => void;
    onStop?: () => void;
  }) => {
    const { TouchableOpacity, Text, View } = require('react-native');
    return (
      <View testID="chat-composer">
        <Text testID="composer-status">{status}</Text>
        <TouchableOpacity testID="send-button" onPress={() => onSendMessage([{ type: 'text', text: 'test' }], 'test')}>
          <Text>Send</Text>
        </TouchableOpacity>
        {onStop && (
          <TouchableOpacity testID="stop-button" onPress={onStop}>
            <Text>Stop</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  },
}));

describe('ChatView', () => {
  const mockOnSendMessage = jest.fn().mockResolvedValue(true);
  const mockOnStop = jest.fn();

  const defaultProps = {
    status: 'connected' as ChatStatus,
    messages: [] as Message[],
    onSendMessage: mockOnSendMessage,
    onStop: mockOnStop,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty state', () => {
    it('renders welcome message when no messages', () => {
      render(<ChatView {...defaultProps} />);
      
      expect(screen.getByText('What can I help with?')).toBeTruthy();
      expect(screen.getByText('Ask a question or start a draft. Switch to Image or Video below to generate media.')).toBeTruthy();
    });

    it('does not render message list when empty', () => {
      render(<ChatView {...defaultProps} />);
      
      expect(screen.queryByTestId('chat-message-list')).toBeNull();
    });
  });

  describe('With messages', () => {
    it('renders message list when messages exist', () => {
      const messages: Message[] = [
        { id: '1', type: 'message', role: 'user', content: 'Hello' },
      ];
      
      render(<ChatView {...defaultProps} messages={messages} />);
      
      expect(screen.getByTestId('chat-message-list')).toBeTruthy();
      expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    });

    it('passes correct loading state to message list', () => {
      const messages: Message[] = [
        { id: '1', type: 'message', role: 'user', content: 'Hello' },
      ];
      
      render(<ChatView {...defaultProps} messages={messages} status="loading" />);
      
      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
    });

    it('passes correct streaming state to message list', () => {
      const messages: Message[] = [
        { id: '1', type: 'message', role: 'user', content: 'Hello' },
      ];
      
      render(<ChatView {...defaultProps} messages={messages} status="streaming" />);
      
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
    });

    it('does not show welcome message when messages exist', () => {
      const messages: Message[] = [
        { id: '1', type: 'message', role: 'user', content: 'Hello' },
      ];
      
      render(<ChatView {...defaultProps} messages={messages} />);
      
      expect(screen.queryByText('What can I help with?')).toBeNull();
    });
  });

  describe('Status banners', () => {
    it('shows error banner when error prop is set', () => {
      render(<ChatView {...defaultProps} error="Connection failed" />);
      
      expect(screen.getByText('Connection failed')).toBeTruthy();
    });

    it('lets a long error string wrap instead of overflowing the centred row', () => {
      const longError = 'Network request failed: connect ECONNREFUSED 127.0.0.1:7777';
      render(<ChatView {...defaultProps} error={longError} />);

      const style = StyleSheet.flatten(screen.getByText(longError).props.style);
      expect(style.flex).toBe(1);
      expect(style.textAlign).toBe('center');
    });

    it('shows disconnected banner', () => {
      render(<ChatView {...defaultProps} status="disconnected" />);
      
      expect(screen.getByText('Disconnected')).toBeTruthy();
    });

    it('shows connecting banner', () => {
      render(<ChatView {...defaultProps} status="connecting" />);
      
      expect(screen.getByText('Connecting...')).toBeTruthy();
    });

    it('shows reconnecting banner with default message', () => {
      render(<ChatView {...defaultProps} status="reconnecting" />);
      
      expect(screen.getByText('Reconnecting...')).toBeTruthy();
    });

    it('shows reconnecting banner with custom message', () => {
      render(<ChatView {...defaultProps} status="reconnecting" statusMessage="Reconnecting... (2/5)" />);
      
      expect(screen.getByText('Reconnecting... (2/5)')).toBeTruthy();
    });

    it('offers a reconnect when the socket gave up', () => {
      const onReconnect = jest.fn();
      render(<ChatView {...defaultProps} status="failed" onReconnect={onReconnect} />);

      expect(screen.getByText('Could not connect to chat')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Reconnect to chat' }));

      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('offers a reconnect when disconnected', () => {
      const onReconnect = jest.fn().mockResolvedValue(undefined);
      render(<ChatView {...defaultProps} status="disconnected" onReconnect={onReconnect} />);

      fireEvent.press(screen.getByRole('button', { name: 'Reconnect to chat' }));

      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('shows the error and the connection state together', () => {
      render(
        <ChatView
          {...defaultProps}
          status="disconnected"
          error="Connection lost while the reply was streaming"
          onReconnect={jest.fn()}
        />
      );

      expect(screen.getByText('Connection lost while the reply was streaming')).toBeTruthy();
      expect(screen.getByText('Disconnected')).toBeTruthy();
    });

    it('does not show banner when connected', () => {
      render(<ChatView {...defaultProps} status="connected" />);
      
      expect(screen.queryByText('Connected')).toBeNull();
      expect(screen.queryByText('Disconnected')).toBeNull();
    });

    it('does not show banner when loading', () => {
      render(<ChatView {...defaultProps} status="loading" />);
      
      expect(screen.queryByText('Loading')).toBeNull();
    });

    it('does not show banner when streaming', () => {
      render(<ChatView {...defaultProps} status="streaming" />);
      
      expect(screen.queryByText('Streaming')).toBeNull();
    });
  });

  describe('ChatComposer integration', () => {
    it('passes status to composer', () => {
      render(<ChatView {...defaultProps} status="loading" />);
      
      expect(screen.getByTestId('composer-status')).toHaveTextContent('loading');
    });

    it('passes onStop to composer', () => {
      render(<ChatView {...defaultProps} />);
      
      expect(screen.getByTestId('stop-button')).toBeTruthy();
    });

    it('does not show stop button when onStop is not provided', () => {
      render(<ChatView {...defaultProps} onStop={undefined} />);
      
      expect(screen.queryByTestId('stop-button')).toBeNull();
    });

    it('calls onSendMessage when send button pressed', () => {
      render(<ChatView {...defaultProps} />);
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });

    it('calls onStop when stop button pressed', () => {
      render(<ChatView {...defaultProps} />);
      
      const stopButton = screen.getByTestId('stop-button');
      fireEvent.press(stopButton);
      
      expect(mockOnStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('KeyboardAvoidingView', () => {
    it('pads for the keyboard on iOS and clears the measured header', () => {
      const { UNSAFE_root } = render(
        <HeaderHeightContext.Provider value={64}>
          <ChatView {...defaultProps} />
        </HeaderHeightContext.Provider>
      );
      const { props } = UNSAFE_root.findByType(KeyboardAvoidingView);
      const ios = Platform.OS === 'ios';
      expect(props.behavior).toBe(ios ? 'padding' : undefined);
      expect(props.keyboardVerticalOffset).toBe(ios ? 64 : 0);
    });
  });
});
