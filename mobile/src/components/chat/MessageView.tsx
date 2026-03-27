/**
 * Individual message view component.
 * Renders user or assistant messages with appropriate styling.
 * Supports text, images, videos, audio, and documents.
 * Long press to copy message text to clipboard.
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Message, MessageContent } from '../../types';
import { ChatMarkdown } from './ChatMarkdown';
import { MessageContentRenderer } from './MessageContentRenderer';
import { useTheme } from '../../hooks/useTheme';

interface MessageViewProps {
  message: Message;
}

/**
 * Extract text content from message for simple text display
 */
function getTextContent(content: Message['content']): string {
  if (!content) { return ''; }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c?.text || '')
      .join('\n');
  }

  // Handle object case (MessageContent type)
  if (typeof content === 'object' && 'type' in content) {
    if (content.type === 'text' && 'text' in content) {
      return (content as any).text || '';
    }
  }

  return '';
}

/**
 * Type guard: checks whether a plain object looks like a valid MessageContent item.
 * Used when Message.content arrives as Record<string, unknown>.
 */
function isMessageContent(obj: unknown): obj is MessageContent {
  return typeof obj === 'object' && obj !== null && 'type' in obj && typeof (obj as Record<string, unknown>)['type'] === 'string';
}

/**
 * Get content items as an array of MessageContent
 */
function getContentItems(content: Message['content']): MessageContent[] {
  if (!content) { return []; }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (Array.isArray(content)) {
    return content.filter((c): c is MessageContent => c !== null && c !== undefined);
  }

  // Single object content — guard ensures it has a type discriminant
  if (isMessageContent(content)) {
    return [content];
  }

  return [];
}

/**
 * Check if content contains media (non-text) items
 */
function hasMediaContent(content: Message['content']): boolean {
  const items = getContentItems(content);
  return items.some(item => item.type !== 'text');
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) { return ''; }
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const MessageView: React.FC<MessageViewProps> = ({ message }) => {
  // All hooks must be called before any early returns
  const isUser = message.role === 'user';
  const { colors } = useTheme();

  /**
   * Copy message text to clipboard on long press
   */
  const handleLongPress = useCallback(async () => {
    const text = getTextContent(message.content);
    if (!text) { return; }
    try {
      await Clipboard.setStringAsync(text);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Silently fail on clipboard errors
    }
  }, [message.content]);

  /**
   * Render text content (used as callback for MessageContentRenderer)
   */
  const renderTextContent = useCallback((text: string, index: number) => {
    if (!text) { return null; }

    if (isUser) {
      return <Text key={index} style={[styles.userText, { color: colors.userBubbleText }]}>{text}</Text>;
    }
    return <ChatMarkdown key={index} content={text} />;
  }, [isUser, colors.userBubbleText]);

  // Return null for system and tool messages as they should not be displayed
  if (message.role === 'system' || message.role === 'tool') {
    return null;
  }

  const contentItems = getContentItems(message.content);
  const textContent = getTextContent(message.content);
  const hasMedia = hasMediaContent(message.content);
  const timestamp = formatTimestamp(message.created_at);

  /**
   * Render simple text-only message
   */
  const renderSimpleMessage = () => {
    if (isUser) {
      return <Text style={[styles.userText, { color: colors.userBubbleText }]}>{textContent}</Text>;
    }
    return <ChatMarkdown content={textContent} />;
  };

  /**
   * Render message with mixed content (text + media)
   */
  const renderMixedContent = () => {
    return (
      <>
        {contentItems.map((item, index) => (
          <MessageContentRenderer
            key={index}
            content={item}
            renderTextContent={renderTextContent}
            index={index}
          />
        ))}
      </>
    );
  };

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? 'You' : 'Assistant'}: ${textContent}`}
    >
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.userBubbleBg }]
            : [styles.assistantBubble, { backgroundColor: colors.assistantBubbleBg }],
          pressed && styles.bubblePressed,
        ]}
        accessibilityHint="Long press to copy message"
      >
        {hasMedia ? renderMixedContent() : renderSimpleMessage()}
      </Pressable>
      {timestamp ? (
        <Text style={[
          styles.timestamp,
          isUser ? styles.timestampRight : styles.timestampLeft,
          { color: colors.textSecondary },
        ]}>
          {timestamp}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubblePressed: {
    opacity: 0.7,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  timestampRight: {
    alignSelf: 'flex-end',
  },
  timestampLeft: {
    alignSelf: 'flex-start',
  },
});

export default MessageView;
