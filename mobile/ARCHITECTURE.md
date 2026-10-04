# Mobile App Architecture

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Mobile Architecture**

## Overview

The NodeTool mobile app is a React Native application built with Expo. It is a
phone companion to the desktop and web apps: it runs Mini Apps, chats with the
assistant, follows jobs, captures and views assets, edits storyboards, and views
timelines and sketches. Workflow editing and the other desktop editors stay on
desktop and web. [AGENTS.md § Scope](AGENTS.md#scope) states the rule.

## Technology Stack

- **Framework**: React Native 0.85 with Expo SDK 56
- **Language**: TypeScript 6
- **UI runtime**: React 19
- **Navigation**: React Navigation v7 (Native Stack)
- **Server state**: tRPC v11 client + TanStack Query v5 (REST via the global `fetch`; no Axios)
- **Local state**: Zustand v5 stores
- **Realtime**: WebSocket + MsgPack (`@msgpack/msgpack`)
- **Auth**: Supabase + Google Sign-In
- **Storage**: AsyncStorage
- **UI**: React Native core components (`StyleSheet`)

## Architecture Principles

### 1. Code Reuse from Web App

The mobile app reuses types, patterns, and logic from the web application wherever possible:

- **Type Definitions**: `@nodetool-ai/protocol`, imported directly
- **Mini-app runtime**: `@nodetool-ai/app-runtime`, compiled from source (see `metro.config.js`)
- **Business Logic**: Input handling mirrors web implementation

### 2. Configurable Server Host

Unlike the web app which uses environment variables and build-time configuration, the mobile app:
- Stores server URL in AsyncStorage (persisted across app restarts)
- Allows runtime configuration through Settings UI
- Supports testing connection before saving

### 3. Native Mobile UX

- Touch-optimized UI with appropriate spacing and tap targets
- Pull-to-refresh on the lists
- Native navigation with back button support
- Platform-specific styling (iOS/Android differences handled automatically)

## Project Structure

```
mobile/
├── src/
│   ├── navigation/           # Navigation configuration + types
│   │
│   ├── screens/             # Screen components
│   │   ├── AppsScreen.tsx              # Mini-app browser, the home screen
│   │   ├── AppScreen.tsx               # One mini app, run natively
│   │   ├── ChatScreen.tsx              # AI chat interface
│   │   ├── ThreadsScreen.tsx           # Chat thread list
│   │   ├── LanguageModelSelectionScreen.tsx
│   │   ├── DocumentsScreen.tsx         # Storyboards, timelines, sketches
│   │   ├── StoryboardEditorScreen.tsx  # Storyboard editor
│   │   ├── TimelineViewerScreen.tsx    # Timeline viewer, view only
│   │   ├── SketchViewerScreen.tsx      # Sketch viewer, view only
│   │   ├── AssetsScreen.tsx            # Asset browser
│   │   ├── AssetViewerScreen.tsx       # Single-asset viewer
│   │   ├── JobsScreen.tsx              # Job history
│   │   ├── JobDetailScreen.tsx         # One job
│   │   ├── SettingsScreen.tsx          # Server configuration
│   │   └── LoginScreen.tsx             # Supabase / Google sign-in
│   │
│   ├── documents/           # Document layer (kinds, load/save, agent bridge, ui_* tools)
│   │
│   ├── components/          # Reusable components
│   │   ├── app_runtime/       # Mini-app runtime (renders an application document)
│   │   ├── chat/              # Chat UI, with inline resource previews
│   │   ├── sketch/            # Sketch compositor
│   │   ├── timeline/          # Timeline lanes drawing
│   │   └── outputs/           # Output value rendering
│   │
│   ├── services/            # Service layer
│   │   ├── api.ts             # REST API client (fetch + ApiError/retry/timeout)
│   │   ├── apiHost.ts         # Shared base-URL resolution
│   │   ├── WebSocketService.ts # Singleton WS (workflow/job routing)
│   │   ├── WebSocketManager.ts # Per-connection WS with reconnect (chat)
│   │   └── supabase.ts        # Supabase client
│   │
│   ├── trpc/                # tRPC client + React Query provider
│   │
│   ├── stores/              # Zustand state
│   │   ├── WorkflowRunner.ts      # Workflow execution state
│   │   ├── ChatStore.ts           # Chat state
│   │   ├── MediaGenerationStore.ts # Image/video generation params
│   │   ├── AuthStore.ts           # Auth/session state
│   │   └── ThemeStore.ts          # Theme state
│   │
│   ├── hooks/               # Custom React hooks
│   │
│   └── types/              # TypeScript type definitions (ApiTypes, workflow, …)
│
├── assets/                 # Images, icons, splash screens
├── App.tsx                # Root component with navigation
├── app.json               # Expo configuration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
├── jest.config.js         # Jest + V8 coverage config
├── AGENTS.md              # Agent quick reference
└── ARCHITECTURE.md        # Architecture documentation
```

## Mini apps (`src/components/app_runtime/`)

A mini app is an **application** — its own resource on the server, with the
document the web App Builder authors, operations that bind workflows by id, and
a released snapshot once it is published. Mobile reads them over
`/api/applications/*` (the REST door onto the service tRPC serves the web
client) and renders them; it does not edit them (Puck is a DOM editor).

`AppsScreen` lists the apps, `AppScreen` opens one — the same one-per-screen
model the documents browser uses. A workflow is never presented as an app, and
nothing generates an app document for a workflow that has none. Apps is the
first screen after sign-in, and its header opens Chat, Documents, Jobs, Assets,
and Settings.

The semantics come from `@nodetool-ai/app-runtime`, the framework-independent
core the web runtime, the CLI `app debug` harness, and the eval suites already
share: document parsing, binding resolution, the four state namespaces, the
streaming fold, conditions, actions, and the widget catalog. Only the controls
are native, so an app behaves the same on both clients.

```
useApplications      # React Query over /api/applications: list, draft, release
ApplicationAppView   # renders the document's widget tree
  useAppRuntime      # the engine: claims invocations, folds messages, dispatches actions
    appRuntimeStore  # Zustand wrapper around the shared reducer, one per app instance
    AppRuntimeContext# binding resolution, conditions, formatting
  widgets.tsx        # one native renderer per WIDGET_CATALOG entry
    useWidgetRuntime # binds a widget's props to reactive state + events
```

- **Published beats draft.** `useApplicationApp` prefers the released snapshot,
  which pins the graph each operation runs, so a published app needs no workflow
  request. An unpublished app falls back to the draft document plus the live
  workflow.
- **Bindings key on node IDs** (`op:main/in:<nodeId>`), so renaming a node in
  the editor never breaks an app. Bare names still resolve — that's the legacy
  document form.
- **Run identity**: the runtime mints the job id before it sends the run and
  passes it as the request's `job_id`, which the server honours. Messages are
  matched on that id alone, so a second parallel invocation never folds into
  the wrong slot.
- **Release identity**: every run of an app sends `application_id` and, for a
  run of the released snapshot, `application_version`. The server gates the run
  on the app's spend budget and files it in the release ledger; a run that omits
  them is unmetered, so `useApplicationApp` hands the identity down to
  `useAppRuntime` and on into the run request.
- **Run policy and timeout** are enforced, not just parsed: `decideRun` decides
  what a run colliding with a live one does (`replace` cancels first, `queue`
  waits, `parallel` starts), and an operation's `timeoutMs` cancels the run and
  fails the invocation with a timeout error.
- **Variables**: declared defaults seed the instance at open, and `scope: "user"`
  + `persist: true` variables survive a restart — stored in AsyncStorage by
  `variablePersistence.ts` under `app-runtime:variables:app:<applicationId>`, so
  two apps never share a slot. Restoring runs before defaults are seeded (seeding
  never clobbers), and instance-scoped and view values are never written.
- **Outputs can write variables**: an operation output mapped `to: "variable"`
  lands in that variable as well as in its display slot, streamed chunks
  accumulating in both.
- **Activity**: a streaming agent's tool/phase/step label shows in the `Progress`
  widget and reads through `op:<id>/exec#activity`, instead of a bare spinner.
- **Operations** are dispatched by id, so an event naming a second operation runs
  that one. Mobile holds one workflow per app screen: when a document's
  operations name several workflows, the ones bound elsewhere refuse to run with
  a visible error rather than running the loaded graph under another name.
- **Mobile differences**: `Columns` stacks vertically (two columns are unusable
  at phone width), there is no reactive-subgraph path (no browser worker, so
  every run is a full server run), and `ResourcePicker`/`ResourceGallery`
  collapse into one list of rows — a grid of tiles buys nothing at phone width.
- **Three display widgets are cards, not previews**: `Model3D`, `Chart` and
  `PDF`. Mobile ships no 3D renderer, no charting library and no WebView, and
  each card names the value, shows the metadata its ref carries, and hands the
  file to the OS instead of drawing something that only looks like it.
  `Gallery` does render — it tiles the bound refs with the same `Image` the
  `Image` widget uses, and a tap opens a full-screen pager the images are swiped
  through (`pagingEnabled`, so the swipe follows the finger and settles on a
  page), with a `n / total` counter and a Close control.
- **Path inputs are typed fields**: a phone sandbox has no user-visible
  filesystem, and a `FilePathInput`/`FolderPathInput` value is read by the
  machine running the workflow, not by the device. Same reasoning as
  `DateInput`. A Hugging Face model input is a repo-id field for the same
  reason: mobile has no hub browser.
- **Sketch widget**: a bound sketch draws rather than being summarised.
  `components/sketch/SketchRenderer` composites it — the same compositor the
  sketch viewer screen uses — for a document bound inline and for a bare
  `SketchRef`, which is read through the sketch document backend. The widget's
  `height` caps the preview: the composite shrinks to fit instead of cropping.
  Timelines still summarise in a widget, because mobile has no video
  compositor.
- **Resource widgets** (`resourceWidgets.tsx`) render a bound document as a card
  — name, kind icon, and a summary read off the body ("6 shots") — that opens
  the screen its kind already has. The route comes from `documents/kinds.ts`
  through `useOpenResource`. A kind mobile has no screen for shows a note that
  it opens in the desktop or web app. A binding that resolves to nothing renders
  an empty state instead of a card, and the `openResource` action navigates the
  same way. `resourceCommand` stays inert:
  writing a document needs a provider router mobile does not have.

The shared package is compiled from source rather than from `dist`: see
`metro.config.js` (bundler), the `paths` entry in `tsconfig.json` (types), and
`moduleNameMapper` in `jest.config.js` (tests). All three point at
`packages/app-runtime/src`, so no build step is needed to run the app.

## Documents (`src/documents/`)

Storyboards, timelines, and sketches are documents on the server. Mobile lists
them in `DocumentsScreen` and opens each in its own pushed screen. Storyboards
are editable. Timelines and sketches are view only: the desktop editor and the
server agent's own tools change them. Other kinds (scripts, JS scripts,
workflows) open in the desktop or web app, and `useOpenResource` says so
instead of pushing a screen.

