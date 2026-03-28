# Dashboard → Portal Redesign

## Summary

Replace the current panel-based dashboard (Dockview with GettingStarted, Templates, Runtimes, Activity panels) with a minimal, conversational "Portal" — a single centered input that progressively reveals functionality. New users see a prompt and nothing else. Returning users see a whisper-quiet list of recent items. Setup happens inline when the user first tries to act without an API key.

## Design Principles

- **Progressive disclosure**: start with almost nothing, reveal on interaction
- **No onboarding chrome**: setup is triggered by action, not presented upfront
- **Conversational**: the primary interface is a chat input
- **Adaptive**: greeting and recents adjust based on user history
- **Seamless transition**: the portal morphs into the chat view without page navigation

## Visual Structure

### Layout
- Full viewport, single centered column
- Max content width: ~440px, vertically centered
- Background: near-black solid (`#09090d` or theme equivalent)
- No sidebar, no dockview, no panel chrome
- The dashboard route must also remove `PanelLeft` and `PanelBottom` wrappers — the Portal renders full-bleed with only `AppHeader` above it

### AppHeader
- Remains at the top (logo + Editor/Chat mode pills)
- Rendered ultra-light: text links only, no background bar
- Same component as current, just restyled for this route

### Idle State (New User)
```
┌──────────────────────────────────────────┐
│  NODETOOL          Editor   Chat         │
│                                          │
│                                          │
│                                          │
│        What shall we build?              │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ Type here...                  [↑]│    │
│  └──────────────────────────────────┘    │
│                                          │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

- Heading: "What shall we build?" — light weight, muted color
- Input: single text field with send button, no model selector visible yet
- Nothing else. No pills, no cards, no setup steps.

### Idle State (Returning User)
```
┌──────────────────────────────────────────┐
│  NODETOOL          Editor   Chat         │
│                                          │
│                                          │
│        Welcome back.                     │
│        What's next?                      │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ Type here...                  [↑]│    │
│  └──────────────────────────────────┘    │
│                                          │
│  💬 Summarize research papers       2h   │
│  ⚡ Image Enhance Pipeline          5h   │
│  💬 Categorize emails               1d   │
│                                          │
└──────────────────────────────────────────┘
```

- Greeting changes to "Welcome back. What's next?"
- Recent items list appears below the input
- Items are a mixed chronological list of workflows (⚡) and chats (💬)
- Each item: icon + title + relative time
- Maximum 5 recent items displayed
- Sorted by `updated_at` descending for both workflows and threads
- Extremely subtle styling — nearly invisible text, no backgrounds
- Clicking a workflow → opens editor. Clicking a chat → resumes chat.

### Determining New vs Returning User
- A user is "returning" if they have at least one workflow or one chat thread
- Check via existing `useDashboardData` (workflows) and `useChatService` (threads)
- No separate "first visit" flag needed

## Interaction Flows

### Flow 1: User Sends a Message (Happy Path)
1. User types in the input and presses send (Enter to send, Shift+Enter for newline)
2. The heading ("What shall we build?") fades out via CSS transition
3. The input animates to the bottom of the viewport
4. Chat messages render inline within the Portal component — we reuse the existing chat message components but render them directly, not via the `/chat` route
5. Model selector and agent toggle appear inside the input bar (slide in)
6. This is a state change within the Portal component — no route navigation. The Portal does NOT use `useChatService` directly (which hard-codes `navigate()` calls). Instead, Portal interacts with `GlobalChatStore` directly for message state and uses the chat message display components for rendering. The `sendMessage`, `onNewThread`, etc. functions are called on the store directly, and Portal manages its own view state without route changes.
7. Default model for initial send: `DEFAULT_MODEL` from `config/constants`. User can change model after transition via the model selector that appears.

### Flow 2: No API Key Configured (First-Time Setup)
1. User types a message and sends it
2. The portal transitions to chat layout (same as Flow 1)
3. Instead of sending to the API, the component checks for configured providers by fetching secrets via `SecretsStore.fetchSecrets()` and checking if any known provider key names exist (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
4. An "assistant" message appears with an inline provider picker — intentionally limited to three options for simplicity:
   - OpenAI (GPT-4o, DALL-E, Whisper) → [Connect]
   - Anthropic (Claude) → [Connect]
   - Run locally (Ollama) → [Set up]: clicking shows a brief message that Ollama must be installed and running locally, with a link to ollama.com. If Ollama is already running (detectable via a fetch to `http://localhost:11434`), show a green checkmark instead and proceed.
5. User clicks a provider → inline API key input appears (except Ollama, see above)
6. User enters key → key is saved via `SecretsStore.updateSecret()`
7. After saving, the `selectedModel` is updated to a sensible default for the chosen provider (OpenAI → `gpt-4o`, Anthropic → `claude-sonnet-4-20250514`, Ollama → first available model). Then the original message is sent automatically.
8. No immediate key validation — if the key is bad, the provider error surfaces naturally in the chat stream.
9. Small note: "You can add more providers later in settings"

### Flow 3: Clicking a Recent Item
- Workflow items → navigate to `/editor/{workflowId}` via `handleWorkflowClick`
- Chat items → call `onSelectThread(threadId)`, transition Portal to `chatting` state, render chat inline

### Flow 4: Using as Search
- As user types, if input matches workflow names or template names, show results inline below the input (like a command palette)
- Matching: case-insensitive substring match on workflow/template names
- Debounce: 200ms after last keystroke
- Maximum 5 results shown
- If user clicks a result → navigate to it (workflow → editor, template → load template)
- If user presses Enter → always treat as chat message send (never auto-select a search result)
- Search results appear as a dropdown overlay, not replacing the recents list

## Components

### New Components

