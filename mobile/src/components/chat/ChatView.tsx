/**
 * Main chat view component.
 * Container for message list and composer.
 */

import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { Message, MessageContent, ChatStatus } from '../../types';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';

interface ChatViewProps {
  status: ChatStatus;
  messages: Message[];
  onSendMessage: (content: MessageContent[], text: string) => Promise<void>;
  onStop?: () => void;
  error?: string | null;
  statusMessage?: string | null;
}

export const ChatView: React.FC<ChatViewProps> = ({
  status,
  messages,
  onSendMessage,
  onStop,
  error,
  statusMessage,
}) => {
  const isLoading = status === 'loading';
  const isStreaming = status === 'streaming';

  const handleSendMessage = useCallback(
    (content: MessageContent[], text: string) => {
      onSendMessage(content, text);
    },
    [onSendMessage]
  );

  const renderEmptyState = () => {
    if (messages.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Welcome to Chat</Text>
          <Text style={styles.emptySubtitle}>
            Start a conversation by typing a message below
          </Text>
        </View>
      );
    }
    return null;
  };

  const renderStatusBanner = () => {
    if (error) {
      return (
        <View style={[styles.banner, styles.errorBanner]}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      );
    }

    if (status === 'disconnected' || status === 'connecting') {
      return (
        <View style={[styles.banner, styles.warningBanner]}>
          <Text style={styles.bannerText}>
            {status === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </Text>
        </View>
      );
    }

    if (status === 'reconnecting') {
      return (
        <View style={[styles.banner, styles.infoBanner]}>
          <Text style={styles.bannerText}>
            {statusMessage || 'Reconnecting...'}
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {renderStatusBanner()}
      
      <View style={styles.messagesContainer}>
        {messages.length === 0 ? (
          renderEmptyState()
        ) : (
          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
          />
        )}
      </View>

      <ChatComposer
        status={status}
        onSendMessage={handleSendMessage}
        onStop={onStop}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  messagesContainer: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#808080',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  warningBanner: {
    backgroundColor: 'rgba(255, 159, 10, 0.2)',
  },
  infoBanner: {
    backgroundColor: 'rgba(10, 132, 255, 0.2)',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});

export default ChatView;
