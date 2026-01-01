/**
 * Individual message view component.
 * Renders user or assistant messages with appropriate styling.
 * Supports text, images, videos, audio, and documents.
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  if (!content) {return '';}
  
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
 * Get content items as an array of MessageContent
 */
function getContentItems(content: Message['content']): MessageContent[] {
  if (!content) {return [];}
  
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  
  if (Array.isArray(content)) {
    return content.filter((c): c is MessageContent => c !== null && c !== undefined);
  }
  
  // Single object content
  if (typeof content === 'object' && 'type' in content) {
    return [content as MessageContent];
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
  const isAssistant = message.role === 'assistant';
  const { colors, mode } = useTheme();
  
  // Skip non-user/assistant messages
  if (!isUser && !isAssistant) {
    return null;
  }

  const contentItems = getContentItems(message.content);
  const textContent = getTextContent(message.content);
  const hasMedia = hasMediaContent(message.content);

  /**
   * Render text content (used as callback for MessageContentRenderer)
   */
  const renderTextContent = useCallback((text: string, index: number) => {
    if (!text) {return null;}
    
    if (isUser) {
      return <Text key={index} style={[styles.userText, { color: '#2A2A2A' }]}>{text}</Text>;
    }
    return <ChatMarkdown key={index} content={text} />;
  }, [isUser]);

  /**
   * Render simple text-only message
   */
  const renderSimpleMessage = () => {
    if (isUser) {
      return <Text style={[styles.userText, { color: '#2A2A2A' }]}>{textContent}</Text>;
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
    >
      <View
        style={[
          styles.bubble,
          isUser 
            ? [styles.userBubble, { backgroundColor: '#EFEFEF' }] 
            : [styles.assistantBubble, { backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.05)' }],
        ]}
      >
        {hasMedia ? renderMixedContent() : renderSimpleMessage()}
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
