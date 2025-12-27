# Mobile App Architecture

## Overview

The NodeTool mobile app is a React Native application built with Expo that enables users to browse and run Mini Apps (NodeTool workflows) from their mobile devices.

## Technology Stack

- **Framework**: React Native with Expo SDK 54
- **Language**: TypeScript 5.9
- **Navigation**: React Navigation v7 (Native Stack)
- **HTTP Client**: Axios
- **Storage**: AsyncStorage
- **UI**: React Native core components

## Architecture Principles

### 1. Code Reuse from Web App

The mobile app reuses types, patterns, and logic from the web application wherever possible:

- **Type Definitions**: Adapted from `web/src/components/miniapps/types.ts`
- **API Patterns**: Based on `web/src/stores/ApiClient.ts`
- **Business Logic**: Input handling mirrors web implementation

### 2. Configurable Server Host

Unlike the web app which uses environment variables and build-time configuration, the mobile app:
- Stores server URL in AsyncStorage (persisted across app restarts)
- Allows runtime configuration through Settings UI
- Supports testing connection before saving

### 3. Native Mobile UX

- Touch-optimized UI with appropriate spacing and tap targets
- Pull-to-refresh for workflow list
- Native navigation with back button support
- Platform-specific styling (iOS/Android differences handled automatically)

## Project Structure

```
mobile/
├── src/
│   ├── navigation/           # Navigation configuration
│   │   └── types.ts         # TypeScript types for navigation
│   │
│   ├── screens/             # Screen components
│   │   ├── MiniAppsListScreen.tsx   # List of available mini apps
│   │   ├── MiniAppScreen.tsx        # Mini app execution screen
│   │   ├── SettingsScreen.tsx       # Server configuration
│   │   └── ChatScreen.tsx           # AI chat interface
│   │
│   ├── components/          # Reusable components
│   │   └── chat/           # Chat-specific components
│   │       ├── index.ts           # Component exports
│   │       ├── ChatView.tsx       # Main chat container
│   │       ├── ChatComposer.tsx   # Input field + send button
│   │       ├── ChatMessageList.tsx # Message list with auto-scroll
│   │       ├── MessageView.tsx    # Individual message rendering
│   │       ├── ChatMarkdown.tsx   # Markdown renderer
│   │       └── LoadingIndicator.tsx # Pulsating animation
│   │
│   ├── services/            # Service layer
│   │   ├── api.ts          # API client with configurable host
│   │   └── WebSocketManager.ts # WebSocket with reconnect
│   │
│   ├── stores/              # State management
│   │   ├── WorkflowRunner.ts # Workflow execution state
│   │   └── ChatStore.ts      # Chat state (Zustand)
│   │
│   ├── hooks/               # Custom React hooks
│   │   └── useMiniAppInputs.ts
│   │
│   └── types/              # TypeScript type definitions
│       ├── index.ts        # Type exports
│       ├── ApiTypes.ts     # API-generated types
│       ├── miniapp.ts      # Mini app domain types
│       ├── workflow.ts     # Workflow types
│       └── chat.ts         # Chat-specific types
│
├── assets/                 # Images, icons, splash screens
├── App.tsx                # Root component with navigation
├── app.json               # Expo configuration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
├── ARCHITECTURE.md        # Architecture documentation
└── PRD_CHAT_FEATURE.md    # Chat feature PRD
```

## Component Architecture

### App.tsx (Root Component)

```
App
├── NavigationContainer
    └── Stack.Navigator
        ├── MiniAppsListScreen (initial route)
        ├── MiniAppScreen
        └── SettingsScreen
```

**Responsibilities:**
- Initialize navigation
- Load API host from storage on startup
- Provide global navigation context

### MiniAppsListScreen

**State:**
- `workflows`: List of available workflows
- `isLoading`: Loading state for initial fetch
- `isRefreshing`: Refresh state for pull-to-refresh

**Actions:**
- `loadWorkflows()`: Fetch workflows from API
- `handleRefresh()`: Pull-to-refresh action
- `handleWorkflowPress()`: Navigate to MiniAppScreen

**Error Handling:**
- Shows alert on connection failure
- Provides navigation to Settings
- Offers retry option

### MiniAppScreen

