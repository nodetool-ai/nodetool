/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useState, useCallback } from 'react';
import { Box, IconButton, Tooltip, Typography, Popover } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import { useExtensionStore } from '../store';
import ThreadList from '../../components/chat/thread/ThreadList';

const headerStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  minHeight: '52px',
  backgroundColor: '#1a1a1a'
});

const logoStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const logoTextStyles = css({
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  color: '#fff'
});

const actionsStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: '4px'
});

const iconButtonStyles = {
  padding: '6px',
  color: 'rgba(255, 255, 255, 0.5)',
  borderRadius: '6px',
  '&:hover': {
    color: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)'
  }
};

const statusDotStyles = (isConnected: boolean) => css({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: isConnected ? '#50FA7B' : '#FF5555',
  boxShadow: isConnected 
    ? '0 0 8px rgba(80, 250, 123, 0.5)' 
    : '0 0 8px rgba(255, 85, 85, 0.5)'
});

const statusBadgeStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '12px',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  fontSize: '11px',
  fontWeight: 500,
  color: 'rgba(255, 255, 255, 0.6)'
});

export function ChatHeader() {
  const { 
    connectionStatus, 
    setIsSettingsOpen, 
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
  const statusText = isConnected ? 'Connected' : 'Disconnected';

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
    <Box css={headerStyles}>
      <Box css={logoStyles}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #60A5FA 0%, #A78BFA 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: '#fff'
          }}
        >
          N
        </Box>
        <Typography css={logoTextStyles}>
          Nodetool
        </Typography>
      </Box>

      <Box css={actionsStyles}>
        <Tooltip title="New Chat" arrow>
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={iconButtonStyles}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Chat History" arrow>
          <IconButton
            size="small"
            onClick={handleOpenThreadList}
            sx={iconButtonStyles}
          >
            <HistoryIcon fontSize="small" />
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
                width: 280,
                maxHeight: '50vh',
                borderRadius: '10px',
                overflow: 'hidden',
                bgcolor: '#1a1a1a',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                mt: 1
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

        <Box css={statusBadgeStyles}>
          <Box css={statusDotStyles(isConnected)} />
          <span>{statusText}</span>
        </Box>

        <Tooltip title="Settings" arrow>
          <IconButton
            size="small"
            onClick={() => setIsSettingsOpen(true)}
            sx={iconButtonStyles}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default ChatHeader;