**No tabs.** Web keys its whole document UX off `WorkspaceTabType` and keeps
every tab mounted at once. On a phone the navigation stack *is* the tab model:
one document per screen, the top of the stack is the focused one. That removes
the tab store, the `openTab` indirection, and the per-surface `active` prop, and
leaves the parts that never depended on focus. The agent bridge keys by
document id, which ports unchanged.

```
kinds.ts          # which kinds exist: label, icon, surface, route, agentEditable
backends.ts       # per-kind transport; the concurrency token is opaque above it
useDocuments.ts   # React Query over the backends, for the browser
documentStore.ts  # one Zustand store per open document (cached by kind+id)
agentBridge.ts    # handler registry keyed by kind+id, plus the focus claim
uiContext.ts      # the open/focused/selection block sent with each chat turn
tools/            # the ui_storyboard_* tools: registry, manifest, tool_call dispatch
```

**One transport, an opaque token.** All three kinds ride the `resources.*`
envelope, whose concurrency token is a numeric `revision`. `backends.ts` still
keeps the token **opaque**: a backend hands one out on read and echoes it back
on write, and only it knows the shape. A kind with a different scheme can be
added without touching the store.

**`surface` is not `agentEditable`.** `surface` says whether a person can edit
by touch, and `agentEditable` says whether client `ui_*` tools can write. Only
the storyboard is both. The timeline and the sketch are `viewer` and not
`agentEditable`.

