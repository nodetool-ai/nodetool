/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import { Box, IconButton, Tooltip, Typography, Chip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useExtensionStore } from '../store';

const headerStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  borderBottom: '1px solid',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  minHeight: '48px'
});

const statusIndicatorStyles = (isConnected: boolean) => css({
  color: isConnected ? '#4caf50' : '#f44336',
  fontSize: '10px',
  marginRight: '4px'
});

export function ChatHeader() {
  const theme = useTheme();
  const { connectionStatus, setIsSettingsOpen, serverConfig } = useExtensionStore();

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

  return (
    <Box css={headerStyles} sx={{ borderColor: theme.palette.divider }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="h6"
          sx={{
            fontSize: '1rem',
            fontWeight: 600,
            background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent'
          }}
        >
          Nodetool
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                fontSize: '0.75rem',
                px: 1
              }
            }}
          />
        </Tooltip>

        <Tooltip title="Settings">
          <IconButton
            size="small"
            onClick={() => setIsSettingsOpen(true)}
            sx={{ color: theme.palette.text.secondary }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default ChatHeader;
