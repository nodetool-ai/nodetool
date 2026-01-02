/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useState, useCallback, KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  Checkbox,
  FormControlLabel,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import LanguageIcon from '@mui/icons-material/Language';
import { useExtensionStore } from '../store';

const inputContainerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 16px',
  borderTop: '1px solid',
  gap: '8px'
});

const inputRowStyles = css({
  display: 'flex',
  alignItems: 'flex-end',
  gap: '8px'
});

interface ChatInputProps {
  onSendMessage: (message: string, includeContext: boolean) => Promise<void>;
  onStopGeneration: () => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, onStopGeneration, disabled }: ChatInputProps) {
  const theme = useTheme();
  const [message, setMessage] = useState('');
  const {
    isStreaming,
    autoIncludeContext,
    setAutoIncludeContext,
    pageContext
  } = useExtensionStore();

  const handleSend = useCallback(async () => {
    if (!message.trim() || disabled) return;

    const trimmedMessage = message.trim();
    setMessage('');

    try {
      await onSendMessage(trimmedMessage, autoIncludeContext);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [message, disabled, autoIncludeContext, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) {
          onStopGeneration();
        } else {
          handleSend();
        }
      }
    },
    [handleSend, isStreaming, onStopGeneration]
  );

  return (
    <Box
      css={inputContainerStyles}
      sx={{ borderColor: theme.palette.divider, bgcolor: theme.palette.background.paper }}
    >
      {/* Context toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={autoIncludeContext}
              onChange={(e) => setAutoIncludeContext(e.target.checked)}
              icon={<LanguageIcon sx={{ fontSize: 18, opacity: 0.5 }} />}
              checkedIcon={<LanguageIcon sx={{ fontSize: 18 }} />}
            />
          }
          label={
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              Include page content
            </Typography>
          }
          sx={{ m: 0, gap: 0.5 }}
        />
        {pageContext && autoIncludeContext && (
          <Tooltip title={pageContext.title}>
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.primary.main,
                maxWidth: 150,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {pageContext.title}
            </Typography>
          </Tooltip>
        )}
      </Box>

      {/* Input row */}
      <Box css={inputRowStyles}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          variant="outlined"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '24px',
              backgroundColor: theme.palette.background.default,
              '& fieldset': {
                borderColor: theme.palette.divider
              },
              '&:hover fieldset': {
                borderColor: theme.palette.primary.main
              }
            },
            '& .MuiInputBase-input': {
              padding: '12px 16px'
            }
          }}
        />

        {isStreaming ? (
          <Tooltip title="Stop generation">
            <IconButton
              onClick={onStopGeneration}
              color="error"
              sx={{
                bgcolor: 'rgba(244, 67, 54, 0.1)',
                '&:hover': { bgcolor: 'rgba(244, 67, 54, 0.2)' }
              }}
            >
              <StopIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Send message (Enter)">
            <span>
              <IconButton
                onClick={handleSend}
                disabled={!message.trim() || disabled}
                color="primary"
                sx={{
                  bgcolor: theme.palette.primary.main,
                  color: '#fff',
                  '&:hover': { bgcolor: theme.palette.primary.dark },
                  '&.Mui-disabled': {
                    bgcolor: theme.palette.action.disabledBackground,
                    color: theme.palette.action.disabled
                  }
                }}
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default ChatInput;
