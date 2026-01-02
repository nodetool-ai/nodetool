/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChatIcon from '@mui/icons-material/Chat';

const statusContainerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  padding: '32px',
  textAlign: 'center'
});

interface ServerStatusProps {
  status: string;
  error?: string | null;
  onRetry?: () => void;
}

export function ServerStatus({ status, error }: ServerStatusProps) {
  const theme = useTheme();

  const getStatusContent = () => {
    switch (status) {
      case 'connecting':
        return (
          <>
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              Connecting to Nodetool...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please wait while we establish a connection
            </Typography>
          </>
        );

      case 'reconnecting':
        return (
          <>
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              Reconnecting...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connection lost. Attempting to reconnect...
            </Typography>
          </>
        );

      case 'failed':
      case 'error':
        return (
          <>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(244, 67, 54, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2
              }}
            >
              <Typography fontSize={32}>❌</Typography>
            </Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Connection Failed
            </Typography>
            <Typography variant="body2" color="error" sx={{ mb: 2 }}>
              {error || 'Unable to connect to the Nodetool server'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Check your server settings and make sure Nodetool is running
            </Typography>
          </>
        );

      case 'disconnected':
      default:
        return (
          <>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(255, 152, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2
              }}
            >
              <Typography fontSize={32}>🔌</Typography>
            </Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Not Connected
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Open settings to configure your Nodetool server connection
            </Typography>
          </>
        );
    }
  };

  return (
    <Box css={statusContainerStyles} sx={{ bgcolor: theme.palette.background.default }}>
      {getStatusContent()}
    </Box>
  );
}

export function EmptyChatState() {
  const theme = useTheme();

  return (
    <Box css={statusContainerStyles} sx={{ bgcolor: theme.palette.background.default }}>
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          bgcolor: 'rgba(33, 150, 243, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3
        }}
      >
        <ChatIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />
      </Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Start a Conversation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 280 }}>
        Ask questions, get help with tasks, or chat with AI models from your Nodetool server
      </Typography>
    </Box>
  );
}

export default ServerStatus;
