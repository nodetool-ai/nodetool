/**
 * Tests for ChatScreen
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ChatScreen from './ChatScreen';
import { useChatStore } from '../stores/ChatStore';
import type { RootStackParamList } from '../navigation/types';
import type { Message, MessageContent } from '../types/chat';

/** The props the stubbed ChatView below actually reads. */
interface MockChatViewProps {
  status: string;
  messages: Message[];
  onSendMessage: (content: MessageContent[], text: string) => void;
  onStop?: () => void;
  error?: string | null;
  statusMessage?: string | null;
}

// Mock ChatView component
jest.mock('../components/chat', () => ({
  ChatView: ({ status, messages, onSendMessage, onStop, error, statusMessage }: MockChatViewProps) => {
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

type ChatState = ReturnType<typeof useChatStore.getState>;
type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

/** The whole store these tests stand up, with the actions as spies. */
type MockChatStore = ChatState & {
  connect: jest.Mock;
  disconnect: jest.Mock;
  sendMessage: jest.Mock;
  stopGeneration: jest.Mock;
  createNewThread: jest.Mock;
  getCurrentMessages: jest.Mock;
};

const useChatStoreMock = jest.mocked(useChatStore);

/** Point the mocked store hook at a state object, selector-aware. */
const mockStoreState = (state: MockChatStore): void => {
  useChatStoreMock.mockImplementation((selector) =>
    selector ? selector(state) : state
  );
};

describe('ChatScreen', () => {
  const mockStore: MockChatStore = {
    status: 'connected',
    error: null,
    statusMessage: null,
    currentThreadId: 'thread-1',
    messageCache: { 'thread-1': [] },
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    stopGeneration: jest.fn(),
    createNewThread: jest.fn().mockResolvedValue('new-thread-id'),
    getCurrentMessages: jest.fn().mockReturnValue([]),
    wsManager: null,
    threads: {},
    isLoadingMessages: false,
    selectedModel: null,
    agentMode: false,
    helpMode: false,
    selectedCollections: [],
    selectedTools: [],
    loadThreadFromServer: jest.fn().mockResolvedValue(undefined),
    setSelectedModel: jest.fn(),
    setAgentMode: jest.fn(),
    setHelpMode: jest.fn(),
    setSelectedCollections: jest.fn(),
    setSelectedTools: jest.fn(),
    addMessageToCache: jest.fn(),
  };

  const setOptionsMock = jest.fn();
  const partialNavigation: Pick<
    ChatScreenProps['navigation'],
    'navigate' | 'setOptions' | 'goBack'
  > = {
    navigate: jest.fn(),
    setOptions: setOptionsMock,
    goBack: jest.fn(),
  };
  // SAFETY: ChatScreen calls only these three navigator methods.
  const mockNavigation = partialNavigation as ChatScreenProps['navigation'];

  // ChatScreen takes the full navigator prop pair; these tests drive only the
  // three navigation methods above and never read the route.
  const renderChatScreen = () =>
    render(
      <ChatScreen
        navigation={mockNavigation}
        route={{} as ChatScreenProps['route']}
      />
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState(mockStore);
  });

  describe('Rendering', () => {
    it('renders ChatView component', () => {
      renderChatScreen();
      
      expect(screen.getByTestId('chat-view')).toBeTruthy();
    });

    it('renders a safe-area-context SafeAreaView container', () => {
      const { UNSAFE_root } = renderChatScreen();

      const safeAreaView = UNSAFE_root.findByType(
        require('react-native-safe-area-context').SafeAreaView
      );
      expect(safeAreaView).toBeTruthy();
      // The header owns the top inset; the composer paints the bottom one.
      expect(safeAreaView.props.edges).toEqual(['left', 'right']);
    });
  });

  describe('Initialization', () => {
    it('calls connect on mount', async () => {
      renderChatScreen();
      
      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled();
      });
    });

    it('creates new thread if none exists', async () => {
      const storeWithoutThread = {
        ...mockStore,
        currentThreadId: null,
      };
      
      mockStoreState(storeWithoutThread);
      
      renderChatScreen();
      
      await waitFor(() => {
        expect(storeWithoutThread.createNewThread).toHaveBeenCalled();
      });
    });

    it('handles connection error gracefully', async () => {
      mockStore.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      renderChatScreen();
      
      // Should not throw
      await waitFor(() => {
        expect(mockStore.connect).toHaveBeenCalled();
      });
    });
  });

  describe('Header configuration', () => {
    it('sets header right button', () => {
      renderChatScreen();
      
      expect(mockNavigation.setOptions).toHaveBeenCalled();
    });

    it('displays selected model name in header', () => {
      const storeWithModel = {
        ...mockStore,
        selectedModel: {
          type: 'language_model' as const,
          id: 'gpt-4',
          name: 'GPT-4',
          provider: 'openai' as const,
        },
      };
      
      mockStoreState(storeWithModel);

      renderChatScreen();
      
      const setOptionsCall = setOptionsMock.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByText } = render(<HeaderRight />);
      expect(getByText('GPT-4')).toBeTruthy();
    });

    it('displays "Model" when no model selected', () => {
      const storeWithoutModel = {
        ...mockStore,
        selectedModel: null,
      };
      
      mockStoreState(storeWithoutModel);

      renderChatScreen();
      
      const setOptionsCall = setOptionsMock.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByText } = render(<HeaderRight />);
      expect(getByText('Model')).toBeTruthy();
    });

    it('header button creates new chat', async () => {
      renderChatScreen();
      
      // Get the headerRight component
      const setOptionsCall = setOptionsMock.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByTestId } = render(<HeaderRight />);
      
      // Click the add icon button (new chat button)
      fireEvent.press(getByTestId('icon-add-circle-outline'));
      
      await waitFor(() => {
        expect(mockStore.createNewThread).toHaveBeenCalled();
      });
    });

    it('handles new chat error gracefully', async () => {
      mockStore.createNewThread.mockRejectedValueOnce(new Error('Failed'));
      
      renderChatScreen();
      
      const setOptionsCall = setOptionsMock.mock.calls[0][0];
      const HeaderRight = setOptionsCall.headerRight;
      
      const { getByTestId } = render(<HeaderRight />);
      
      // Click the add icon button (new chat button)
      fireEvent.press(getByTestId('icon-add-circle-outline'));
      
      // Should not throw
      await waitFor(() => {
        expect(mockStore.createNewThread).toHaveBeenCalled();
      });
    });
  });

  describe('Props passing', () => {
    it('passes status to ChatView', () => {
      renderChatScreen();
      
      expect(screen.getByTestId('status')).toHaveTextContent('connected');
    });

    it('passes messages to ChatView', () => {
      mockStore.messageCache['thread-1'] = [
        { id: '1', type: 'message', role: 'user', content: 'Hello' },
        { id: '2', type: 'message', role: 'assistant', content: 'Hi' },
      ];

      renderChatScreen();

      expect(screen.getByTestId('message-count')).toHaveTextContent('2');
    });

    it('passes error to ChatView', () => {
      const storeWithError = {
        ...mockStore,
        error: 'Connection error',
      };
      
      mockStoreState(storeWithError);
      
      renderChatScreen();
      
      expect(screen.getByTestId('error')).toHaveTextContent('Connection error');
    });

    it('passes statusMessage to ChatView', () => {
      const storeWithStatus = {
        ...mockStore,
        statusMessage: 'Reconnecting...',
      };
      
      mockStoreState(storeWithStatus);
      
      renderChatScreen();
      
      expect(screen.getByTestId('status-message')).toHaveTextContent('Reconnecting...');
    });
  });

  describe('User interactions', () => {
    it('calls sendMessage when send button pressed', () => {
      renderChatScreen();
      
      fireEvent.press(screen.getByTestId('send-button'));
      
      expect(mockStore.sendMessage).toHaveBeenCalled();
    });

    it('calls stopGeneration when stop button pressed', () => {
      renderChatScreen();
      
      fireEvent.press(screen.getByTestId('stop-button'));
      
      expect(mockStore.stopGeneration).toHaveBeenCalled();
    });
  });

  describe('Different status states', () => {
    const statuses: ChatState['status'][] = [
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
        
        mockStoreState(storeWithStatus);
        
        const { UNSAFE_root } = renderChatScreen();
        
        expect(UNSAFE_root).toBeTruthy();
      });
    });
  });
});
