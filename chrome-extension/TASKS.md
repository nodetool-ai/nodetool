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
- [ ] Copy `web/src/components/themes/ThemeNodetool.tsx` → `chrome-extension/src/themes/ThemeNodetool.tsx`
- [ ] Copy `web/src/components/themes/paletteDark.ts` → `chrome-extension/src/themes/paletteDark.ts`
- [ ] Copy `web/src/components/themes/paletteLight.ts` → `chrome-extension/src/themes/paletteLight.ts`
- [ ] Copy `web/src/components/themes/components/editorControls.ts` → `chrome-extension/src/themes/components/editorControls.ts`
- [ ] Create `chrome-extension/src/themes/index.ts` exporting all theme files

### 1.2 Copy Theme Type Augmentations
- [ ] Copy `web/src/theme.d.ts` → `chrome-extension/src/theme.d.ts`
- [ ] Copy `web/src/emotion.d.ts` → `chrome-extension/src/emotion.d.ts`
- [ ] Copy `web/src/material-ui.d.ts` → `chrome-extension/src/material-ui.d.ts`

### 1.3 Configure Theme in Sidepanel
- [ ] Update `chrome-extension/src/sidepanel/index.tsx`:
  - Import `ThemeProvider` and `CssBaseline` from `@mui/material`
  - Import `InitColorSchemeScript` from `@mui/material-next`
  - Import `ThemeNodetool` from `./themes/ThemeNodetool`
  - Wrap app with `<ThemeProvider theme={ThemeNodetool}><InitColorSchemeScript /><CssBaseline />{children}</ThemeProvider>`

---

## Phase 2: Copy Chat Components

### 2.1 Container Components
- [ ] Copy `web/src/components/chat/containers/GlobalChat.tsx` → `chrome-extension/src/components/chat/containers/GlobalChat.tsx`
- [ ] Copy `web/src/components/chat/containers/ChatView.tsx` → `chrome-extension/src/components/chat/containers/ChatView.tsx`
- [ ] Copy `web/src/components/chat/containers/ThreadList.tsx` → `chrome-extension/src/components/chat/containers/ThreadList.tsx`

### 2.2 Thread Components
- [ ] Copy `web/src/components/chat/thread/NewChatButton.tsx` → `chrome-extension/src/components/chat/thread/NewChatButton.tsx`
- [ ] Copy `web/src/components/chat/thread/ThreadItem.tsx` → `chrome-extension/src/components/chat/thread/ThreadItem.tsx`
- [ ] Copy `web/src/components/chat/types/thread.types.ts` → `chrome-extension/src/components/chat/types/thread.types.ts`

### 2.3 Composer Components
- [ ] Copy `web/src/components/chat/composer/Composer.tsx` → `chrome-extension/src/components/chat/composer/Composer.tsx`
- [ ] Copy `web/src/components/chat/composer/ModelSelector.tsx` → `chrome-extension/src/components/chat/composer/ModelSelector.tsx`
- [ ] Copy `web/src/components/chat/composer/ToolsSelector.tsx` → `chrome-extension/src/components/chat/composer/ToolsSelector.tsx`
- [ ] Copy `web/src/components/chat/composer/AttachmentButton.tsx` → `chrome-extension/src/components/chat/composer/AttachmentButton.tsx`

### 2.4 Message Components
- [ ] Copy `web/src/components/chat/message/MessageList.tsx` → `chrome-extension/src/components/chat/message/MessageList.tsx`
- [ ] Copy `web/src/components/chat/message/MessageItem.tsx` → `chrome-extension/src/components/chat/message/MessageItem.tsx`
- [ ] Copy `web/src/components/chat/message/MessageContent.tsx` → `chrome-extension/src/components/chat/message/MessageContent.tsx`
- [ ] Copy `web/src/components/chat/message/ToolCallMessage.tsx` → `chrome-extension/src/components/chat/message/ToolCallMessage.tsx`
- [ ] Copy `web/src/components/chat/message/ToolResultMessage.tsx` → `chrome-extension/src/components/chat/message/ToolResultMessage.tsx`

### 2.5 Controls & Status Components
- [ ] Copy `web/src/components/chat/controls/AgentModeToggle.tsx` → `chrome-extension/src/components/chat/controls/AgentModeToggle.tsx`
- [ ] Copy `web/src/components/chat/controls/StatusIndicator.tsx` → `chrome-extension/src/components/chat/controls/StatusIndicator.tsx`
- [ ] Copy `web/src/components/chat/controls/PlanningUpdates.tsx` → `chrome-extension/src/components/chat/controls/PlanningUpdates.tsx`

### 2.6 Chat Utilities
- [ ] Copy `web/src/components/chat/utils/formatMessages.ts` → `chrome-extension/src/components/chat/utils/formatMessages.ts`

---

## Phase 3: Copy & Adapt Stores

