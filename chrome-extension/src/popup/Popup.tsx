/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import {
  Box,
  Typography,
  Button,
  CssBaseline,
  ThemeProvider,
  createTheme,
  Chip,
  Divider
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import SettingsIcon from '@mui/icons-material/Settings';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useExtensionStore } from '../sidepanel/store';

const popupContainerStyles = css({
  width: 280,
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
});

const headerStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
});

const buttonStyles = css({
  justifyContent: 'flex-start',
  textTransform: 'none',
  padding: '12px 16px'
});

function Popup() {
  const { connectionStatus, serverConfig, setIsSettingsOpen } = useExtensionStore();

  const isConnected = connectionStatus === 'connected';

  const theme = createTheme({
    palette: {
      mode: 'dark'
    }
  });

  const handleOpenChat = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  const handleOpenSettings = async () => {
    setIsSettingsOpen(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box css={popupContainerStyles}>
        {/* Header */}
        <Box css={headerStyles}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent'
            }}
          >
            Nodetool
          </Typography>
          <Chip
            icon={
              <FiberManualRecordIcon
                sx={{
                  fontSize: 10,
                  color: isConnected ? '#4caf50' : '#f44336'
                }}
              />
            }
            label={isConnected ? 'Connected' : 'Disconnected'}
            size="small"
            variant="outlined"
            color={isConnected ? 'success' : 'error'}
            sx={{ height: 24, fontSize: '0.7rem' }}
          />
        </Box>

        <Typography variant="caption" color="text.secondary">
          {serverConfig.url}
        </Typography>

        <Divider />

        {/* Actions */}
        <Button
          css={buttonStyles}
          variant="contained"
          fullWidth
          startIcon={<ChatIcon />}
          onClick={handleOpenChat}
        >
          Open Chat
        </Button>

        <Button
          css={buttonStyles}
          variant="outlined"
          fullWidth
          startIcon={<SettingsIcon />}
          onClick={handleOpenSettings}
        >
          Settings
        </Button>
      </Box>
    </ThemeProvider>
  );
}

export default Popup;
