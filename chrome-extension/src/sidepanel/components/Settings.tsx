/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useState, useCallback } from 'react';
import {
  Box,
  Drawer,
  Typography,
  TextField,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  Switch,
  FormControlLabel,
  InputAdornment
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useExtensionStore } from '../store';
import { useServerConnection } from '../hooks/useServerConnection';

const drawerContentStyles = css({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column'
});

const headerStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid'
});

const contentStyles = css({
  flex: 1,
  overflow: 'auto',
  padding: '16px'
});

const sectionStyles = css({
  marginBottom: '24px'
});

export function Settings() {
  const theme = useTheme();
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    serverConfig,
    setServerConfig,
    theme: appTheme,
    setTheme,
    autoIncludeContext,
    setAutoIncludeContext,
    messageCache,
    currentThreadId
  } = useExtensionStore();

  const { testConnection, connectionStatus } = useServerConnection();
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testConnection();
    setTestResult(result);
    setIsTesting(false);
  }, [testConnection]);

  const handleClearHistory = useCallback(() => {
    if (currentThreadId && window.confirm('Are you sure you want to clear chat history?')) {
      useExtensionStore.getState().clearMessages(currentThreadId);
    }
  }, [currentThreadId]);

  return (
    <Drawer
      anchor="right"
      open={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      PaperProps={{
        sx: {
          width: '100%',
          maxWidth: '100%',
          bgcolor: theme.palette.background.default
        }
      }}
    >
      <Box css={drawerContentStyles}>
        {/* Header */}
        <Box css={headerStyles} sx={{ borderColor: theme.palette.divider }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Settings
          </Typography>
          <IconButton onClick={() => setIsSettingsOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <Box css={contentStyles}>
          {/* Server Configuration */}
          <Box css={sectionStyles}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Server Configuration
            </Typography>

            <TextField
              fullWidth
              label="Server URL"
              value={serverConfig.url}
              onChange={(e) => setServerConfig({ url: e.target.value })}
              placeholder="http://localhost:8000"
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="API Key (optional)"
              type={showApiKey ? 'text' : 'password'}
              value={serverConfig.apiKey || ''}
              onChange={(e) => setServerConfig({ apiKey: e.target.value || undefined })}
              placeholder="Enter API key"
              size="small"
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                      size="small"
                    >
                      {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Auth Provider</InputLabel>
              <Select
                value={serverConfig.authProvider}
                label="Auth Provider"
                onChange={(e) =>
                  setServerConfig({
                    authProvider: e.target.value as 'local' | 'static' | 'supabase'
                  })
                }
              >
                <MenuItem value="local">Local</MenuItem>
                <MenuItem value="static">Static</MenuItem>
                <MenuItem value="supabase">Supabase</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={serverConfig.autoConnect}
                  onChange={(e) => setServerConfig({ autoConnect: e.target.checked })}
                  size="small"
                />
              }
              label="Auto-connect on startup"
              sx={{ mb: 2, display: 'block' }}
            />

            <Button
              variant="outlined"
              fullWidth
              onClick={handleTestConnection}
              disabled={isTesting}
              sx={{ mb: 1 }}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>

            {testResult && (
              <Alert
                severity={testResult.success ? 'success' : 'error'}
                icon={testResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                sx={{ mt: 1 }}
              >
                {testResult.success ? 'Connection successful!' : testResult.error}
              </Alert>
            )}

            {connectionStatus === 'connected' && !testResult && (
              <Alert severity="success" sx={{ mt: 1 }}>
                Currently connected
              </Alert>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Chat Settings */}
          <Box css={sectionStyles}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Chat Settings
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={autoIncludeContext}
                  onChange={(e) => setAutoIncludeContext(e.target.checked)}
                  size="small"
                />
              }
              label="Auto-include page content"
              sx={{ mb: 2, display: 'block' }}
            />

            <Button
              variant="outlined"
              color="warning"
              fullWidth
              onClick={handleClearHistory}
              disabled={!currentThreadId || !messageCache[currentThreadId]?.length}
            >
              Clear Chat History
            </Button>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Appearance */}
          <Box css={sectionStyles}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Appearance
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel>Theme</InputLabel>
              <Select
                value={appTheme}
                label="Theme"
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
                <MenuItem value="system">System</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}

export default Settings;
