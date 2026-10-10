/**
 * Main chat view component.
 * Container for message list and composer.
 */

import React, { useCallback, useContext } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HeaderHeightContext } from '@react-navigation/elements';
import { Message, MessageContent, ChatStatus } from '../../types';
import type { MediaGenerationRequest } from '../../stores/MediaGenerationStore';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import { ChatOptionsBar } from './ChatOptionsBar';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZE, FONT_WEIGHT, HIT_SLOP, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../../utils/tokens';

interface ChatViewProps {
  status: ChatStatus;
  messages: Message[];
  /** Resolves `true` when the message went out; the composer keeps the draft otherwise. */
  onSendMessage: (content: MessageContent[], text: string, mediaGeneration?: MediaGenerationRequest) => Promise<boolean>;
  onStop?: () => void;
  onRefresh?: () => Promise<void>;
  /** Opens a new chat socket; shown as a button when the socket is down. */
  onReconnect?: () => void | Promise<void>;
  error?: string | null;
  statusMessage?: string | null;
  agentMode?: boolean;
  helpMode?: boolean;
  selectedCollections?: string[];
  selectedTools?: string[];
  onToggleAgentMode?: (next: boolean) => void;
  onToggleHelpMode?: (next: boolean) => void;
  onChangeCollections?: (next: string[]) => void;
  onChangeTools?: (next: string[]) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  status,
  messages,
  onSendMessage,
  onStop,
  onRefresh,
  onReconnect,
  error,
  statusMessage,
  agentMode = false,
  helpMode = false,
  selectedCollections = [],
  selectedTools = [],
  onToggleAgentMode,
  onToggleHelpMode,
  onChangeCollections,
  onChangeTools,
}) => {
  const { colors } = useTheme();
  // The navigator header sits above this view, so the keyboard has to clear
  // it too. Read from context so the view still renders outside a navigator.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const isLoading = status === 'loading';
  const isStreaming = status === 'streaming';

  const handleSendMessage = useCallback(
    (content: MessageContent[], text: string, mediaGeneration?: MediaGenerationRequest) =>
      onSendMessage(content, text, mediaGeneration),
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
                onPress={() => {
                  void onSendMessage([{ type: 'text', text: suggestion.text } as MessageContent], suggestion.text);
                }}
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

  const handleReconnect = useCallback(() => {
    void Promise.resolve(onReconnect?.()).catch((err: unknown) => {
      console.error('Failed to reconnect:', err);
    });
  }, [onReconnect]);

  const isOffline = status === 'disconnected' || status === 'failed';

  const renderErrorBanner = () => {
    // While the socket is down the connection banner carries the error as
    // its detail line, so one banner explains what happened and how to fix it.
    if (!error || isOffline) {
      return null;
    }
    return (
      <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
        <Ionicons name="warning-outline" size={15} color={colors.error} style={styles.bannerIcon} />
        <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
      </View>
    );
  };

  const renderConnectionBanner = () => {
    if (status === 'connecting') {
      return (
        <View style={[styles.banner, { backgroundColor: colors.warning + '18' }]}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} style={styles.bannerIcon} />
          <Text style={[styles.bannerText, { color: colors.warning }]}>Connecting...</Text>
        </View>
      );
    }

    if (status === 'reconnecting') {
      return (
        <View style={[styles.banner, { backgroundColor: colors.info + '18' }]}>
          <Ionicons name="sync-outline" size={15} color={colors.info} style={styles.bannerIcon} />
          <Text style={[styles.bannerText, { color: colors.info }]}>
            {statusMessage || 'Reconnecting...'}
          </Text>
        </View>
      );
    }

    if (status === 'disconnected' || status === 'failed') {
      // Nothing retries after 'failed', and a 'disconnected' socket may be
      // waiting out a long backoff, so both offer an immediate retry.
      const tint = status === 'failed' ? colors.error : colors.warning;
      return (
        <View
          style={[styles.banner, { backgroundColor: tint + '18' }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="connection-banner"
        >
          <Ionicons name="cloud-offline-outline" size={15} color={tint} style={styles.bannerIcon} />
          <View style={styles.bannerTextColumn}>
            <Text style={[styles.bannerText, styles.bannerTitle, { color: tint }]}>
              {status === 'failed' ? 'Could not connect to chat' : 'Disconnected'}
            </Text>
            {error ? (
              <Text style={[styles.bannerText, { color: colors.textSecondary }]} numberOfLines={2}>
                {error}
              </Text>
            ) : null}
          </View>
          {onReconnect && (
            <TouchableOpacity
              onPress={handleReconnect}
              style={[styles.reconnectButton, { borderColor: tint }]}
              hitSlop={HIT_SLOP}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Reconnect to chat"
            >
              <Text style={[styles.reconnectText, { color: tint }]}>Reconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return null;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {renderErrorBanner()}
      {renderConnectionBanner()}

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

      {(onToggleAgentMode || onToggleHelpMode || onChangeCollections || onChangeTools) && (
        <ChatOptionsBar
          agentMode={agentMode}
          helpMode={helpMode}
          selectedCollections={selectedCollections}
          selectedTools={selectedTools}
          onToggleAgentMode={onToggleAgentMode || (() => {})}
          onToggleHelpMode={onToggleHelpMode || (() => {})}
          onChangeCollections={onChangeCollections || (() => {})}
          onChangeTools={onChangeTools || (() => {})}
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
  // The row is centred, so without `flex` a long error string overflows and is
  // clipped at both ends. Taking the leftover width lets it wrap instead.
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  bannerTextColumn: {
    flex: 1,
    gap: SPACING.xxs,
  },
  bannerTitle: {
    fontWeight: FONT_WEIGHT.semibold,
  },
  bannerIcon: {
    marginRight: SPACING.sm - SPACING.xxs,
  },
  reconnectButton: {
    marginLeft: SPACING.sm,
    minHeight: MIN_TOUCH_TARGET - SPACING.lg,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reconnectText: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.semibold,
  },
});

export default ChatView;