### 3.1 Core Chat Store
- [ ] Copy `web/src/stores/GlobalChatStore.ts` → `chrome-extension/src/stores/GlobalChatStore.ts`
- [ ] Adapt for Chrome extension:
  - Remove/suppress Supabase dependencies if not needed
  - Use localStorage for thread persistence
  - WebSocket URL may need to be configurable

### 3.2 Supporting Stores
- [ ] Copy `web/src/stores/NotificationStore.ts` → `chrome-extension/src/stores/NotificationStore.ts`
- [ ] Copy `web/src/stores/ApiClient.ts` → `chrome-extension/src/stores/ApiClient.ts`
- [ ] Copy `web/src/stores/ApiTypes.ts` → `chrome-extension/src/stores/ApiTypes.ts`
- [ ] Copy `web/src/stores/PanelStore.ts` → `chrome-extension/src/stores/PanelStore.ts`
- [ ] Copy `web/src/stores/RightPanelStore.ts` → `chrome-extension/src/stores/RightPanelStore.ts`
- [ ] Copy `web/src/stores/SettingsStore.ts` → `chrome-extension/src/stores/SettingsStore.ts`

### 3.3 Store Utilities
- [ ] Copy `web/src/stores/customEquality.ts` → `chrome-extension/src/stores/customEquality.ts`

---

## Phase 4: Copy Hooks

### 4.1 Chat Hooks
- [ ] Copy `web/src/hooks/useEnsureChatConnected.ts` → `chrome-extension/src/hooks/useEnsureChatConnected.ts`
- [ ] Copy `web/src/hooks/useChatService.ts` → `chrome-extension/src/hooks/useChatService.ts`
- [ ] Copy `web/src/hooks/useRunningJobs.ts` → `chrome-extension/src/hooks/useRunningJobs.ts`

### 4.2 Server State Hooks (React Query)
- [ ] Copy `web/src/serverState/useThreadsQuery.ts` → `chrome-extension/src/serverState/useThreadsQuery.ts`
- [ ] Copy `web/src/serverState/useWorkflow.ts` → `chrome-extension/src/serverState/useWorkflow.ts`

### 4.3 UI Hooks
- [ ] Copy `web/src/hooks/useDelayedHover.ts` → `chrome-extension/src/hooks/useDelayedHover.ts`
- [ ] Copy `web/src/hooks/useNumberInput.ts` → `chrome-extension/src/hooks/useNumberInput.ts`

---

## Phase 5: Copy WebSocket & API Utilities

### 5.1 WebSocket Manager
- [ ] Copy `web/src/lib/websocket/WebSocketManager.ts` → `chrome-extension/src/lib/websocket/WebSocketManager.ts`

### 5.2 API Client
- [ ] Copy `web/src/lib/api.ts` → `chrome-extension/src/lib/api.ts`
- [ ] Adapt base URLs for extension context

---

## Phase 6: Dependencies & Build Configuration

### 6.1 Install Dependencies
- [ ] Add all required packages to `chrome-extension/package.json`:
  ```json
  "dependencies": {
    "@emotion/react": "^11.x",
    "@emotion/styled": "^11.x",
    "@fontsource/inter": "^5.x",
    "@fontsource/jetbrains-mono": "^5.x",
    "@lexical/code": "^0.x",
    "@lexical/link": "^0.x",
    "@lexical/list": "^0.x",
    "@lexical/markdown": "^0.x",
    "@lexical/react": "^0.x",
    "@lexical/rich-text": "^0.x",
    "@mui/icons-material": "^5.x",
    "@mui/material": "^5.x",
    "@tanstack/react-query": "^5.x",
    "@xyflow/react": "^12.x",
    "date-fns": "^3.x",
    "dompurify": "^3.x",
    "lodash": "^4.x",
    "loglevel": "^1.x",
    "prismjs": "^1.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-markdown": "^9.x",
    "react-plotly.js": "^2.x",
    "react-router-dom": "^6.x",
    "react-syntax-highlighter": "^15.x",
    "react-virtualized-auto-sizer": "^1.x",
    "react-window": "^1.x",
    "rehype-raw": "^7.x",
    "remark-gfm": "^4.x",
    "tabulator-tables": "^5.x",
    "zustand": "^4.x"
  }
  ```

### 6.2 TypeScript Configuration
- [ ] Update `chrome-extension/tsconfig.json`:
  - Add `jsxImportSource: "@emotion/react"`
  - Ensure paths alias works for imports
  - Copy relevant compiler options from web/tsconfig.json

### 6.3 Vite Configuration
- [ ] Update `chrome-extension/vite.config.ts`:
  - Configure alias for `@/` to point to `src/`
  - Add emotion plugin if needed
  - Configure for extension build

---

## Phase 7: Entry Point & Routing

### 7.1 Update Sidepanel Entry
- [ ] Modify `chrome-extension/src/sidepanel/index.tsx`:
  ```tsx
  import React from 'react';
  import ReactDOM from 'react-dom/client';
  import { ThemeProvider } from '@mui/material';
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
