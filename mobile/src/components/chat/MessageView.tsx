/**
 * Individual message view component.
 * Renders user or assistant messages with appropriate styling.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../../types';
import { ChatMarkdown } from './ChatMarkdown';
import { useTheme } from '../../hooks/useTheme';

interface MessageViewProps {
  message: Message;
}

/**
 * Extract text content from message
 */
function getTextContent(content: Message['content']): string {
  if (!content) return '';
  
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

export const MessageView: React.FC<MessageViewProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const { colors, mode } = useTheme();
  
  // Skip non-user/assistant messages
  if (!isUser && !isAssistant) {
    return null;
  }

  const textContent = getTextContent(message.content);

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser 
            ? [styles.userBubble, { backgroundColor: '#EFEFEF' }] 
            : [styles.assistantBubble, { backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.05)' }],
        ]}
      >
        {isUser ? (
          // User messages: plain text
          <Text style={[styles.userText, { color: '#2A2A2A' }]}>{textContent}</Text>
        ) : (
          // Assistant messages: markdown rendered
          <ChatMarkdown content={textContent} />
        )}
      </View>
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
});

export default MessageView;
