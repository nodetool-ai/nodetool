/**
 * Markdown renderer for chat messages.
 * Uses react-native-markdown-display for rendering.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface ChatMarkdownProps {
  content: string;
}

const markdownStyles = StyleSheet.create({
  body: {
    color: '#E0E0E0',
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  heading2: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 6,
  },
  heading3: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  link: {
    color: '#6BA6FF',
    textDecorationLine: 'underline',
  },
  blockquote: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#6BA6FF',
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FF9F1C',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#E0E0E0',
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  fence: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#E0E0E0',
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  list_item: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  bullet_list: {
    marginLeft: 8,
  },
  ordered_list: {
    marginLeft: 8,
  },
  bullet_list_icon: {
    color: '#6BA6FF',
    marginRight: 8,
  },
  ordered_list_icon: {
    color: '#6BA6FF',
    marginRight: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    marginVertical: 8,
  },
  thead: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  th: {
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FFFFFF',
    fontWeight: '600',
  },
  td: {
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#E0E0E0',
  },
  hr: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    height: 1,
    marginVertical: 12,
  },
  strong: {
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  em: {
    fontStyle: 'italic',
    color: '#E0E0E0',
  },
  paragraph: {
    marginVertical: 4,
  },
  image: {
    width: '100%',
    maxHeight: 200,
    borderRadius: 8,
    marginVertical: 8,
  },
});

export const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  if (!content) {
    return null;
  }

  return (
    <Markdown style={markdownStyles}>
      {content}
    </Markdown>
  );
};

export default ChatMarkdown;
