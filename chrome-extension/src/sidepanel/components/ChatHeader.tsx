/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useState, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box, IconButton, Tooltip, Typography, Chip, Popover } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AddCommentIcon from '@mui/icons-material/AddComment';
import ListIcon from '@mui/icons-material/List';
import { useExtensionStore } from '../store';
import ThreadList from '../../components/chat/thread/ThreadList';

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
  const { 
    connectionStatus, 
    setIsSettingsOpen, 
    serverConfig, 
    createNewThread,
    threads,
    messageCache,
    currentThreadId,
    setCurrentThreadId,
    deleteThread
  } = useExtensionStore();

  const [threadListAnchorEl, setThreadListAnchorEl] = useState<HTMLButtonElement | null>(null);
  const isThreadListOpen = Boolean(threadListAnchorEl);

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

  const handleNewChat = useCallback(() => {
    createNewThread();
    setThreadListAnchorEl(null);
  }, [createNewThread]);

  const handleOpenThreadList = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setThreadListAnchorEl(event.currentTarget);
  }, []);

  const handleCloseThreadList = useCallback(() => {
    setThreadListAnchorEl(null);
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    setCurrentThreadId(threadId);
    setThreadListAnchorEl(null);
  }, [setCurrentThreadId]);

  const handleDeleteThread = useCallback((threadId: string) => {
    deleteThread(threadId);
  }, [deleteThread]);

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

        <Tooltip title="Chat History">
          <IconButton
            size="small"
            onClick={handleOpenThreadList}
            sx={{ color: 'text.secondary' }}
          >
            <ListIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Popover
          open={isThreadListOpen}
          anchorEl={threadListAnchorEl}
          onClose={handleCloseThreadList}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right'
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right'
          }}
          slotProps={{
            paper: {
              sx: {
                width: 300,
                maxHeight: '60vh',
                borderRadius: 2,
                overflow: 'hidden'
              }
            }
          }}
        >
          <ThreadList
            threads={threads}
            messageCache={messageCache}
            currentThreadId={currentThreadId}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
          />
        </Popover>

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