**State:**
- `workflow`: Full workflow data
- `inputValues`: Record<string, any> - User input values
- `isLoading`: Loading state
- `isRunning`: Execution state
- `results`: Execution results (stringified JSON)

**Actions:**
- `loadWorkflow()`: Fetch workflow details
- `initializeInputs()`: Set default input values
- `extractInputDefinitions()`: Parse workflow nodes to find inputs
- `handleRun()`: Execute workflow with current input values

**Input Types Supported:**
- String (TextInput)
- Integer (Numeric TextInput)
- Float (Numeric TextInput)
- Boolean (Switch)

**Future Enhancements:**
- Image input (file picker)
- Audio input
- File path input

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
4. Update axios client baseURL
```

### Workflow List Flow

```
1. MiniAppsListScreen mount
   ↓
2. loadWorkflows()
   ↓
3. apiService.getWorkflows()
   ↓
4. GET /api/workflows/?limit=100
   ↓
5. Update workflows state
   ↓
6. Render FlatList
```

### Workflow Execution Flow

```
1. User fills inputs
   ↓
2. User taps "Run"
   ↓
3. handleRun() called
   ↓
4. apiService.runWorkflow(workflowId, inputValues)
   ↓
5. POST /api/workflows/{id}/run
   ↓
6. Display results
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
  getWorkflows(limit?: number): Promise<any>
  getWorkflow(id: string): Promise<any>
  runWorkflow(id: string, params: Record<string, unknown>): Promise<any>
  
  // Utility
  getWebSocketUrl(path: string): string
}
```

### Features

- **Configurable Base URL**: Updates axios instance when URL changes
- **Persistent Storage**: Saves URL in AsyncStorage
- **Error Handling**: Throws errors for component-level handling
- **WebSocket URL Generation**: Converts HTTP URL to WS/WSS for future real-time features

## Navigation Structure

### Stack Navigator

```typescript
type RootStackParamList = {
  MiniAppsList: undefined;
  MiniApp: {
    workflowId: string;
    workflowName: string;
  };
  Settings: undefined;
  Chat: undefined;
};
```

### Navigation Flow

```
MiniAppsListScreen
├── Settings (from header button)
├── Chat (from header button)
└── MiniApp (from workflow card tap)
    └── Settings (from error alert)
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

### Loading Indicator

Pulsating animation using React Native's `Animated` API:
- Scale animation: 0.8 → 1.2 → 0.8
- Opacity animation: 0.5 → 1.0 → 0.5
- 1.4s cycle duration

## Type System

### Core Types

**Workflow Types:**
```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  graph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}
```

**Input Types:**
```typescript
type MiniAppInputKind = "string" | "integer" | "float" | "boolean" | "image" | "audio" | "file_path";

interface MiniAppInputDefinition {
  nodeId: string;
  nodeType: string;
  kind: MiniAppInputKind;
  data: InputNodeData;
  defaultValue?: unknown;
}
```

## Storage Strategy

### AsyncStorage Keys

- `@nodetool_api_host`: Server URL configuration

### Data Persistence

- Server URL: Persisted across app restarts
- Workflow state: In-memory only (cleared on navigation)
- Input values: In-memory only (cleared on navigation)

Future considerations:
- Save draft input values
- Cache workflow list
- Store recent workflows

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
  const data = await apiService.getWorkflows();
  setWorkflows(data);
} catch (error) {
  console.error('Failed to load:', error);
  Alert.alert('Error', 'Failed to load workflows', [
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
- Implement pagination for workflow list
- Add image lazy loading for workflow thumbnails

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

### Unit Tests (Future)

```bash
# Install testing dependencies
npm install --save-dev jest @testing-library/react-native

# Run tests
npm test
```

Target coverage:
- API service methods
- Input parsing logic
- Type conversions

### Integration Tests (Future)

- Navigation flows
- API integration
- AsyncStorage operations

### Manual Testing Checklist

- [ ] Configure server URL
- [ ] Test connection validation
- [ ] Load workflow list
- [ ] Pull to refresh
- [ ] Open workflow
- [ ] Fill various input types
- [ ] Run workflow
- [ ] View results
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

1. **Workflow Creation**: Build workflows on mobile
2. **Collaboration**: Share workflows with other users
3. **Push Notifications**: Notify on long-running workflow completion
4. **Workflow Scheduling**: Schedule workflows to run at specific times

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
