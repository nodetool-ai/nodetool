/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { Box, Typography, CircularProgress } from '@mui/material';
import type { ChatMessage as ChatMessageType } from '../../types';
import ChatMarkdown from '../../components/chat/message/ChatMarkdown';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

const messageContainerStyles = (isUser: boolean) => css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: isUser ? 'flex-end' : 'flex-start',
  marginBottom: '12px',
  padding: '0 16px'
});

const messageBubbleStyles = (isUser: boolean) => css({
  maxWidth: '85%',
  padding: isUser ? '10px 14px' : '12px 14px',
  borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
  backgroundColor: isUser ? '#60A5FA' : 'rgba(255, 255, 255, 0.05)',
  color: isUser ? '#fff' : 'rgba(255, 255, 255, 0.9)',
  wordBreak: 'break-word',
  border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.06)'
});

const timestampStyles = css({
  fontSize: '10px',
  color: 'rgba(255, 255, 255, 0.3)',
  marginTop: '4px'
});

const systemMessageStyles = css({
  textAlign: 'center',
  margin: '8px 16px',
  padding: '6px 12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(167, 139, 250, 0.1)',
  border: '1px solid rgba(167, 139, 250, 0.2)',
  fontSize: '12px',
  color: '#A78BFA'
});

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const getContent = (): string => {
    if (typeof message.content === 'string') {
      return message.content || '';
    }
    if (!message.content || !Array.isArray(message.content)) {
      return '';
    }
    return message.content
      .filter((c) => c != null && typeof c === 'object')
      .map((c) => {
        const item = c as { type: string; text?: string; image?: { uri: string } };
        if (item.type === 'text' && item.text) {
          return item.text;
        }
        if (item.type === 'image_url' && item.image) {
          return `![Image](${item.image.uri})`;
        }
        return '';
      })
      .join('\n');
  };

  const content = getContent();
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <Box css={systemMessageStyles}>
        {content}
      </Box>
    );
  }

  return (
    <Box css={messageContainerStyles(isUser)}>
      <Box css={messageBubbleStyles(isUser)}>
        {isUser ? (
          <Typography 
            variant="body2" 
            component="div" 
            sx={{ 
              whiteSpace: 'pre-wrap',
              fontSize: '13px',
              lineHeight: 1.5
            }}
          >
            {content}
          </Typography>
        ) : (
          <ChatMarkdown content={content} />
        )}
        {isStreaming && !isUser && (
          <CircularProgress
            size={10}
            sx={{ ml: 1, verticalAlign: 'middle', color: '#60A5FA' }}
          />
        )}
      </Box>

      <Typography css={timestampStyles}>
        {new Date(message.timestamp).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}
      </Typography>
    </Box>
  );
}

export default ChatMessage;
