/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import { Box, IconButton, Tooltip, Typography, Chip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AddCommentIcon from '@mui/icons-material/AddComment';
import { useExtensionStore } from '../store';

const headerStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  borderBottom: '1px solid',
  minHeight: '48px'
});

const statusIndicatorStyles = (isConnected: boolean) => css({
  color: isConnected ? 'var(--palette-success-main)' : 'var(--palette-error-main)',
  fontSize: '10px',
  marginRight: '4px'
});

export function ChatHeader() {
  const theme = useTheme();
  const { connectionStatus, setIsSettingsOpen, serverConfig, createNewThread } = useExtensionStore();

  const isConnected = connectionStatus === 'connected';
  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    failed: 'Connection Failed',
    streaming: 'Streaming',
    error: 'Error'
  }[connectionStatus];

  const statusColor = {
    disconnected: 'default',
    connecting: 'warning',
    connected: 'success',
    reconnecting: 'warning',
    failed: 'error',
    streaming: 'success',
    error: 'error'
  }[connectionStatus] as 'default' | 'warning' | 'success' | 'error';

  const handleNewChat = () => {
    const newThreadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    createNewThread(newThreadId);
  };

  return (
    <Box css={headerStyles} sx={{ borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="h6"
          sx={{
            fontSize: '1rem',
            fontWeight: 600,
            fontFamily: theme.fontFamily2,
            color: 'primary.main'
          }}
        >
          Nodetool
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="New Chat">
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: 'primary.main' }}
          >
            <AddCommentIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={`${statusText} - ${serverConfig.url}`}>
          <Chip
            icon={<FiberManualRecordIcon css={statusIndicatorStyles(isConnected)} />}
            label={statusText}
            size="small"
            color={statusColor}
            variant="outlined"
            sx={{
              height: '24px',
              '& .MuiChip-label': {
                fontSize: '0.7rem',
                px: 0.5
              }
            }}
          />
        </Tooltip>

        <Tooltip title="Settings">
          <IconButton
            size="small"
            onClick={() => setIsSettingsOpen(true)}
            sx={{ color: 'text.secondary' }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default ChatHeader;
