# Electron Desktop Application Guide

**Navigation**: [Root AGENTS.md](../../AGENTS.md) → **Electron**

This guide helps AI agents understand the Electron desktop application implementation for NodeTool.

## Overview

The Electron app wraps the web UI in a native desktop application, providing:
- System integration (file system, OS menus, tray icons)
- Local Python backend management
- Auto-updates
- Desktop-specific features

## Key Files

### Main Process Files

#### main.ts
Entry point for Electron main process:
- Creates application windows
- Manages application lifecycle
- Sets up IPC handlers
- Initializes Python backend

#### window.ts
Window management:
- Creates and configures BrowserWindow instances
- Handles window state persistence
- Manages window events

#### menu.ts
Application menu setup:
- Creates native menus for each platform
- Handles menu item actions
- Updates menu state

#### ipc.ts
Inter-process communication handlers:
- File system operations
- Python backend control
- Settings management
- Model downloads

### Backend Management

#### server.ts
Python backend server management:
- Starts/stops Python server
- Monitors server health
- Handles server errors
- Manages server configuration

#### python.ts
Python environment detection and management:
- Finds Python installations
- Validates conda environments
- Executes Python commands

#### installer.ts
Handles installation of dependencies:
- Python packages
- System dependencies
- Model files

### File System Integration

#### fileExplorer.ts
File system operations:
- Directory browsing
- File selection dialogs
- Path resolution

#### download.ts
Download management:
- Progress tracking
- Resume support
- Error handling

### System Integration

#### tray.ts
System tray icon:
- Quick access menu
- Status indicators
- Background operations

#### shortcuts.ts
Global keyboard shortcuts:
- Application-wide hotkeys
- Platform-specific bindings

#### scheduler.ts
Task scheduling:
- Periodic background tasks
- Auto-update checks
- Cleanup operations

### Model Management

#### ollama.ts
Ollama integration:
- Model download
- Model management
- Ollama server communication

### State Management

#### state.ts
Application state persistence:
- Window positions
- User preferences
- Recent files

#### settings.ts
Settings management:
- Configuration loading/saving
- Default settings
- Settings validation

### Monitoring & Logging

#### logger.ts
Application logging:
- File logging
- Console output
- Log rotation

#### watchdog.ts
Process monitoring:
- Backend health checks
- Auto-restart on crashes
- Resource monitoring

### Updates

#### updater.ts
Auto-update functionality:
- Update checking
- Download and install updates
- Rollback on failures

## IPC Communication

### From Renderer to Main

```typescript
// In renderer (web app)
window.api.selectFile({ 
  filters: [{ name: 'Images', extensions: ['png', 'jpg'] }] 
});

// In preload.ts
const api = {
  selectFile: (options: FileOptions) => 
    ipcRenderer.invoke('select-file', options)
};

// In main process (ipc.ts)
ipcMain.handle('select-file', async (event, options) => {
  const result = await dialog.showOpenDialog(options);
  return result.filePaths;
});
```

### From Main to Renderer

```typescript
// In main process
mainWindow.webContents.send('update-status', { 
  status: 'downloading', 
  progress: 50 
});

// In renderer
window.api.onUpdateStatus((data) => {
  console.log('Update status:', data);
});

// In preload.ts
const api = {
  onUpdateStatus: (callback: (data: any) => void) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  }
};
```

## Platform-Specific Code

### macOS
```typescript
if (process.platform === 'darwin') {
  // macOS-specific code
  app.dock.setIcon(icon);
}
```

### Windows
```typescript
if (process.platform === 'win32') {
  // Windows-specific code
  app.setAppUserModelId('ai.nodetool.app');
}
```

### Linux
```typescript
if (process.platform === 'linux') {
  // Linux-specific code
  app.setName('NodeTool');
}
```

## Best Practices

### 1. Security
- Use contextBridge for IPC
- Disable nodeIntegration
- Enable contextIsolation
- Validate all IPC inputs

### 2. Performance
- Use worker threads for heavy operations
- Implement proper cleanup
- Monitor memory usage
- Use lazy loading

### 3. User Experience
- Persist window state
- Provide loading indicators
- Handle errors gracefully
- Show meaningful notifications

### 4. Testing
- Test on all platforms
- Test auto-update flow
- Test IPC communication
- Test error scenarios

## Development Commands

```bash
# Start development
cd electron
npm install
npm start

# Build for production
npm run build

# Package for distribution
npm run package

# Lint and type-check
npm run lint
npm run typecheck

# Run tests
npm test
```

## Related Documentation

- [Web UI Guide](../web/src/AGENTS.md) - Web application
- [Root AGENTS.md](../../AGENTS.md) - Project overview

## Quick Reference

### IPC Channels
- `select-file` - File selection dialog
- `start-server` - Start Python backend
- `stop-server` - Stop Python backend
- `download-model` - Download AI model
- `get-settings` - Get application settings
- `set-settings` - Update settings

### Main Process Modules
- `main.ts` - Application entry point
- `window.ts` - Window management
- `server.ts` - Backend management
- `ipc.ts` - IPC handlers
- `menu.ts` - Application menus

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