#### `Portal.tsx` (replaces Dashboard.tsx for this route)
- Main container component
- Manages state: `idle` | `setup` | `chatting`
  - `idle`: heading + input + recents (+ search overlay if typing matches)
  - `setup`: chat layout with the setup flow rendered as an inline message. Intermediate state — transitions to `chatting` after provider is configured.
  - `chatting`: chat messages + input at bottom
- Search results are a UI overlay within `idle` state, not a separate state
- Does NOT use `useChatService` (which hard-codes navigation). Instead interacts with `GlobalChatStore` directly for message operations and thread management.
- Uses `useDashboardData` for workflows/templates, `useWorkflowActions` for navigation
- Provider check logic lives here: on send, fetch secrets, check for known keys, decide `setup` vs `chatting`
- Embeds chat message rendering directly (reuses message components from the chat system)
- "New chat" action: resets to `idle` state, calls store's `newThread()`. The button appears as a subtle icon near the input in `chatting` state.

#### `PortalInput.tsx`
- The unified input field
- Props: `onSend`, `onSearchChange`, `showModelSelector`, `selectedModel`, `onModelChange`, `agentMode`, `onAgentModeToggle`
- When `showModelSelector` is true: model dropdown + agent toggle appear inline
- Handles keyboard: Enter to send, Shift+Enter for newline, typing triggers `onSearchChange`

#### `PortalRecents.tsx`
- The recent items list
- Merges workflows and chat threads into a single chronological list
- Both use `updated_at` field for sorting
- Maximum 5 items displayed
- Props: `workflows`, `threads`, `onWorkflowClick`, `onThreadClick`
- Returns null if no items

#### `PortalSetupFlow.tsx`
- The inline provider setup that appears as a chat message bubble
- Renders three provider cards (OpenAI, Anthropic, Ollama) with connect buttons
- Inline API key input when a provider is selected
- Saves via `SecretsStore.updateSecret()`, then triggers the pending message send
- Props: `onComplete(provider)`, `pendingMessage`
- No immediate key validation — errors surface naturally through chat

### Reused Components
- `AppHeader` — kept as-is, potentially with lighter styling on this route
- Chat message components from the existing chat system (message bubbles, streaming indicators)
- `GlobalChatStore` — direct store access for message state, thread management, send operations (replaces `useChatService` which has hardcoded navigation)

### Removed Components (from dashboard route)
- `DockviewReact` and all dockview infrastructure
- `DashboardHeader`
- `AddPanelDropdown`
- `LayoutMenu`
- `GettingStartedPanel`
- `WelcomePanel`
- `SetupPanel`
- `TemplatesPanel`
- `RuntimesPanel`
- `ActivityPanel`
- `panelConfig.ts` usage (panels still exist for other contexts)
- `panelComponents.tsx` usage
- `defaultLayouts.ts` usage
- `PanelLeft` and `PanelBottom` wrappers from the dashboard route definition

Note: These components are not deleted from the codebase — they may be used elsewhere or could be re-added. They are simply no longer imported or rendered by the dashboard route.

## Transitions & Animation

### Portal → Chat Transition
- Heading: opacity 1 → 0, translateY 0 → -20px (300ms ease-out)
- Input: position animated from center to bottom (400ms ease-out)
- Recents list: opacity 1 → 0 (200ms)
- Chat messages: fade in from opacity 0 (300ms, staggered)
- Use CSS transitions on state class change, not JS animation libraries

### Search Results
- Dropdown slides down from input (200ms ease-out)
- Individual results fade in (100ms stagger)

## Data Flow

```
Portal
├── GlobalChatStore (direct Zustand store access, no useChatService)
│   ├── status, messages, threads, currentThreadId
│   ├── sendMessage(), newThread(), selectThread(), deleteThread()
│   └── progress, statusMessage, stopGeneration()
├── useDashboardData()
│   ├── sortedWorkflows
│   └── startTemplates (for search results)
├── useWorkflowActions()
│   ├── handleWorkflowClick
│   └── handleCreateNewWorkflow
├── SecretsStore
│   └── fetchSecrets() → check for known provider key names
└── selectedModel state (defaults to DEFAULT_MODEL, updated by setup flow or model selector)
```

## State Machine

```
IDLE ──[user types]──→ IDLE (search overlay appears if matches found)
IDLE ──[user sends message]──→ CHECK_PROVIDER (synchronous check, not a rendered state)
CHECK_PROVIDER ──[has provider key in secrets]──→ CHATTING
CHECK_PROVIDER ──[no provider keys]──→ SETUP
SETUP ──[key saved + model set]──→ CHATTING (sends pending message)
IDLE ──[clicks recent workflow]──→ NAVIGATE_TO_EDITOR (route change)
IDLE ──[clicks recent chat]──→ CHATTING (loads thread via GlobalChatStore)
CHATTING ──[new chat action]──→ IDLE (calls store.newThread(), resets view state)
```

Note: `CHECK_PROVIDER` is a synchronous transition check, not a rendered component state. The component state type is `idle | setup | chatting`.

## Error Handling

- API key errors: invalid keys are not validated upfront. If the key is bad, the provider returns an error which surfaces naturally in the chat stream via `useChatService` error handling.
- Network errors during chat: handled by existing `useChatService` error states
- Empty states: if no recents and no API key, just show the heading + input. No error, no empty state message.

## Testing Considerations

- Test state transitions: idle → chatting → back to idle (via new chat)
- Test setup flow: no API key → inline setup → key saved → message sent
- Test recents list: mixed workflows + chats, sorted by `updated_at`, max 5
- Test search: substring matching on workflow/template names, 200ms debounce, Enter always sends
- Test empty state: new user with no history sees only heading + input
- Test default model: initial send uses `DEFAULT_MODEL` when no model explicitly selected
