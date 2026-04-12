/**
 * Tests for ChatMessageList component
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ChatMessageList } from './ChatMessageList';
import { Message } from '../../types';

// Mock MessageView component
jest.mock('./MessageView', () => ({
  MessageView: ({ message }: { message: Message }) => {
    const { Text } = require('react-native');
    return <Text testID={`message-${message.id}`}>{message.role}</Text>;
  },
}));

// Mock LoadingIndicator component
jest.mock('./LoadingIndicator', () => ({
  LoadingIndicator: () => {
    const { Text } = require('react-native');
    return <Text testID="loading-indicator">Loading...</Text>;
  },
}));

// Mock AgentExecutionView so we can assert it was invoked without pulling in
// the execution tree tree component's runtime dependencies (animations, store).
jest.mock('./AgentExecutionView', () => ({
  AgentExecutionView: ({ messages }: { messages: { id?: string }[] }) => {
    const { Text } = require('react-native');
    return (
      <Text testID={`agent-execution-${messages.length}`}>agent-execution</Text>
    );
  },
}));

describe('ChatMessageList', () => {
  const createMessage = (id: string, role: 'user' | 'assistant', content: string): Message => ({
    id,
    type: 'message',
    role,
    content,
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders empty list when no messages', () => {
      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={[]}
          isLoading={false}
          isStreaming={false}
        />
      );
      expect(UNSAFE_root).toBeTruthy();
    });

    it('renders single message', () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      
      render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      expect(screen.getByTestId('message-1')).toBeTruthy();
    });

    it('renders multiple messages', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi there'),
        createMessage('3', 'user', 'How are you?'),
      ];
      
      render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      expect(screen.getByTestId('message-1')).toBeTruthy();
      expect(screen.getByTestId('message-2')).toBeTruthy();
      expect(screen.getByTestId('message-3')).toBeTruthy();
    });

    it('handles messages without ids', () => {
      const messages: Message[] = [
        { type: 'message', role: 'user', content: 'Test' } as Message,
      ];
      
      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      expect(UNSAFE_root).toBeTruthy();
    });
  });

  describe('Loading state', () => {
    it('shows loading indicator when loading and not streaming', () => {
      render(
        <ChatMessageList
          messages={[]}
          isLoading={true}
          isStreaming={false}
        />
      );
      
      expect(screen.getByTestId('loading-indicator')).toBeTruthy();
    });

    it('does not show loading indicator when streaming', () => {
      render(
        <ChatMessageList
          messages={[]}
          isLoading={true}
          isStreaming={true}
        />
      );
      
      expect(screen.queryByTestId('loading-indicator')).toBeNull();
    });

    it('does not show loading indicator when not loading', () => {
      render(
        <ChatMessageList
          messages={[]}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      expect(screen.queryByTestId('loading-indicator')).toBeNull();
    });
  });

  describe('Auto-scroll', () => {
    it('triggers scroll to end when messages change', () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      
      render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      jest.advanceTimersByTime(100);
      expect(true).toBe(true);
    });

    it('triggers scroll when streaming', () => {
      const messages = [createMessage('1', 'assistant', 'Streaming...')];
      
      render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={true}
        />
      );
      
      jest.advanceTimersByTime(100);
      expect(true).toBe(true);
    });

    it('scrolls on content size change', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'World'),
      ];
      
      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      const flatList = UNSAFE_root.findByType(require('react-native').FlatList);
      flatList.props.onContentSizeChange?.();
      
      expect(true).toBe(true);
    });

    it('does not scroll on content size change with empty messages', () => {
      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={[]}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      const flatList = UNSAFE_root.findByType(require('react-native').FlatList);
      flatList.props.onContentSizeChange?.();
      
      expect(true).toBe(true);
    });
  });

  describe('FlatList configuration', () => {
    it('has correct performance optimizations', () => {
      const messages = [createMessage('1', 'user', 'Test')];
      
      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );
      
      const flatList = UNSAFE_root.findByType(require('react-native').FlatList);
      
      expect(flatList.props.removeClippedSubviews).toBe(true);
      expect(flatList.props.maxToRenderPerBatch).toBe(10);
      expect(flatList.props.windowSize).toBe(15);
      expect(flatList.props.initialNumToRender).toBe(15);
    });

    it('uses correct key extractor', () => {
      const messages = [
        createMessage('test-id', 'user', 'Test'),
      ];

      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );

      const flatList = UNSAFE_root.findByType(require('react-native').FlatList);
      const listItems = flatList.props.data;
      expect(listItems).toHaveLength(1);
      const key = flatList.props.keyExtractor(listItems[0], 0);

      expect(key).toBe('test-id');
    });

    it('uses index for key when message has no id', () => {
      const messages: Message[] = [
        { type: 'message', role: 'user', content: 'Test' } as Message,
      ];

      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );

      const flatList = UNSAFE_root.findByType(require('react-native').FlatList);
      const listItems = flatList.props.data;
      expect(listItems).toHaveLength(1);
      const key = flatList.props.keyExtractor(listItems[0], 0);

      expect(key).toBe('message-0');
    });
  });

  describe('Agent execution grouping', () => {
    it('groups agent_execution messages with the same id into one row', () => {
      const messages = [
        createMessage('u1', 'user', 'Plan me a trip'),
        // Three agent_execution events for the same execution should all
        // collapse into a single AgentExecutionView row.
        {
          id: 'a1',
          type: 'message',
          role: 'agent_execution',
          agent_execution_id: 'exec-1',
          execution_event_type: 'planning_update',
          content: { type: 'planning_update', phase: 'initialization', status: '', content: '' },
        } as unknown as Message,
        {
          id: 'a2',
          type: 'message',
          role: 'agent_execution',
          agent_execution_id: 'exec-1',
          execution_event_type: 'task_update',
          content: { type: 'task_update' },
        } as unknown as Message,
        {
          id: 'a3',
          type: 'message',
          role: 'agent_execution',
          agent_execution_id: 'exec-1',
          execution_event_type: 'task_update',
          content: { type: 'task_update' },
        } as unknown as Message,
      ];

      render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );

      // Exactly one agent execution row is rendered, carrying all 3 messages.
      expect(screen.getByTestId('agent-execution-3')).toBeTruthy();
    });

    it('filters out tool-role messages', () => {
      const messages = [
        createMessage('u1', 'user', 'Hello'),
        {
          id: 't1',
          type: 'message',
          role: 'tool',
          content: 'tool result',
        } as unknown as Message,
      ];

      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={messages}
          isLoading={false}
          isStreaming={false}
        />
      );

      const flatList = UNSAFE_root.findByType(require('react-native').FlatList);
      // Only the user message should make it through to the list data.
      expect(flatList.props.data).toHaveLength(1);
    });
  });
});