**Load and save.** `documentStore` holds the open document's body, name,
concurrency token, and dirty flag. `save()` echoes back the token it read. The
server rejects a stale write rather than applying it, which surfaces as
`status: 'conflict'` and a Reload banner. The store serializes saves, because
the user's Save button and an agent's `ui_storyboard_save` would otherwise send
the same token and the second would be rejected as a conflict the user never
caused. A save only marks the document clean if nothing changed while it was in
flight, so an agent edit landing mid-save is not silently dropped.

**The agent path.** The assistant sees every open document and edits the
storyboard through client tools:

1. On every socket open (including reconnects) `ChatStore` sends
   `client_tools_manifest` with the registered `ui_storyboard_*` tools.
2. Each outgoing turn carries `ui_context`: the open documents, the focused
   one, and the current selection. The timeline and sketch viewers register
   with the bridge too, with no handlers, so the agent knows which timeline or
   sketch the user is looking at. Every tool takes a **required** document id
   and there is no "act on whatever is mounted" fallback.
3. The server sends `tool_call`. `executeToolCall` runs it against the handler
   the mounted screen registered and replies `tool_result`, always, including
   for unknown tools, so the agent is never left waiting.
4. Handlers mutate the same store the screen renders from, so an agent edit
   repaints immediately and `ui_storyboard_save` is the Save button's code path.

