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
import { ChatOptionsBar } from './ChatOptionsBar';
import { useTheme } from '../../hooks/useTheme';

interface ChatViewProps {
  status: ChatStatus;
  messages: Message[];
  onSendMessage: (content: MessageContent[], text: string) => Promise<void>;
  onStop?: () => void;
  onRefresh?: () => Promise<void>;
  error?: string | null;
  statusMessage?: string | null;
  agentMode?: boolean;
  helpMode?: boolean;
  selectedCollections?: string[];
  onToggleAgentMode?: (next: boolean) => void;
  onToggleHelpMode?: (next: boolean) => void;
  onChangeCollections?: (next: string[]) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  status,
  messages,
  onSendMessage,
  onStop,
  onRefresh,
  error,
  statusMessage,
  agentMode = false,
  helpMode = false,
  selectedCollections = [],
  onToggleAgentMode,
  onToggleHelpMode,
  onChangeCollections,
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
            <Ionicons name="chatbubbles-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Start a Conversation</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Ask questions, get help with tasks,{'\n'}or explore ideas with AI.
          </Text>
          <View style={styles.suggestionsContainer}>
            {[
              { icon: 'book-outline' as const, text: 'Summarize a topic' },
              { icon: 'pencil-outline' as const, text: 'Help me write' },
              { icon: 'bulb-outline' as const, text: 'Explain a concept' },
            ].map((suggestion) => (
              <TouchableOpacity
                key={suggestion.text}
                style={[styles.suggestionChip, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
                onPress={() => onSendMessage([{ type: 'text', text: suggestion.text } as MessageContent], suggestion.text)}
                accessibilityRole="button"
                accessibilityLabel={`Suggest: ${suggestion.text}`}
                activeOpacity={0.7}
              >
                <Ionicons name={suggestion.icon} size={15} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion.text}</Text>
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
        <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
          <Ionicons name="warning-outline" size={15} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
        </View>
      );
    }

    if (status === 'disconnected' || status === 'connecting') {
      return (
        <View style={[styles.banner, { backgroundColor: colors.warning + '18' }]}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} style={{ marginRight: 6 }} />
          <Text style={[styles.bannerText, { color: colors.warning }]}>
            {status === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </Text>
        </View>
      );
    }

    if (status === 'reconnecting') {
      return (
        <View style={[styles.banner, { backgroundColor: colors.info + '18' }]}>
          <Ionicons name="sync-outline" size={15} color={colors.info} style={{ marginRight: 6 }} />
          <Text style={[styles.bannerText, { color: colors.info }]}>
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

      {(onToggleAgentMode || onToggleHelpMode || onChangeCollections) && (
        <ChatOptionsBar
          agentMode={agentMode}
          helpMode={helpMode}
          selectedCollections={selectedCollections}
          onToggleAgentMode={onToggleAgentMode || (() => {})}
          onToggleHelpMode={onToggleHelpMode || (() => {})}
          onChangeCollections={onChangeCollections || (() => {})}
        />
      )}

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
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  suggestionsContainer: {
    width: '100%',
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  banner: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default ChatView;
