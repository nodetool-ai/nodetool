# NodeTool Mobile App

React Native mobile application for running NodeTool Mini Apps and AI Chat.

## Features

- **AI Chat**: Real-time chat with AI assistants
  - WebSocket-based streaming responses
  - Markdown rendering with syntax highlighting
  - Model selection (provider/model picker)
  - Auto-scroll and loading indicators
  - Stop generation support
- **Mini Apps**: Browse and run workflows
  - Configure server host URL
  - Real-time workflow execution
  - Support for text, number, and boolean inputs
- Cross-platform support (iOS, Android, Web)

## Prerequisites

- Node.js 20.x or later
- npm or yarn
- Expo CLI
- For iOS: Xcode (macOS only)
- For Android: Android Studio

## Installation

```bash
cd mobile
npm install
```

## Configuration

The app requires a running NodeTool server. You can configure the server URL in the Settings screen within the app.

Default server URL: `http://localhost:8000`

## Running the App

### Development

Start the Expo development server:

```bash
npm start
```

Then:
- Press `i` to open in iOS Simulator (macOS only)
- Press `a` to open in Android Emulator
- Press `w` to open in web browser
- Scan the QR code with Expo Go app on your phone

### Platform-specific

```bash
# iOS (macOS only)
npm run ios

# Android
npm run android

# Web
npm run web
```

## Project Structure

```
mobile/
├── src/
│   ├── components/     # Reusable components
│   │   ├── chat/       # Chat components
│   │   │   ├── ChatView.tsx        # Main chat container
│   │   │   ├── ChatComposer.tsx    # Input + send button
│   │   │   ├── ChatMessageList.tsx # Message list
│   │   │   ├── MessageView.tsx     # Individual message
│   │   │   ├── ChatMarkdown.tsx    # Markdown renderer
│   │   │   └── LoadingIndicator.tsx # Pulsating animation
│   │   ├── properties/ # Input property components
│   │   └── outputs/    # Output rendering components
│   ├── navigation/     # Navigation configuration
│   │   └── types.ts    # Navigation type definitions
│   ├── screens/        # App screens
│   │   ├── MiniAppsListScreen.tsx  # List of mini apps
│   │   ├── MiniAppScreen.tsx       # Mini app detail/run screen
│   │   ├── ChatScreen.tsx          # AI Chat screen
│   │   ├── LanguageModelSelectionScreen.tsx # Model picker
│   │   └── SettingsScreen.tsx      # Server settings
│   ├── services/       # API and WebSocket services
│   │   ├── api.ts          # API client
│   │   └── WebSocketManager.ts # WebSocket with msgpack
│   ├── stores/         # State management (Zustand)
│   │   ├── ChatStore.ts    # Chat state
│   │   └── ThemeStore.ts   # Theme state
│   └── types/          # TypeScript types
│       ├── ApiTypes.ts     # Generated API types
│       ├── chat.ts         # Chat types
│       ├── miniapp.ts      # Mini app types
│       └── workflow.ts     # Workflow types
├── App.tsx             # Main app component
└── package.json        # Dependencies and scripts
```

## Usage

1. **Configure Server**: Open Settings and enter your NodeTool server URL
2. **AI Chat**:
   - Tap the chat icon in the header to open Chat
   - Select a model (tap model name in header)
   - Type a message and tap send
   - View streaming AI responses with markdown formatting
   - Tap stop button to halt generation
   - Tap + to start a new conversation
3. **Browse Mini Apps**: View the list of available workflows
4. **Run a Mini App**: 
   - Select a mini app from the list
   - Fill in the required inputs
   - Tap "Run" to execute the workflow
   - View results below

## Server Configuration

The app stores the server URL in AsyncStorage. You can:
- Set it in the Settings screen
- Test the connection before saving
- The default value is `http://localhost:8000`

For local development with a device/emulator:
- iOS Simulator: Use `http://localhost:8000`
- Android Emulator: Use `http://10.0.2.2:8000` (Android's localhost proxy)
- Physical Device: Use your computer's IP address (e.g., `http://192.168.1.100:8000`)

## Development Notes

This app reuses types and logic from the web application (`web/src/components/miniapps/`) for consistency:
- Type definitions are adapted from `web/src/components/miniapps/types.ts`
- API patterns follow `web/src/stores/ApiClient.ts`
- Input handling logic mirrors `web/src/components/miniapps/hooks/useMiniAppInputs.ts`

## Building for Production

### Android APK

```bash
expo build:android
```

### iOS IPA

```bash
expo build:ios
```

### Standalone Apps

For standalone native builds without Expo Go, see:
https://docs.expo.dev/build/introduction/

## Troubleshooting

### Cannot connect to server
- Ensure the NodeTool server is running
- Check the server URL in Settings
- For physical devices, ensure your device and server are on the same network
- For Android emulator, use `http://10.0.2.2:8000` instead of `localhost:8000`

### App crashes on startup
- Clear the app data and restart
- Check that all dependencies are installed: `npm install`
- Try resetting the Metro bundler: `npm start --reset-cache`

## License

Same as NodeTool main project (AGPL-3.0)
