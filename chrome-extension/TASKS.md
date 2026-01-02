# Tasks

## Scope
Implement the full GlobalChat UI from the web application in the Chrome extension sidepanel, including:
- Theme setup (ThemeNodetool with CSS variables)
- Chat components (GlobalChat, ChatView, ThreadList, composer, messages)
- State management (GlobalChatStore, related stores)
- Required hooks and utilities
- Dependencies installation and build configuration

## Inventory (from current exploration)
- Web components mirrored under `nodetool/chrome-extension/vendor/web/src/components/...`.
- Theme files live in `nodetool/web/src/components/themes/...` (including `paletteDark.ts`, `paletteLight.ts`, and `components/editorControls.ts`).
- Theme typings/augmentations in `nodetool/web/src/theme.d.ts`, `nodetool/web/src/emotion.d.ts`, `nodetool/web/src/material-ui.d.ts`.

## Required npm packages (from import scan of vendor web components)
- `@emotion/react`
- `@emotion/styled`
- `@fontsource/inter`
- `@fontsource/jetbrains-mono`
- `@lexical/code`
- `@lexical/link`
- `@lexical/list`
- `@lexical/markdown`
- `@lexical/react`
- `@lexical/rich-text`
- `@mui/icons-material`
- `@mui/material`
- `@tanstack/react-query`
- `@xyflow/react`
- `date-fns`
- `dompurify`
- `lodash`
- `loglevel`
- `prismjs`
- `react`
- `react-dom`
- `react-markdown`
- `react-plotly.js`
- `react-router-dom`
- `react-syntax-highlighter`
- `react-virtualized-auto-sizer`
- `react-window`
- `rehype-raw`
- `remark-gfm`
- `tabulator-tables`
- `zustand`

---

## Phase 1: Theme Setup

### 1.1 Copy Theme Files
- [x] Copy `web/src/components/themes/ThemeNodetool.tsx` → `chrome-extension/src/themes/ThemeNodetool.tsx`
- [x] Copy `web/src/components/themes/paletteDark.ts` → `chrome-extension/src/themes/paletteDark.ts`
- [x] Copy `web/src/components/themes/paletteLight.ts` → `chrome-extension/src/themes/paletteLight.ts`
- [x] Copy `web/src/components/themes/components/editorControls.ts` → `chrome-extension/src/themes/components/editorControls.ts`
- [x] Create `chrome-extension/src/themes/index.ts` exporting all theme files

### 1.2 Copy Theme Type Augmentations
- [x] Copy `web/src/theme.d.ts` → `chrome-extension/src/theme.d.ts`
- [x] Copy `web/src/emotion.d.ts` → `chrome-extension/src/emotion.d.ts`
- [x] Copy `web/src/material-ui.d.ts` → `chrome-extension/src/material-ui.d.ts`

### 1.3 Configure Theme in Sidepanel
- [x] Update `chrome-extension/src/sidepanel/App.tsx`:
  - Import `ThemeProvider` and `CssBaseline` from `@mui/material`
  - Import `ThemeNodetool` from `../themes/ThemeNodetool`
  - Import CSS variables from `../styles/index.css`
  - Wrap app with `<ThemeProvider theme={ThemeNodetool} defaultMode="dark"><CssBaseline />{children}</ThemeProvider>`

---

## Phase 2: Copy Chat Components

### 2.1 Container Components
- [x] Create simplified `chrome-extension/src/components/chat/thread/ThreadList.tsx` (extension-specific)
- [ ] Full GlobalChat migration (deferred - extension has custom App.tsx)
- [ ] ChatView migration (deferred - extension has custom components)

### 2.2 Thread Components
- [x] Create `chrome-extension/src/components/chat/thread/NewChatButton.tsx`
- [x] ThreadList with thread switching, delete, and date formatting
- [x] Integration with ChatHeader popover

### 2.3 Composer Components
- [x] Enhanced existing `ChatInput.tsx` with context toggle
- [x] Model selector - `LanguageModelSelect` component
- [x] Tools selector - `WorkflowToolsSelector` component
- [x] Agent mode toggle - `AgentModeToggle` component
- [ ] Attachment handling (deferred - can add later)

### 2.4 Message Components
- [x] Create `chrome-extension/src/components/chat/message/ChatMarkdown.tsx`
- [x] Enhanced `ChatMessage.tsx` with markdown rendering
- [ ] Tool call/result messages (deferred - can add later)

### 2.5 Controls & Status Components
- [x] Status indicator in ChatHeader
- [x] Connection status chip with colors
- [x] Agent mode toggle (`AgentModeToggle.tsx`)
- [x] Chat toolbar (`ChatToolBar.tsx`) with model/tools/agent mode

### 2.6 Chat Utilities
- [x] Date formatting using date-fns (isToday, isYesterday, isThisWeek)

---

## Phase 3: Copy & Adapt Stores

