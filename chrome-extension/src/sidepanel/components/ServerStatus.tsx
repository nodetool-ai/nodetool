/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { Box, Typography, CircularProgress } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const statusContainerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  padding: '40px 24px',
  textAlign: 'center',
  backgroundColor: '#141414'
});

const iconContainerStyles = (color: string) => css({
  width: 64,
  height: 64,
  borderRadius: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '20px',
  backgroundColor: `${color}15`,
  border: `1px solid ${color}30`
});

interface ServerStatusProps {
  status: string;
  error?: string | null;
  onRetry?: () => void;
}

export function ServerStatus({ status, error }: ServerStatusProps) {
  const getStatusContent = () => {
    switch (status) {
      case 'connecting':
        return (
          <>
            <Box css={iconContainerStyles('#60A5FA')}>
              <CircularProgress size={28} sx={{ color: '#60A5FA' }} />
            </Box>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: 1, 
                fontSize: '16px', 
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)'
              }}
            >
              Connecting...
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '13px'
              }}
            >
              Establishing connection to Nodetool server
            </Typography>
          </>
        );

      case 'reconnecting':
        return (
          <>
            <Box css={iconContainerStyles('#FFB86C')}>
              <SyncIcon sx={{ fontSize: 28, color: '#FFB86C' }} />
            </Box>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: 1, 
                fontSize: '16px', 
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)'
              }}
            >
              Reconnecting...
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '13px'
              }}
            >
              Connection lost. Attempting to reconnect...
            </Typography>
          </>
        );

      case 'failed':
      case 'error':
        return (
          <>
            <Box css={iconContainerStyles('#FF5555')}>
              <ErrorOutlineIcon sx={{ fontSize: 28, color: '#FF5555' }} />
            </Box>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: 1, 
                fontSize: '16px', 
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)'
              }}
            >
              Connection Failed
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                mb: 2,
                color: '#FF5555',
                fontSize: '13px'
              }}
            >
              {error || 'Unable to connect to Nodetool server'}
            </Typography>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '12px',
                maxWidth: 260
              }}
            >
              Check your server settings and make sure Nodetool is running
            </Typography>
          </>
        );

      case 'disconnected':
      default:
        return (
          <>
            <Box css={iconContainerStyles('#FFB86C')}>
              <CloudOffIcon sx={{ fontSize: 28, color: '#FFB86C' }} />
            </Box>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: 1, 
                fontSize: '16px', 
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)'
              }}
            >
              Not Connected
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '13px',
                maxWidth: 260
              }}
            >
              Open settings to configure your Nodetool server connection
            </Typography>
          </>
        );
    }
  };

  return (
    <Box css={statusContainerStyles}>
      {getStatusContent()}
    </Box>
  );
}

export function EmptyChatState() {
  return (
    <Box css={statusContainerStyles}>
      <Box css={iconContainerStyles('#60A5FA')}>
        <ChatIcon sx={{ fontSize: 28, color: '#60A5FA' }} />
      </Box>
      <Typography 
        variant="h6" 
        sx={{ 
          mb: 1, 
          fontSize: '16px', 
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.9)'
        }}
      >
        Start a Conversation
      </Typography>
      <Typography 
        variant="body2" 
        sx={{ 
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '13px',
          maxWidth: 260,
          lineHeight: 1.5
        }}
      >
        Ask questions, get help with tasks, or chat with AI models from your Nodetool server
      </Typography>
    </Box>
  );
}

export default ServerStatus;
