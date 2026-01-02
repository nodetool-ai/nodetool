/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { Box, Typography, CircularProgress } from '@mui/material';
import type { ChatMessage as ChatMessageType } from '../../types';
import ChatMarkdown from '../../components/chat/message/ChatMarkdown';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

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
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <Box sx={{ textAlign: 'center', my: 1, px: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: '#FFB86C',
            backgroundColor: 'rgba(255, 184, 108, 0.15)',
            padding: '4px 12px',
            borderRadius: '12px'
          }}
        >
          {content}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      css={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
        marginBottom: '16px',
        padding: '0 16px'
      })}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
          maxWidth: '90%'
        }}
      >
        <Box
          css={css({
            maxWidth: '90%',
            padding: '12px 16px',
            borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            backgroundColor: message.role === 'user' ? 'var(--palette-primary-main)' : 'var(--palette-grey-800)',
            color: message.role === 'user' ? '#fff' : 'inherit',
            wordBreak: 'break-word'
          })}
        >
          {message.role === 'user' ? (
            <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
              {content}
            </Typography>
          ) : (
            <ChatMarkdown content={content} />
          )}
          {isStreaming && message.role === 'assistant' && (
            <CircularProgress
              size={12}
              sx={{ ml: 1, verticalAlign: 'middle' }}
            />
          )}
        </Box>

        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            mt: 0.5,
            fontSize: '0.7rem'
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </Typography>
      </Box>
    </Box>
  );
}

export default ChatMessage;
