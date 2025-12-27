/**
 * Tests for ChatScreen
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from './ChatScreen';
import { useChatStore } from '../stores/ChatStore';

// Mock ChatView component
jest.mock('../components/chat', () => ({
  ChatView: ({ status, messages, onSendMessage, onStop, error, statusMessage }: any) => {
    const { Text, View, TouchableOpacity } = require('react-native');
    return (
      <View testID="chat-view">
        <Text testID="status">{status}</Text>
        <Text testID="message-count">{messages.length}</Text>
        <Text testID="error">{error || ''}</Text>
        <Text testID="status-message">{statusMessage || ''}</Text>
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

// Mock the chat store
jest.mock('../stores/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

describe('ChatScreen', () => {
  const mockStore = {
    status: 'connected',
    error: null,
    statusMessage: null,
    currentThreadId: 'thread-1',
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    stopGeneration: jest.fn(),
    createNewThread: jest.fn().mockResolvedValue('new-thread-id'),
    getCurrentMessages: jest.fn().mockReturnValue([]),
  };

  const mockNavigation = {
    navigate: jest.fn(),
    setOptions: jest.fn(),
    goBack: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as any).mockImplementation((selector?: any) => {
      if (selector) {
        return selector(mockStore);
      }
      return mockStore;
    });
  });

  describe('Rendering', () => {
    it('renders ChatView component', () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      expect(screen.getByTestId('chat-view')).toBeTruthy();
    });

    it('renders SafeAreaView container', () => {
      const { UNSAFE_root } = render(
        <ChatScreen navigation={mockNavigation as any} route={{} as any} />
      );
      
      const safeAreaView = UNSAFE_root.findByType(require('react-native').SafeAreaView);
      expect(safeAreaView).toBeTruthy();
    });
  });

  describe('Initialization', () => {
    it('calls connect on mount', async () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled();
      });
    });

    it('creates new thread if none exists', async () => {
      const storeWithoutThread = {
        ...mockStore,
        currentThreadId: null,
      };
      
      (useChatStore as any).mockImplementation((selector?: any) => {
        if (selector) {
          return selector(storeWithoutThread);
        }
        return storeWithoutThread;
      });
      
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      await waitFor(() => {
        expect(storeWithoutThread.createNewThread).toHaveBeenCalled();
      });
    });

    it('handles connection error gracefully', async () => {
      mockStore.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      // Should not throw
      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled();
      });
    });
  });

  describe('Header configuration', () => {
    it('sets header right button', () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    it('displays selected model name in header', () => {
      const storeWithModel = {
        ...mockStore,
        selectedModel: { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
      };
      
      (useChatStore as any).mockImplementation((selector?: any) => {
        if (selector) {
          return selector(storeWithModel);
        }
        return storeWithModel;
      });

      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      const setOptionsCall = mockNavigation.setOptions.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByText } = render(<HeaderRight />);
      expect(getByText('GPT-4')).toBeTruthy();
    });

    it('displays "Model" when no model selected', () => {
      const storeWithoutModel = {
        ...mockStore,
        selectedModel: null,
      };
      
      (useChatStore as any).mockImplementation((selector?: any) => {
        if (selector) {
          return selector(storeWithoutModel);
        }
        return storeWithoutModel;
      });

      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      const setOptionsCall = mockNavigation.setOptions.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByText } = render(<HeaderRight />);
      expect(getByText('Model')).toBeTruthy();
    });

    it('header button creates new chat', async () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      // Get the headerRight component
      const setOptionsCall = mockNavigation.setOptions.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByTestId } = render(<HeaderRight />);
      
      // Click the add icon button (new chat button)
      fireEvent.press(getByTestId('icon-add-outline'));
      
      await waitFor(() => {
        expect(mockStore.createNewThread).toHaveBeenCalled();
      });
    });

    it('handles new chat error gracefully', async () => {
      mockStore.createNewThread.mockRejectedValueOnce(new Error('Failed'));
      
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      const setOptionsCall = mockNavigation.setOptions.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByTestId } = render(<HeaderRight />);
      
      // Click the add icon button (new chat button)
      fireEvent.press(getByTestId('icon-add-outline'));
      
      // Should not throw
      await waitFor(() => {
        expect(mockStore.createNewThread).toHaveBeenCalled();
      });
    });
  });

  describe('Props passing', () => {
    it('passes status to ChatView', () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      expect(screen.getByTestId('status')).toHaveTextContent('connected');
    });

    it('passes messages to ChatView', () => {
      mockStore.getCurrentMessages.mockReturnValue([
        { id: '1', type: 'message', role: 'user', content: 'Hello' },
        { id: '2', type: 'message', role: 'assistant', content: 'Hi' },
      ]);
      
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      expect(screen.getByTestId('message-count')).toHaveTextContent('2');
    });

    it('passes error to ChatView', () => {
      const storeWithError = {
        ...mockStore,
        error: 'Connection error',
      };
      
      (useChatStore as any).mockImplementation((selector?: any) => {
        if (selector) {
          return selector(storeWithError);
        }
        return storeWithError;
      });
      
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      expect(screen.getByTestId('error')).toHaveTextContent('Connection error');
    });

    it('passes statusMessage to ChatView', () => {
      const storeWithStatus = {
        ...mockStore,
        statusMessage: 'Reconnecting...',
      };
      
      (useChatStore as any).mockImplementation((selector?: any) => {
        if (selector) {
          return selector(storeWithStatus);
        }
        return storeWithStatus;
      });
      
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      expect(screen.getByTestId('status-message')).toHaveTextContent('Reconnecting...');
    });
  });

  describe('User interactions', () => {
    it('calls sendMessage when send button pressed', () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      fireEvent.press(screen.getByTestId('send-button'));
      
      expect(mockStore.sendMessage).toHaveBeenCalled();
    });

    it('calls stopGeneration when stop button pressed', () => {
      render(<ChatScreen navigation={mockNavigation as any} route={{} as any} />);
      
      fireEvent.press(screen.getByTestId('stop-button'));
      
      expect(mockStore.stopGeneration).toHaveBeenCalled();
    });
  });

  describe('Different status states', () => {
    const statuses = [
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
        const storeWithStatus = {
          ...mockStore,
          status,
        };
        
        (useChatStore as any).mockImplementation((selector?: any) => {
          if (selector) {
            return selector(storeWithStatus);
          }
          return storeWithStatus;
        });
        
        const { UNSAFE_root } = render(
          <ChatScreen navigation={mockNavigation as any} route={{} as any} />
        );
        
        expect(UNSAFE_root).toBeTruthy();
      });
    });
  });
});
