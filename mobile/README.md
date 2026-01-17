# NodeTool Mobile App

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Mobile README**

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
npm ci
```

## Configuration

The app requires a running NodeTool server. You can configure the server URL in the Settings screen within the app.

Default server URL: `http://localhost:7777`

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
- The default value is `http://localhost:7777`

For local development with a device/emulator:
- iOS Simulator: Use `http://localhost:7777`
- Android Emulator: Use `http://10.0.2.2:7777` (Android's localhost proxy)
- Physical Device: Use your computer's IP address (e.g., `http://192.168.1.100:7777`)

## Development Notes

This app reuses types and logic from the web application (`web/src/components/miniapps/`) for consistency:
- Type definitions are adapted from `web/src/components/miniapps/types.ts`
- API patterns follow `web/src/stores/ApiClient.ts`
- Input handling logic mirrors `web/src/components/miniapps/hooks/useMiniAppInputs.ts`

## Building for Production

NodeTool uses **EAS Build** (Expo's cloud build service) for creating production builds. This requires an Expo account and the EAS CLI.

### Prerequisites

1. Create an Expo account: https://expo.dev/signup
2. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
3. Log in to your Expo account:
   ```bash
   eas login
   ```

### Building for Android (APK/AAB)

```bash
# Build for Android (APK for direct installation)
eas build --platform android --profile preview

# Or build for Google Play Store submission (AAB format)
eas build --platform android --profile production
```

### Building for iOS (IPA)

```bash
# Build for iOS (requires Apple Developer account)
eas build --platform ios --profile preview
```

### Building for Both Platforms

```bash
# Build for all platforms at once
eas build --platform all --profile preview
```

### EAS Build Profiles

The app uses EAS Build profiles defined in `eas.json`:

- **preview**: For testing builds (simpler configuration)
- **production**: For store submissions (includes app versioning, icons, etc.)

### Submitting to App Stores

After building, you can submit directly to stores:

```bash
# Submit to Google Play Store
eas submit --platform android

# Submit to Apple App Store
eas submit --platform ios
```

### Local Builds (Advanced)

For local builds without EAS, you can use:

```bash
# Android local build
npx expo export -p android
eas build --platform android --local

# iOS local build (macOS only)
npx expo export -p ios
eas build --platform ios --local
```

### Troubleshooting Builds

- **Missing credentials**: Run `eas credentials` to configure store credentials
- **Build failures**: Check the build logs in Expo dashboard
- **Timeouts**: Larger apps may need increased build timeout settings

For more details, see:
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Mobile Architecture](ARCHITECTURE.md)

## Troubleshooting

### Cannot connect to server
- Ensure the NodeTool server is running
- Check the server URL in Settings
- For physical devices, ensure your device and server are on the same network
- For Android emulator, use `http://10.0.2.2:7777` instead of `localhost:7777`

### App crashes on startup
- Clear the app data and restart
- Check that all dependencies are installed: `npm install`
- Try resetting the Metro bundler: `npm start --reset-cache`

## License

Same as NodeTool main project (AGPL-3.0)
