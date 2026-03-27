# Workflow Execution Trace — Design Spec

## Goal

A bottom panel in the UI that shows a flat, chronological timeline of every event in a workflow run — node starts/completions, full LLM request/response content, tool calls, errors — with timestamps and durations. In-memory with JSON export.

## Architecture

### New Protocol Message: `LLMCallUpdate`

Add to `packages/protocol/src/messages.ts`:

```typescript
export interface LLMCallUpdate {
  type: "llm_call";
  node_id: string;
  node_name?: string;
  provider: string;
  model: string;
  messages: Array<{ role: string; content: unknown }>;  // full prompt
  response: unknown;                                     // full completion
  tool_calls?: Array<{ id: string; name: string; args: unknown }>;
  tokens_input?: number;
  tokens_output?: number;
  cost?: number;
  duration_ms: number;
  error?: string | null;
  timestamp: string;  // ISO 8601
}
```

Add `LLMCallUpdate` to the `ProcessingMessage` union type.

### Backend: Emit LLMCallUpdate from BaseProvider

In `packages/runtime/src/providers/base-provider.ts`:

**`generateMessageTraced()`** — after the LLM call completes (success or error), emit an `LLMCallUpdate` via `ProcessingContext`. The context is not currently available in BaseProvider, so:

- Add an optional `emitMessage` callback to BaseProvider (set by the ProcessingContext when the provider is created/used).
- In `generateMessageTraced()`, after the span completes, call `this.emitMessage({ type: "llm_call", ... })` with the full request messages, response content, token counts, cost, and duration.
- In `generateMessagesTraced()` (streaming), accumulate chunks into the full response, then emit the `LLMCallUpdate` after the stream completes.

The `emitMessage` callback is wired up in `ProcessingContext.getProvider()` — when it returns a provider instance, it sets `provider.emitMessage = (msg) => this.postMessage(msg)`.

### Frontend: TraceStore

New file: `web/src/stores/TraceStore.ts`

```typescript
interface TraceEvent {
  id: string;           // unique ID
  timestamp: string;    // ISO 8601
  relativeMs: number;   // ms since run started
  type: "node_start" | "node_complete" | "node_error" | "llm_call" | "tool_call" | "tool_result" | "edge_active" | "output";
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  summary: string;      // one-line summary for the list
  detail: unknown;      // full payload for expansion
}

interface TraceStore {
  events: TraceEvent[];
  runStartTime: string | null;
  isRecording: boolean;

  startRun(timestamp: string): void;
  append(event: TraceEvent): void;
  clear(): void;
  exportJSON(): string;
}
```

Max 10,000 events in memory. Oldest events dropped if exceeded.

### Frontend: Feed TraceStore from workflowUpdates

In `web/src/stores/workflowUpdates.ts`, in the `handleUpdate` function, add a branch that converts each `ProcessingMessage` into a `TraceEvent` and appends it to `TraceStore`:

- `job_update` with status "running" → `TraceStore.startRun(timestamp)`
- `node_update` with status "running" → `TraceEvent` type "node_start"
- `node_update` with status "completed" → `TraceEvent` type "node_complete"
- `node_update` with status "error" → `TraceEvent` type "node_error"
- `llm_call` → `TraceEvent` type "llm_call", summary = `"${provider}/${model} → ${tokens_output} tokens, ${duration_ms}ms, $${cost}"`
- `tool_call` → `TraceEvent` type "tool_call"
- `tool_result` → `TraceEvent` type "tool_result"
- `edge_update` with status "active" → `TraceEvent` type "edge_active"
- `output_update` → `TraceEvent` type "output"
- `job_update` with terminal status → stop recording

Other message types (log, notification, progress, chunk) are ignored — they're noise for the trace view.

### Frontend: TracePanel Component

New file: `web/src/components/panels/TracePanel.tsx`

**Layout:** Bottom panel tab alongside LogPanel. Same panel framework/chrome.

**Content:** Virtualized flat list of TraceEvents sorted by timestamp.

Each row shows:
- **Timestamp** — relative time from run start (e.g. "+0.0s", "+1.2s", "+3.4s")
- **Icon** — based on event type (play icon for node_start, check for node_complete, brain/sparkle for llm_call, wrench for tool_call, error for node_error)
- **Summary** — the one-line summary string
- Clicking a row **expands** it inline to show the full `detail` payload as formatted JSON (or structured content for LLM calls: messages, response, tool_calls)

**LLM call expanded view:**
- **Request**: collapsible list of messages (role + content)
- **Response**: the completion text
- **Tool calls**: if any, show name + args
- **Footer**: tokens (in/out), cost, duration

**Toolbar:**
- Clear button
- Export JSON button (downloads `trace-{workflowId}-{timestamp}.json`)
- Event count badge

### Wiring: ProcessingContext → Provider

In `packages/runtime/src/context.ts`, when `getProvider()` returns a provider, set a message callback:

```typescript
async getProvider(providerId: string): Promise<BaseProvider> {
  const provider = await this._providerResolver(providerId);
  provider.setMessageEmitter((msg) => this.postMessage(msg));
  return provider;
}
```

In `packages/runtime/src/providers/base-provider.ts`, add:

```typescript
private _emitMessage: ((msg: unknown) => void) | null = null;

setMessageEmitter(fn: (msg: unknown) => void): void {
  this._emitMessage = fn;
}

protected emitMessage(msg: unknown): void {
  if (this._emitMessage) this._emitMessage(msg);
}
```

## Files Changed

| File | Change |
|------|--------|
| `packages/protocol/src/messages.ts` | Add `LLMCallUpdate` interface + add to union |
| `packages/runtime/src/providers/base-provider.ts` | Add `setMessageEmitter`/`emitMessage`, emit `LLMCallUpdate` in traced methods |
| `packages/runtime/src/context.ts` | Wire `setMessageEmitter` in `getProvider()` |
| `web/src/stores/TraceStore.ts` | New store |
| `web/src/stores/workflowUpdates.ts` | Feed TraceStore from incoming messages |
| `web/src/components/panels/TracePanel.tsx` | New panel component |
| `web/src/components/panels/BottomPanel.tsx` (or equivalent) | Add TracePanel tab |

## Out of Scope

- Persistent trace storage (DB) — export covers this need
- Distributed tracing / trace propagation
- Trace diffing between runs
- Filtering/search within the trace panel (can add later)
- Token-level streaming display (we capture the final result)

## Testing

- Unit test for TraceStore (append, clear, export, max events)
- Unit test for LLMCallUpdate message creation in BaseProvider
- Integration test: run a workflow with an LLM node, verify TraceStore receives llm_call event with full content
