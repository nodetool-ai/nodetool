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

- Google Sign-In. See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

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
│   │   ├── TriggersScreen.tsx       # Trigger monitoring + arm/disarm
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

Builds run on **EAS Build** (Expo's cloud build service) against the EAS project
declared in `app.json` (`extra.eas.projectId`, owner `mgeorgi`).

### From CI (preferred)

The `.github/workflows/eas-build.yml` workflow authenticates with the
`EAS_TOKEN` repository secret (an Expo access token, passed to eas-cli as
`EXPO_TOKEN`). Builds cost credits, so no ordinary push starts one:

- **Manual**: Actions → _EAS Build (mobile)_ → _Run workflow_. Pick the platform
  and profile; `wait` blocks on the EAS queue, `submit` uploads the finished
  production build to the stores.
- **Release**: pushing a `mobile-v*` tag builds the `production` profile for
  both platforms, waits for it, and submits it.
- **Pull requests** that touch `app.json`, `eas.json`, or the lockfile only run
  the config check — it resolves the Expo config and never queues a build.

Each run writes the build IDs, statuses, and artifact links to the job summary.

### From a workstation

```bash
cd mobile
npx eas-cli login            # once; or export EXPO_TOKEN

npm run build:dev            # development client, internal distribution
npm run build:preview        # Android APK + iOS internal build
npm run build:production     # Android AAB + iOS store build
npm run submit:production    # submit the latest production build
```

Anything the scripts don't cover goes through the CLI directly, e.g.
`npm run eas -- build --platform ios --profile preview`.

### Build profiles

`eas.json` profiles all extend `base`, which pins Node to 22.22.1 so cloud
builds use the same version as the repo (`.nvmrc`):

| Profile                 | Use                                                       |
| ----------------------- | --------------------------------------------------------- |
| `development`           | Dev client on a physical device, internal distribution    |
| `development-simulator` | Same, but an iOS Simulator build                          |
| `preview`               | Testing builds — Android APK you can sideload             |
| `preview-simulator`     | Same, but an iOS Simulator build — needs no Apple account |
| `production`            | Store builds — Android AAB, version auto-incremented      |

`cli.appVersionSource` is `remote`, so EAS owns the build number; the
`production` profile increments it on every build.

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

- **`EAS CLI couldn't find any credentials suitable for internal distribution`**
  (iOS): a valid `EAS_TOKEN` is not enough. An iOS build that runs on a device
  needs a distribution certificate and an ad-hoc provisioning profile stored on
  the Expo servers, and only an interactive Apple login can create them the
  first time:

  ```bash
  cd mobile
  npx eas-cli credentials --platform ios     # sign in to the Apple Developer account
  ```

  An ad-hoc profile only installs on devices whose UDID is registered
  (`npx eas-cli device:create`), and adding a device means rebuilding. Once the
  credentials exist, `--non-interactive` CI builds reuse them. To smoke-test
  iOS without an Apple Developer account, build the `preview-simulator` profile
  — a Simulator build needs no signing at all.

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