Storyboards get shot and board editing but not generation or timeline assembly,
which stay on desktop where a long paid job can be supervised. The server agent
can still edit a timeline with its own `edit_timeline` tools, which write the
server row. `TimelineViewerScreen` reloads on focus, so the change shows when
the user comes back to it.

**Timelines draw as lanes.** `components/timeline/TimelineLanes` draws the
ruler, the track headers, the clips, and the markers. The viewer screen uses it
with seek and clip selection, and the chat preview uses it at a fixed height
with no handlers. Mobile has no video compositor, so neither plays the
sequence.

**Sketches composite, they do not summarize.** `components/sketch/SketchRenderer`
stacks the layers the way `web/.../canvas2d/composite.ts` does: bottom-first,
groups as containers rather than pixels, a layer drawn only when it and every
ancestor group is visible, alpha multiplied down the chain. Pixels come from the
layer's generated asset, a stable `imageReference.uri`, or the raster serialized
into the document, in that order. A layer with none of those renders a labelled
placeholder in its own footprint. Blend modes and rotation are deliberately not
reproduced. React Native has no compositing operator, and approximating them
quietly would lie. `SketchViewerScreen` wraps the renderer with the layer list
and its generation statuses. The app-runtime `Sketch` widget and the chat
preview draw the same composite.

## Component Architecture

### App.tsx (Root Component)

```
App
├── NavigationContainer
    └── Stack.Navigator
        ├── LoginScreen                 (when signed out)
        └── AppsScreen                  (first screen when signed in)
            └── every other screen in `src/screens/`
```