### 3.1 Core Chat Store
- [x] Create `chrome-extension/src/stores/GlobalChatStore.ts` (adapted from web version)
- [x] Adapt for Chrome extension:
  - [x] Removed Supabase dependencies
  - [x] Configurable server URL and API key
  - [x] Uses Zustand persist with localStorage
  - [x] WebSocket URL configurable via settings

### 3.2 Supporting Stores
- [x] Create `chrome-extension/src/stores/NotificationStore.ts`
- [x] Create `chrome-extension/src/stores/ApiClient.ts` (simplified fetch-based client)
- [x] Create `chrome-extension/src/stores/ApiTypes.ts` (chat-focused types)
- [x] Create `chrome-extension/src/stores/BASE_URL.ts` (URL utilities)
- [x] Create `chrome-extension/src/stores/uuidv4.ts`

### 3.3 Store Utilities
- [x] Create `chrome-extension/src/stores/customEquality.ts`

---

## Phase 4: Copy Hooks

### 4.1 Chat Hooks
- [x] Create `chrome-extension/src/hooks/useEnsureChatConnected.ts`
- [x] Create `chrome-extension/src/hooks/useChatService.ts`
- [ ] useRunningJobs (deferred - not needed for basic chat)

### 4.2 Server State Hooks (React Query)
- [ ] useThreadsQuery (deferred - using GlobalChatStore instead)
- [ ] useWorkflow (deferred - not needed for basic chat)

### 4.3 UI Hooks
- [ ] useDelayedHover (deferred - not needed)
- [ ] useNumberInput (deferred - not needed)

---

## Phase 5: Copy WebSocket & API Utilities

### 5.1 WebSocket Manager
- [x] Create `chrome-extension/src/lib/websocket/WebSocketManager.ts` (adapted from web version)

### 5.2 Chat Protocol
- [x] Create `chrome-extension/src/core/chat/chatProtocol.ts` (simplified message handler)

### 5.3 API Client
- [x] API client integrated into stores/ApiClient.ts

---

## Phase 6: Dependencies & Build Configuration

### 6.1 Install Dependencies
- [x] Add all required packages to `chrome-extension/package.json`:
  - All dependencies installed including fontsource, lexical, mui, react-query, etc.
  - Added @types/node for NodeJS namespace support

### 6.2 TypeScript Configuration
- [x] `chrome-extension/tsconfig.json` is configured with proper settings
  - `jsxImportSource: "@emotion/react"` already set
  - Paths alias `@/*` configured

### 6.3 Vite Configuration
- [x] `chrome-extension/vite.config.ts` configured:
  - Alias for `@/` pointing to `src/`
  - Emotion plugin configured
  - Extension build configured

---

## Phase 7: Entry Point & Routing

### 7.1 Update Sidepanel Entry
- [x] Modified `chrome-extension/src/sidepanel/App.tsx`:
  - Uses ThemeProvider with ThemeNodetool
  - Uses CssBaseline from @mui/material
  - Imports global CSS for scrollbars and styling
  - Uses dark mode by default

### 7.2 Remove Router Dependencies
- [x] Extension uses internal state instead of react-router-dom for thread navigation
- [x] Simplified GlobalChat to work without URL-based routing

