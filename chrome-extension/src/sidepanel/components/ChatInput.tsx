/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useState, useCallback, KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  Typography
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import LanguageIcon from '@mui/icons-material/Language';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useExtensionStore } from '../store';

const inputContainerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 16px 16px',
  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  gap: '10px',
  backgroundColor: '#1a1a1a'
});

const contextRowStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const contextToggleStyles = (isActive: boolean) => css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  backgroundColor: isActive ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
  border: `1px solid ${isActive ? 'rgba(96, 165, 250, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
  color: isActive ? '#60A5FA' : 'rgba(255, 255, 255, 0.5)',
  '&:hover': {
    backgroundColor: isActive ? 'rgba(96, 165, 250, 0.15)' : 'rgba(255, 255, 255, 0.03)',
    borderColor: isActive ? 'rgba(96, 165, 250, 0.4)' : 'rgba(255, 255, 255, 0.12)'
  }
});

const inputRowStyles = css({
  display: 'flex',
  alignItems: 'flex-end',
  gap: '10px'
});

interface ChatInputProps {
  onSendMessage: (message: string, includeContext: boolean) => Promise<void>;
  onStopGeneration: () => void;
  onRefreshContext?: () => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, onStopGeneration, onRefreshContext, disabled }: ChatInputProps) {
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
    <Box css={inputContainerStyles}>
      {/* Context toggle */}
      <Box css={contextRowStyles}>
        <Box 
          css={contextToggleStyles(autoIncludeContext)}
          onClick={() => setAutoIncludeContext(!autoIncludeContext)}
        >
          <LanguageIcon sx={{ fontSize: 14 }} />
          <span>Include page</span>
        </Box>
        
        {pageContext && autoIncludeContext && (
          <Typography
            variant="caption"
            sx={{
              color: '#60A5FA',
              maxWidth: 150,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '11px'
            }}
          >
            {pageContext.title}
          </Typography>
        )}
        
        {onRefreshContext && (
          <Tooltip title="Refresh page context" arrow>
            <IconButton 
              size="small" 
              onClick={onRefreshContext}
              sx={{ 
                padding: '4px',
                color: 'rgba(255, 255, 255, 0.4)',
                '&:hover': { color: 'rgba(255, 255, 255, 0.7)' }
              }}
            >
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
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
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              '& fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.08)'
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.15)'
              },
              '&.Mui-focused fieldset': {
                borderColor: '#60A5FA',
                borderWidth: '1px'
              }
            },
            '& .MuiInputBase-input': {
              padding: '12px 14px',
              fontSize: '13px',
              '&::placeholder': {
                color: 'rgba(255, 255, 255, 0.3)',
                opacity: 1
              }
            }
          }}
        />

        {isStreaming ? (
          <Tooltip title="Stop generation" arrow>
            <IconButton
              onClick={onStopGeneration}
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                bgcolor: 'rgba(255, 85, 85, 0.1)',
                border: '1px solid rgba(255, 85, 85, 0.2)',
                color: '#FF5555',
                '&:hover': { 
                  bgcolor: 'rgba(255, 85, 85, 0.15)',
                  border: '1px solid rgba(255, 85, 85, 0.3)'
                }
              }}
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Send (Enter)" arrow>
            <span>
              <IconButton
                onClick={handleSend}
                disabled={!message.trim() || disabled}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '10px',
                  bgcolor: '#60A5FA',
                  color: '#fff',
                  '&:hover': { 
                    bgcolor: '#3B82F6'
                  },
                  '&.Mui-disabled': {
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    color: 'rgba(255, 255, 255, 0.2)'
                  }
                }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default ChatInput;