**Responsibilities:**
- Initialize navigation
- Load API host from storage on startup
- Provide global navigation context

### SettingsScreen

**State:**
- `apiHost`: Current server URL
- `isLoading`: Loading state
- `isSaving`: Save/test state

**Actions:**
- `loadSettings()`: Load saved URL from AsyncStorage
- `handleSave()`: Save URL to AsyncStorage
- `handleTestConnection()`: Verify server connectivity

## Data Flow

### Startup Flow

```
1. App.tsx useEffect
   ↓
2. apiService.loadApiHost()
   ↓
3. AsyncStorage.getItem('@nodetool_api_host')
   ↓
4. Cache the resolved host (used by both the fetch client and the tRPC client)
```

## API Service

The `apiService` singleton manages all HTTP communication:

### Methods

```typescript
class ApiService {
  // Configuration
  loadApiHost(): Promise<string>
  saveApiHost(host: string): Promise<void>
  getApiHost(): string
  
  // API Calls
  listApplications(projectId?: string)
  getApplication(id: string)
  uploadAsset(...)
  getThread(threadId: string)

  // Utility
  resolveUrl(urlOrPath: string | null | undefined): string | null
  getWebSocketUrl(path: string): string
}
```

### Features

- **Configurable Base URL**: Resolved from AsyncStorage via `apiHost.ts`; shared by the `fetch` client and the tRPC client
- **Persistent Storage**: Saves URL in AsyncStorage
- **Error Handling**: REST `request()` throws a typed `ApiError` (carrying HTTP status/body), times out via `AbortController`, and retries transient 5xx/network failures while failing fast on 4xx
- **WebSocket URL Generation**: Converts HTTP URL to WS/WSS for realtime workflow/chat streams

> Most domain calls (assets, jobs, documents, threads, models) go through the
> **tRPC client**. The raw `fetch` `request()` path is used for the REST-only
> endpoints such as `/api/applications`, and `uploadAsset` posts multipart
> `FormData` directly.

## Navigation Structure

### Stack Navigator

`RootStackParamList` in `src/navigation/types.ts` declares one route per screen
in `src/screens/`: `Login`, `Apps`, `App`, `Settings`, `Chat`, `Threads`,
`LanguageModelSelection`, `Assets`, `AssetViewer`, `Documents`,
`StoryboardEditor`, `TimelineViewer`, `SketchViewer`, `Jobs`, and `JobDetail`.
Deep links map onto it in `src/navigation/linking.ts`, with `/` on Apps and
`nodetool://job/<id>` on JobDetail.

### Navigation Flow

```
AppsScreen
├── App (from an app card)
├── Chat, Documents, Jobs, Assets, Settings (from header buttons)
│   Documents
│   ├── StoryboardEditor
│   ├── TimelineViewer
│   └── SketchViewer
└── Threads, LanguageModelSelection (from Chat)
```

## Chat Feature Architecture

### Overview

The Chat screen provides AI assistant functionality using WebSocket-based real-time communication, adapted from the web application.

### Components

```
ChatScreen
├── ChatView
│   ├── ChatMessageList
│   │   └── MessageView (for each message)
│   │       └── ChatMarkdown (for assistant responses)
│   ├── LoadingIndicator (during AI response)
│   └── ChatComposer
│       ├── TextInput
│       └── SendButton / StopButton
```

### State Management

The `ChatStore` (Zustand) manages:

```typescript
interface ChatState {
  status: ChatStatus;           // Connection state
  statusMessage: string | null; // Progress messages
  error: string | null;         // Error messages
  threads: Record<string, Thread>;
  currentThreadId: string | null;
  messageCache: Record<string, Message[]>;
}
```

### WebSocket Communication

**WebSocketManager** handles:
- Connection lifecycle with auto-reconnect
- Msgpack encoding/decoding
- Exponential backoff for reconnection
- Message queueing during disconnection

