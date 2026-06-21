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

## Tech Stack

React Native 0.85 + Expo SDK 56, React 19, TypeScript 6. Server state via a
tRPC v11 client + TanStack Query v5 (REST via the global `fetch` — no Axios),
local state via Zustand v5, realtime via WebSocket + MsgPack, auth via Supabase
+ Google Sign-In. See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Prerequisites

- Node.js 22.22.1 (see the repo root `.nvmrc`; `nvm use`)
- npm
- Expo CLI
- For iOS: Xcode (macOS only)
- For Android: Android Studio

> Mobile is **not** part of the npm workspaces. Its `typecheck` references the
> backend package builds, so run `npm run build:packages` from the repo root
> first. See [AGENTS.md](AGENTS.md).

## Installation

```bash
cd mobile
npm install
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
│   ├── navigation/     # Navigation configuration + types
│   ├── screens/        # App screens
│   │   ├── WorkflowsListScreen.tsx  # List of workflows
│   │   ├── GraphEditorScreen.tsx    # Chain-based graph editor
│   │   ├── ChatScreen.tsx           # AI Chat screen
│   │   ├── AssetsScreen.tsx         # Asset browser
│   │   ├── JobsScreen.tsx           # Job history
│   │   ├── LanguageModelSelectionScreen.tsx # Model picker
│   │   ├── SettingsScreen.tsx       # Server settings
│   │   └── LoginScreen.tsx          # Supabase / Google sign-in
│   ├── services/       # API and WebSocket services
│   │   ├── api.ts             # REST client (fetch + ApiError/retry/timeout)
│   │   ├── WebSocketService.ts # Singleton WS (workflow/job routing)
│   │   └── WebSocketManager.ts # Per-connection WS with msgpack (chat)
│   ├── trpc/           # tRPC client + React Query provider
│   ├── stores/         # State management (Zustand)
│   │   ├── ChatStore.ts          # Chat state
│   │   ├── WorkflowRunner.ts     # Workflow execution state
│   │   ├── GraphEditorStore.ts   # Graph-editor chain state
│   │   ├── MediaGenerationStore.ts # Image/video params
│   │   ├── AuthStore.ts          # Auth/session state
│   │   └── ThemeStore.ts         # Theme state
│   └── types/          # TypeScript types (ApiTypes, workflow, …)
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

This app shares types and patterns with the web application and the backend protocol for
consistency:
- API/domain types come from the backend protocol via `src/types/ApiTypes.ts`.
- Server state goes through a tRPC v11 client + TanStack Query v5; REST-only endpoints use
  the `fetch`-based `services/api.ts` (no Axios).
- See [AGENTS.md](AGENTS.md) for the stack, testing, and the npm-workspace note.

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
