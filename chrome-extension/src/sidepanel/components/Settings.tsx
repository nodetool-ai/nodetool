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
  Switch,
  FormControlLabel,
  InputAdornment
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
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
  padding: '16px 20px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
});

const contentStyles = css({
  flex: 1,
  overflow: 'auto',
  padding: '20px'
});

const sectionStyles = css({
  marginBottom: '20px'
});

const sectionTitleStyles = css({
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '12px',
  color: 'rgba(255, 255, 255, 0.5)'
});

const fieldStyles = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
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
  '& .MuiInputLabel-root': {
    fontSize: '13px'
  },
  '& .MuiInputBase-input': {
    fontSize: '13px'
  }
};

const switchLabelStyles = {
  m: 0,
  mb: 1.5,
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  '& .MuiFormControlLabel-label': {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.8)'
  }
};

const statusBadgeStyles = (isSuccess: boolean) => css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 14px',
  borderRadius: '8px',
  marginTop: '12px',
  backgroundColor: isSuccess ? 'rgba(80, 250, 123, 0.08)' : 'rgba(255, 85, 85, 0.08)',
  border: `1px solid ${isSuccess ? 'rgba(80, 250, 123, 0.2)' : 'rgba(255, 85, 85, 0.2)'}`,
  fontSize: '13px',
  color: isSuccess ? '#50FA7B' : '#FF5555'
});

export function Settings() {
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
          bgcolor: '#1a1a1a',
          backgroundImage: 'none'
        }
      }}
    >
      <Box css={drawerContentStyles}>
        {/* Header */}
        <Box css={headerStyles}>
          <Typography 
            variant="subtitle1" 
            sx={{ 
              fontWeight: 600,
              fontSize: '15px',
              color: 'rgba(255, 255, 255, 0.9)'
            }}
          >
            Settings
          </Typography>
          <IconButton 
            onClick={() => setIsSettingsOpen(false)} 
            size="small"
            sx={{ 
              color: 'rgba(255, 255, 255, 0.5)',
              '&:hover': { 
                color: 'rgba(255, 255, 255, 0.8)',
                bgcolor: 'rgba(255, 255, 255, 0.05)'
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box css={contentStyles}>
          {/* Server Configuration */}
          <Box css={sectionStyles}>
            <Typography css={sectionTitleStyles}>
              Server
            </Typography>

            <TextField
              fullWidth
              label="Server URL"
              value={serverConfig.url}
              onChange={(e) => setServerConfig({ url: e.target.value })}
              placeholder="http://localhost:7777"
              size="small"
              sx={{ ...fieldStyles, mb: 1.5 }}
            />

            <TextField
              fullWidth
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={serverConfig.apiKey || ''}
              onChange={(e) => setServerConfig({ apiKey: e.target.value || undefined })}
              placeholder="Optional"
              size="small"
              sx={{ ...fieldStyles, mb: 1.5 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                        size="small"
                        sx={{ color: 'rgba(255, 255, 255, 0.4)' }}
                      >
                        {showApiKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  )
                }
              }}
            />

            <FormControl fullWidth size="small" sx={{ ...fieldStyles, mb: 1.5 }}>
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
                  sx={{
                    '& .MuiSwitch-thumb': { bgcolor: '#fff' },
                    '& .MuiSwitch-track': { bgcolor: 'rgba(255, 255, 255, 0.2)' },
                    '&.Mui-checked .MuiSwitch-track': { bgcolor: '#60A5FA' }
                  }}
                />
              }
              label="Auto-connect on startup"
              labelPlacement="start"
              sx={switchLabelStyles}
            />

            <Button
              fullWidth
              onClick={handleTestConnection}
              disabled={isTesting}
              sx={{
                mt: 0.5,
                py: 1,
                borderRadius: '8px',
                textTransform: 'none',
                fontSize: '13px',
                fontWeight: 500,
                bgcolor: 'rgba(96, 165, 250, 0.1)',
                color: '#60A5FA',
                border: '1px solid rgba(96, 165, 250, 0.2)',
                '&:hover': {
                  bgcolor: 'rgba(96, 165, 250, 0.15)',
                  border: '1px solid rgba(96, 165, 250, 0.3)'
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  color: 'rgba(255, 255, 255, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }
              }}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>

            {testResult && (
              <Box css={statusBadgeStyles(testResult.success)}>
                {testResult.success ? (
                  <CheckCircleOutlineIcon fontSize="small" />
                ) : (
                  <ErrorOutlineIcon fontSize="small" />
                )}
                <span>{testResult.success ? 'Connected successfully' : testResult.error}</span>
              </Box>
            )}

            {connectionStatus === 'connected' && !testResult && (
              <Box css={statusBadgeStyles(true)}>
                <CheckCircleOutlineIcon fontSize="small" />
                <span>Connected</span>
              </Box>
            )}
          </Box>

          {/* Chat Settings */}
          <Box css={sectionStyles} sx={{ pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <Typography css={sectionTitleStyles}>
              Chat
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={autoIncludeContext}
                  onChange={(e) => setAutoIncludeContext(e.target.checked)}
                  size="small"
                  sx={{
                    '& .MuiSwitch-thumb': { bgcolor: '#fff' },
                    '& .MuiSwitch-track': { bgcolor: 'rgba(255, 255, 255, 0.2)' },
                    '&.Mui-checked .MuiSwitch-track': { bgcolor: '#60A5FA' }
                  }}
                />
              }
              label="Auto-include page content"
              labelPlacement="start"
              sx={switchLabelStyles}
            />

            <Button
              fullWidth
              onClick={handleClearHistory}
              disabled={!currentThreadId || !messageCache[currentThreadId]?.length}
              sx={{
                py: 1,
                borderRadius: '8px',
                textTransform: 'none',
                fontSize: '13px',
                fontWeight: 500,
                bgcolor: 'rgba(255, 85, 85, 0.08)',
                color: '#FF5555',
                border: '1px solid rgba(255, 85, 85, 0.15)',
                '&:hover': {
                  bgcolor: 'rgba(255, 85, 85, 0.12)',
                  border: '1px solid rgba(255, 85, 85, 0.25)'
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(255, 255, 255, 0.02)',
                  color: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.04)'
                }
              }}
            >
              Clear Chat History
            </Button>
          </Box>

          {/* Appearance */}
          <Box css={sectionStyles} sx={{ pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <Typography css={sectionTitleStyles}>
              Appearance
            </Typography>

            <FormControl fullWidth size="small" sx={fieldStyles}>
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