**Message Protocol:**
- User messages sent with `type: "message"`
- Server responds with `chunk` (streaming) or `message` (complete)
- `job_update` and `node_update` for progress
- `generation_stopped` for stop confirmation

### Key Adaptations from Web

| Web Pattern | Mobile Adaptation |
|-------------|-------------------|
| `@emotion/react` CSS | `StyleSheet.create()` |
| `TextareaAutosize` | `TextInput` with `multiline` |
| `react-markdown` | `react-native-markdown-display` |
| CSS `@keyframes` animation | `Animated` API |
| EventEmitter | Callback-based |
| `window` events | React Native lifecycle |

### Message Rendering

- **User messages**: Plain text with accent background
- **Assistant messages**: Full markdown rendering with:
  - Headers, bold, italic
  - Code blocks with syntax highlighting
  - Links, lists, tables
  - Blockquotes
  - Inline resource previews (below)

### Inline Resource Previews

An assistant message that names a sketch or a timeline draws it inline, with a
chip under it that opens the viewer. This is web's `InlineResourcePreview`
behavior with native controls.

- `components/chat/resourceMentions.ts` is a markdown-it plugin. It turns a
  bare `sketch://<id>` or `timeline://<id>`, and a URI alone in a code span,
  into image tokens, so all three forms (image syntax included) reach one
  `image` render rule in `ChatMarkdown`. URIs are parsed with `parseResourceUri`
  and matched against `RESOURCE_KINDS` from `@nodetool-ai/protocol`.
- It works on tokens, so a fenced block never changes and a code span holding
  anything besides one URI stays literal. Text inside a link is left alone.
- `components/chat/InlineResourcePreview.tsx` loads a sketch with
  `trpc.sketch.get` and draws it with `SketchRenderer`, and loads a timeline
  with `trpc.timeline.get` and draws its title, duration, and
  `TimelineLanes`. Both are capped at a fixed height.
- A failed load, and a kind with no preview (a storyboard, an asset), shows the
  chip alone. A chip for a kind mobile cannot open says it opens in the desktop
  or web app.
- `@nodetool-ai/protocol/resource-uri` is compiled from source, wired the same
  three ways as `app-runtime`, because the published protocol build mobile
  installs predates `parseResourceUri`.

### Loading Indicator

Pulsating animation using React Native's `Animated` API:
- Scale animation: 0.8 → 1.2 → 0.8
- Opacity animation: 0.5 → 1.0 → 0.5
- 1.4s cycle duration

## Type System

### Core Types

Domain types come from `@nodetool-ai/protocol` through `src/types/ApiTypes.ts`.
Mini-app documents use the types in `@nodetool-ai/app-runtime`.

## Storage Strategy

### AsyncStorage Keys

- `@nodetool_api_host`: Server URL configuration

### Data Persistence

- Server URL: Persisted across app restarts
- Mini-app variables declared `scope: "user"` with `persist: true`: AsyncStorage
- Other run state and input values: in memory only (cleared on navigation)

## Error Handling Strategy

### Levels

1. **API Service Level**: Throws errors for caller to handle
2. **Component Level**: Catches errors and shows user feedback
3. **User Feedback**: 
   - Alerts for critical errors
   - Inline text for validation errors
   - Loading states for async operations

### Example Pattern

```typescript
try {
  setIsLoading(true);
  const data = await apiService.listApplications();
  setApps(data);
} catch (error) {
  console.error('Failed to load:', error);
  Alert.alert('Error', 'Failed to load apps', [
    { text: 'Settings', onPress: navigateToSettings },
    { text: 'Retry', onPress: retry }
  ]);
} finally {
  setIsLoading(false);
}
```

## Styling Strategy

### StyleSheet API

All styles use React Native's `StyleSheet.create()` for:
- Type safety
- Performance optimization
- Consistent patterns

### Style Organization

Styles are colocated with components at the bottom of each file.

### Design Tokens

