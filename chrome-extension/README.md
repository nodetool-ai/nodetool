# Nodetool Chrome Extension

AI-powered workflow automation and chat from your Nodetool server, directly in your browser.

## Features

- **Side Panel Chat**: Persistent chat interface available across all tabs
- **Real-time Streaming**: AI responses stream in real-time using WebSocket
- **Server Connection Management**: Connect to local or remote Nodetool servers
- **Page Context Integration**: Include current page content in your AI conversations
- **Persistent History**: Chat messages are saved locally in browser storage

## Installation (Development)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Development

Start development mode with hot reload:
```bash
npm run dev
```

Run linting:
```bash
npm run lint
```

Type checking:
```bash
npm run typecheck
```

## Configuration

1. Click the extension icon or press the keyboard shortcut to open the side panel
2. Click the settings icon (⚙️) to configure:
   - **Server URL**: Your Nodetool server address (default: `http://localhost:8000`)
   - **API Key**: Optional authentication key
   - **Auth Provider**: Authentication method (local, static, or Supabase)

## Requirements

- Chrome 114+ (for Side Panel API support)
- Nodetool server running (local or remote)

## Architecture

```
chrome-extension/
├── src/
│   ├── background/          # Background service worker
│   ├── sidepanel/           # Side panel React app
│   │   ├── components/      # UI components
│   │   └── hooks/           # Custom React hooks
│   ├── content/             # Content script for page context
│   └── popup/               # Quick access popup
├── public/
│   └── manifest.json        # Chrome extension manifest
└── assets/
    └── icons/               # Extension icons
```

## License

AGPL-3.0-only
