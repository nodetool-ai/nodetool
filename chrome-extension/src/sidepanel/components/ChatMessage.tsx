/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { Box, Typography, Avatar, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import type { ChatMessage as ChatMessageType } from '../../types';

const messageContainerStyles = (isUser: boolean) => css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: isUser ? 'flex-end' : 'flex-start',
  marginBottom: '16px',
  padding: '0 16px'
});

const messageBubbleStyles = (isUser: boolean) => css({
  maxWidth: '85%',
  padding: '12px 16px',
  borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
  backgroundColor: isUser ? '#1976d2' : 'rgba(255, 255, 255, 0.08)',
  color: isUser ? '#fff' : 'inherit',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap'
});

const avatarStyles = css({
  width: 28,
  height: 28,
  marginBottom: '4px'
});

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const getContent = () => {
    if (typeof message.content === 'string') {
      return message.content;
    }
    // Handle array content (multi-modal)
    return message.content
      .map((c) => {
        if (c.type === 'text' && c.text) {
          return c.text;
        }
        if (c.type === 'image_url' && c.image) {
          return `[Image: ${c.image.uri}]`;
        }
        return '';
      })
      .join('\n');
  };

  const content = getContent();

  if (isSystem) {
    return (
      <Box sx={{ textAlign: 'center', my: 1, px: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.warning.main,
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
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
    <Box css={messageContainerStyles(isUser)}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <Avatar
          css={avatarStyles}
          sx={{
            bgcolor: isUser ? theme.palette.primary.main : theme.palette.secondary.main
          }}
        >
          {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
        </Avatar>

        <Box css={messageBubbleStyles(isUser)}>
          <Typography variant="body2" component="div">
            {content}
            {isStreaming && message.role === 'assistant' && (
              <CircularProgress
                size={12}
                sx={{ ml: 1, verticalAlign: 'middle' }}
              />
            )}
          </Typography>
        </Box>

        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.disabled,
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