```typescript
const colors = {
  primary: '#007AFF',
  secondary: '#666',
  background: '#f5f5f5',
  cardBackground: '#fff',
  text: '#333',
  textSecondary: '#666',
  border: '#ddd',
  error: '#ff3b30',
};
```

## Performance Considerations

### Optimizations

1. **Lazy Loading**: Screens are loaded on-demand via React Navigation
2. **Memoization**: Consider using React.memo for list items
3. **FlatList**: Used instead of ScrollView for long lists
4. **Image Optimization**: Consider using expo-image for better performance

### Future Optimizations

- Implement React Query for caching and background updates
- Add optimistic updates for better perceived performance
- Add image lazy loading for asset thumbnails

## Security Considerations

### Current Implementation

- HTTP only (no authentication)
- Plain text API communication
- No sensitive data stored

### Future Enhancements

- HTTPS support
- Token-based authentication
- Secure storage for credentials
- Certificate pinning for production

## Testing Strategy

### Unit Tests

Tests use Jest with `@testing-library/react-native` and live next to the code
they cover (`*.test.ts`/`*.test.tsx`).

```bash
npm test               # run the suite
npm run test:coverage  # run with V8 coverage + thresholds
```

Covered today: chat UI components, property editors, hooks, the
`ChatStore`/`WorkflowRunner`/`MediaGenerationStore`/`AuthStore`
stores, the `WebSocketManager`, and the REST `api` client
(`ApiError`/retry/timeout, `uploadAsset`).

Coverage runs with the **V8** provider (babel-plugin-istanbul's `test-exclude`
is incompatible with the hoisted `minimatch` v9 in this monorepo).
`coverageThreshold.global` is set below the measured numbers so the gate stays
honest and enforceable; raise it as coverage grows.

### Integration Tests (Future)

- Navigation flows
- tRPC/REST integration
- AsyncStorage operations

### Manual Testing Checklist

- [ ] Configure server URL
- [ ] Test connection validation
- [ ] Load the apps list
- [ ] Pull to refresh
- [ ] Open and run a mini app
- [ ] Fill various input types
- [ ] View results
- [ ] Open a sketch and a timeline from a chat reply
- [ ] Handle connection errors
- [ ] Navigate back/forward

## Platform-Specific Considerations

### iOS

- Uses native navigation transitions
- Supports safe area insets
- Follows iOS Human Interface Guidelines

### Android

- Material Design components
- Hardware back button support
- Edge-to-edge display support

### Web (via Expo)

- Can run in browser for testing
- Requires react-dom and react-native-web
- Limited to touch interactions

## Future Enhancements

### Short Term

1. **Real-time Updates**: WebSocket integration for live workflow execution status
2. **Image Inputs**: File picker integration for image-based workflows
3. **Better Results Display**: Rich media rendering (images, audio, video)
4. **Offline Support**: Cache workflow definitions

### Medium Term

1. **Authentication**: User login and API tokens
2. **Workflow History**: Track and replay previous executions
3. **Favorites**: Bookmark frequently used workflows
4. **Search**: Filter workflows by name/description

### Long Term

1. **Remote push**: notify a closed app when a job finishes. Local
   notifications already cover a backgrounded app.

## Deployment

### Development

```bash
npm start
```

Distributes via Expo Go app on devices.

### Preview Builds

```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Creates installable builds for testing without Expo Go.

### Production

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit
```

Creates production builds and submits to app stores.

## Maintenance

### Updating Dependencies

```bash
# Check for updates
npx expo-doctor

# Update Expo SDK
npx expo install expo@latest

# Update other dependencies
npm update
```

### Monitoring

Consider integrating:
- Sentry for error tracking
- Analytics for usage metrics
- Performance monitoring

## Contributing

When contributing to the mobile app:

1. Follow existing code patterns
2. Keep types in sync with web app where applicable
3. Test on both iOS and Android
4. Update documentation for new features
5. Consider offline/error states