---
  import CssBaseline from '@mui/material/CssBaseline';
  import { InitColorSchemeScript } from '@mui/material-next';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { BrowserRouter } from 'react-router-dom';
  import ThemeNodetool from './themes/ThemeNodetool';
  import GlobalChat from './components/chat/containers/GlobalChat';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={ThemeNodetool}>
          <InitColorSchemeScript />
          <CssBaseline />
          <BrowserRouter>
            <GlobalChat />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
  ```

### 7.2 Remove Router Dependencies
- [ ] Since this is a sidepanel, decide if full `react-router-dom` is needed
- [ ] If not, simplify GlobalChat.tsx to remove `useParams` and `useNavigate`
- [ ] Use direct state management instead of URL-based routing for threads

---

## Phase 8: Fix Imports & Adapt Code

### 8.1 Fix Import Paths
- [ ] Update all relative imports from `../../../stores/` to `../../stores/`
- [ ] Update all component imports to use `../../components/chat/...`
- [ ] Create index exports for cleaner imports if needed

### 8.2 Adapt for Extension Context
- [ ] Remove/modify features that don't apply to extension:
  - Panel store references (sidepanel doesn't have resizable panels)
  - URL routing for threads (use internal state)
  - AppHeader references
- [ ] Add extension-specific adaptations:
  - Resize handling for sidepanel dimensions
  - Extension messaging API integration if needed
  - LocalStorage for persistence

### 8.3 CSS & Styling
- [ ] Copy `web/src/styles/index.css` → `chrome-extension/src/styles/index.css`
- [ ] Copy `web/src/styles/mobile.css` → `chrome-extension/src/styles/mobile.css`
- [ ] Update `index.html` to include extension-specific styles
- [ ] Handle CSS variables for theme colors

---

## Phase 9: Build & Test

### 9.1 Build Verification
- [ ] Run `npm install` in chrome-extension directory
- [ ] Run `npm run build` to verify no TypeScript errors
- [ ] Check browser console for runtime errors

### 9.2 Test in Browser
- [ ] Load extension in Chrome
- [ ] Open sidepanel
- [ ] Verify theme renders correctly
- [ ] Test thread creation and switching
- [ ] Test message sending and receiving
- [ ] Verify WebSocket connection works

---

## Open Questions & Decisions

- [ ] Should the extension use the full web theme stack (including `theme.d.ts`, `emotion.d.ts`, `material-ui.d.ts`) and the CSS vars setup, or only the theme object?
  - **Recommendation**: Use full stack for consistency and type safety

- [ ] Where should ThemeNodetool live inside `nodetool/chrome-extension` (e.g., `src/themes` vs. `vendor/web/src/components/themes`)?
  - **Recommendation**: Use `src/themes` to keep it as source of truth, copy from vendor

- [ ] Should we add all dependencies listed above to `nodetool/chrome-extension/package.json`, or only the subset actually used by the extension UI?
  - **Recommendation**: Add all dependencies initially; can prune later if bundle size is an issue

- [ ] Is the extension expected to render the full web chat components, or only the thread view/composer?
  - **Recommendation**: Render the full GlobalChat experience for feature parity

- [ ] Should the extension use URL-based routing (react-router-dom) or internal state for thread navigation?
  - **Decision needed**: URL routing adds complexity; internal state may be simpler for sidepanel

- [ ] How should WebSocket URLs be configured in the extension?
  - Options: Hardcoded, configurable via extension settings, environment variable
  - **Recommendation**: Environment variable with local development override

- [ ] Should Supabase be included for authentication, or use anonymous/local auth?
  - **Decision needed**: Depends on backend capabilities

---

## File Mapping Summary

```
chrome-extension/
├── src/
│   ├── themes/
│   │   ├── index.ts                    (new)
│   │   ├── ThemeNodetool.tsx           (copied)
│   │   ├── paletteDark.ts              (copied)
│   │   ├── paletteLight.ts             (copied)
│   │   └── components/
│   │       └── editorControls.ts       (copied)
│   ├── components/
│   │   └── chat/
│   │       ├── containers/
│   │       │   ├── GlobalChat.tsx      (copied & adapted)
│   │       │   ├── ChatView.tsx        (copied)
│   │       │   └── ThreadList.tsx      (copied)
│   │       ├── thread/
│   │       │   ├── NewChatButton.tsx   (copied)
│   │       │   ├── ThreadItem.tsx      (copied)
│   │       │   └── types/
│   │       │       └── thread.types.ts (copied)
│   │       ├── composer/
│   │       │   ├── Composer.tsx        (copied)
│   │       │   ├── ModelSelector.tsx   (copied)
│   │       │   ├── ToolsSelector.tsx   (copied)
│   │       │   └── AttachmentButton.tsx (copied)
│   │       ├── message/
│   │       │   ├── MessageList.tsx     (copied)
│   │       │   ├── MessageItem.tsx     (copied)
│   │       │   ├── MessageContent.tsx  (copied)
│   │       │   ├── ToolCallMessage.tsx (copied)
│   │       │   └── ToolResultMessage.tsx (copied)
│   │       ├── controls/
│   │       │   ├── AgentModeToggle.tsx (copied)
│   │       │   ├── StatusIndicator.tsx (copied)
│   │       │   └── PlanningUpdates.tsx (copied)
│   │       └── utils/
│   │           └── formatMessages.ts   (copied)
│   ├── stores/
│   │   ├── GlobalChatStore.ts          (copied & adapted)
│   │   ├── NotificationStore.ts        (copied)
│   │   ├── ApiClient.ts                (copied)
│   │   ├── ApiTypes.ts                 (copied)
│   │   ├── PanelStore.ts               (copied)
│   │   ├── RightPanelStore.ts          (copied)
│   │   ├── SettingsStore.ts            (copied)
│   │   └── customEquality.ts           (copied)
│   ├── hooks/
│   │   ├── useEnsureChatConnected.ts   (copied)
│   │   ├── useChatService.ts           (copied)
│   │   ├── useRunningJobs.ts           (copied)
│   │   ├── useDelayedHover.ts          (copied)
│   │   └── useNumberInput.ts           (copied)
│   ├── serverState/
│   │   ├── useThreadsQuery.ts          (copied)
│   │   └── useWorkflow.ts              (copied)
│   ├── lib/
│   │   ├── websocket/
│   │   │   └── WebSocketManager.ts     (copied)
│   │   └── api.ts                      (copied & adapted)
│   ├── sidepanel/
│   │   ├── index.tsx                   (updated)
│   │   └── main.tsx                    (new or existing)
│   ├── styles/
│   │   ├── index.css                   (copied)
│   │   └── mobile.css                  (copied)
│   ├── emotion.d.ts                    (copied)
│   ├── material-ui.d.ts                (copied)
│   └── theme.d.ts                      (copied)
├── package.json                        (updated)
├── tsconfig.json                       (updated)
├── vite.config.ts                      (updated)
└── index.html                          (updated)
```
