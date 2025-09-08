# Apps Chat UI Parity (Scoped: LocalStorage + ChatStore only)

Goal: Extend the Apps chat UI (`apps/src/components/ChatInterface.tsx`) to mirror the user-facing features of the Web GlobalChat container, but without WebSockets or server-side threads. Use only the existing `apps/src/stores/ChatStore.ts` for message streaming and persist per-thread state in `localStorage`.

Non-goals: No WebSocket, no remote thread APIs, no Supabase. Planning/Task updates are optional placeholders (only render if present in messages).

## Target Feature Set

- Local threads: list/create/switch/delete persisted to `localStorage`
- New chat flow: create thread and switch context
- Model/tools selection: reuse existing UI/state, persist in store/localStorage
- Agent mode toggle: optional flag recorded per send (store-level only)
- Streaming UX: keep current auto-scroll, loading indicator
- Stop generation: cancel the current HTTP stream via `AbortController`
- Status alerts: show error/idle states (no reconnecting/failed WS states)

---

## Tasks & Subtasks

### 1) Extend ChatStore for Threads (Local only)

- State additions
  - [ ] `threads: Record<string, { id: string; title: string; created_at: string; updated_at: string }>`
  - [ ] `currentThreadId: string | null`
  - [ ] Persist keys: `apps_chat_threads`, `apps_chat_messages_{threadId}`

- Actions
  - [ ] `initializeFromStorage()` to hydrate `threads` and the current thread's `messages`
  - [ ] `createThread(title?: string): string` → creates thread, sets `currentThreadId`, persists
  - [ ] `switchThread(id: string)` → loads `messages` for that thread from storage
  - [ ] `deleteThread(id: string)` → remove thread + its messages; if current, switch to newest or create new
  - [ ] `renameThread(id: string, title: string)` → updates and persists
  - [ ] `persistCurrentThreadMessages()` → write `messages` to `apps_chat_messages_{currentThreadId}` on every change
  - [ ] `resetMessages()` → clear current thread messages + persist

- Send/stream integration
  - [ ] Update `sendMessage()` to assume an active `currentThreadId`; if none, `createThread()` implicitly
  - [ ] Keep existing streaming logic, but ensure every `set({ messages: ... })` also triggers `persistCurrentThreadMessages()`
  - [ ] Generate a sensible default thread title (e.g., first user prompt snippet)

### 2) Add Stop Generation Support

- Store
  - [ ] Introduce `abortController: AbortController | null` in `ChatStore`
  - [ ] In `sendMessage()`, construct and store controller; pass `{ signal: controller.signal }` to `fetch`
  - [ ] New action: `stopGeneration()` → abort controller, set `status: 'connected'`, clear `statusMessage`

- UI
  - [ ] In `Composer`, show a Stop button when `status === 'loading'`
  - [ ] Wire `onStop` to `useChatStore().stopGeneration`

### 3) Thread UI (Local)

- Minimal thread list/drawer
  - [ ] New `apps/src/components/chat/ThreadList.tsx` (Chakra UI)
        - List threads (title, updated_at)
        - Create new, delete, rename
        - Highlight active thread; click to switch
  - [ ] Optional: search/filter
  - [ ] Optional: add a compact toggle button within `ChatInterface` header

- Navigation (optional)
  - [ ] Sync `currentThreadId` to URL query (`?thread_id=...`) with `history.pushState`
  - [ ] On init, if `thread_id` present, call `switchThread(thread_id)`

### 4) ChatInterface Enhancements

- Status alerts
  - [ ] Use Chakra `Alert` to display `error` messages from store
  - [ ] No WS states; keep simple idle/loading/error

- Planning/Task updates (optional)
  - [ ] Add light-weight components to display planning/task messages if present in the `messages` array (skip if absent)

- New chat flow
  - [ ] Add “New Chat” button → calls `createThread()` and switches

### 5) Persistence & Migration

- [ ] Write a migration that, on first run, creates a default thread and moves the current `messages` array into it
- [ ] Ensure `selectedModelId`, `selectedTools` remain compatible; persist via existing store/localStorage behavior

### 6) Testing

- Store tests
  - [ ] `createThread/switchThread/deleteThread/renameThread` update state and localStorage
  - [ ] `sendMessage` persists messages per thread
  - [ ] `stopGeneration` aborts and resets status

- UI tests
  - [ ] Thread list basic interactions
  - [ ] Stop button visible during loading and calls store action
  - [ ] “New Chat” creates and switches thread

---

## File-Level Changes Summary

- Updated
  - `apps/src/stores/ChatStore.ts` (threads state/actions, abort controller, persistence)
  - `apps/src/components/ChatInterface.tsx` (status alert, new chat button, optional planning/task display hook-up)
  - `apps/src/components/Composer.tsx` (Stop button wiring)

- New
  - `apps/src/components/chat/ThreadList.tsx` (local-only UI)

---

## Notes

- All features stay offline and local; no backend assumptions.
- The HTTP streaming endpoint in `ChatStore.chatUrl` remains the only network dependency.
