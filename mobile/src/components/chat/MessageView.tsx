/**
 * Individual message view component.
 * Renders user or assistant messages with appropriate styling.
 * Supports text, images, videos, audio, and documents.
 * Long-press to copy message text.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
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
      .filter((c: MessageContent) => c?.type === 'text')
      .map((c: MessageContent) => (c as Record<string, unknown>)?.text || '')
      .join('\n');
  }

  if (typeof content === 'object' && 'type' in content) {
    if (content.type === 'text' && 'text' in content) {
      return (content as Record<string, unknown>).text as string || '';
    }
  }

  return '';
}

/**
 * Type guard: checks whether a plain object looks like a valid MessageContent item.
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

export const MessageView: React.FC<MessageViewProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const { colors } = useTheme();

  const textContent = getTextContent(message.content);

  const handleCopyMessage = useCallback(async () => {
    if (textContent) {
      await Clipboard.setStringAsync(textContent);
      Alert.alert('Copied', 'Message copied to clipboard');
    }
  }, [textContent]);

  const renderTextContent = useCallback((text: string, index: number) => {
    if (!text) { return null; }

    if (isUser) {
      return <Text key={index} style={[styles.userText, { color: colors.userBubbleText }]}>{text}</Text>;
    }
    return <ChatMarkdown key={index} content={text} />;
  }, [isUser, colors.userBubbleText]);

  if (message.role === 'system' || message.role === 'tool') {
    return null;
  }

  const contentItems = getContentItems(message.content);
  const hasMedia = hasMediaContent(message.content);

  const renderSimpleMessage = () => {
    if (isUser) {
      return <Text style={[styles.userText, { color: colors.userBubbleText }]}>{textContent}</Text>;
    }
    return <ChatMarkdown content={textContent} />;
  };

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
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.userBubbleBg }]
            : [styles.assistantBubble, { backgroundColor: colors.assistantBubbleBg }],
        ]}
      >
        {hasMedia ? renderMixedContent() : renderSimpleMessage()}
      </View>
      {/* Copy button for assistant messages */}
      {!isUser && textContent.length > 0 && (
        <TouchableOpacity
          style={[styles.copyButton, { backgroundColor: colors.primaryLight }]}
          onPress={handleCopyMessage}
          accessibilityLabel="Copy message"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="copy-outline" size={13} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
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
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    borderBottomLeftRadius: 6,
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    borderRadius: 6,
  },
});

export default MessageView;
