# Nodetool Chrome Extension

AI-powered workflow automation and chat from your Nodetool server, directly in your browser.

## Features

- **Side Panel Chat**: Persistent chat interface available across all tabs
- **Real-time Streaming**: AI responses stream in real-time using WebSocket
- **Server Connection Management**: Connect to local or remote Nodetool servers
- **Page Context Integration**: Include current page content in your AI conversations
- **Persistent History**: Chat messages are saved locally in browser storage
- **Browser Tools**: Client-side tools that AI agents can use to interact with your browser

## Browser Tools

The extension exposes a set of browser tools via the tool bridge that AI agents can call:

### Tab Management
- `browser_get_active_tab` - Get information about the currently active tab
- `browser_query_tabs` - Search and filter open tabs
- `browser_create_tab` - Open a new tab with a URL
- `browser_update_tab` - Modify tab properties (URL, active, pinned, muted)
- `browser_close_tabs` - Close one or more tabs

### Page Interaction
- `browser_get_page_content` - Extract text content from a page
- `browser_execute_script` - Run JavaScript in a tab context
- `browser_take_screenshot` - Capture a screenshot of a tab
- `browser_navigate` - Go back, forward, or reload a page

### Storage
- `browser_storage_get` - Get items from extension storage
- `browser_storage_set` - Store items in extension storage
- `browser_storage_remove` - Remove items from extension storage

### Window Management
- `browser_get_windows` - Get all browser windows
- `browser_create_window` - Create a new browser window
- `browser_update_window` - Update window state, size, or position

### Bookmarks
- `browser_search_bookmarks` - Search bookmarks by query, URL, or title
- `browser_create_bookmark` - Create a new bookmark
- `browser_remove_bookmark` - Remove a bookmark

### History
- `browser_search_history` - Search browser history
- `browser_delete_history_url` - Delete a specific URL from history
- `browser_delete_history_range` - Delete history within a time range

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
│   ├── popup/               # Quick access popup
│   └── lib/
│       └── tools/           # Browser tools
│           ├── browserTools.ts    # Tool registry
│           └── builtin/           # Built-in browser tools
├── public/
│   └── manifest.json        # Chrome extension manifest
└── assets/
    └── icons/               # Extension icons
```

## Permissions

The extension requires the following Chrome permissions:
- `sidePanel` - Side panel UI
- `storage` - Persistent settings storage
- `activeTab` - Access current tab info
- `scripting` - Execute scripts in page context
- `alarms` - Keep service worker alive
- `tabs` - Tab management and queries
- `bookmarks` - Bookmark management
- `history` - History access

## License

AGPL-3.0-only
