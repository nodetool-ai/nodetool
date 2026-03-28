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
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message, MessageContent, ChatStatus } from '../../types';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import { useTheme } from '../../hooks/useTheme';

interface ChatViewProps {
  status: ChatStatus;
  messages: Message[];
  onSendMessage: (content: MessageContent[], text: string) => Promise<void>;
  onStop?: () => void;
  onRefresh?: () => Promise<void>;
  error?: string | null;
  statusMessage?: string | null;
}

export const ChatView: React.FC<ChatViewProps> = ({
  status,
  messages,
  onSendMessage,
  onStop,
  onRefresh,
  error,
  statusMessage,
}) => {
  const { colors } = useTheme();
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
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Start a Conversation</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Ask questions, get help with tasks, or explore ideas with AI.
          </Text>
          <View style={styles.suggestionsContainer}>
            {['Summarize a topic', 'Help me write', 'Explain a concept'].map((suggestion) => (
              <TouchableOpacity
                key={suggestion}
                style={[styles.suggestionChip, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
                onPress={() => onSendMessage([{ type: 'text', text: suggestion } as MessageContent], suggestion)}
                accessibilityRole="button"
                accessibilityLabel={`Suggest: ${suggestion}`}
              >
                <Text style={[styles.suggestionText, { color: colors.primary }]}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }
    return null;
  };

  const renderStatusBanner = () => {
    if (error) {
      return (
        <View style={[styles.banner, { backgroundColor: 'rgba(255, 59, 48, 0.2)' }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>{error}</Text>
        </View>
      );
    }

    if (status === 'disconnected' || status === 'connecting') {
      return (
        <View style={[styles.banner, { backgroundColor: 'rgba(255, 159, 10, 0.2)' }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            {status === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </Text>
        </View>
      );
    }

    if (status === 'reconnecting') {
      return (
        <View style={[styles.banner, { backgroundColor: 'rgba(10, 132, 255, 0.2)' }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            {statusMessage || 'Reconnecting...'}
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
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
            onRefresh={onRefresh}
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
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 13,
  },
});

export default ChatView;
