# Workflow Execution Trace — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bottom panel showing a flat chronological timeline of every workflow execution event — node starts/completions, full LLM request/response content, tool calls, errors — with timestamps, durations, and JSON export.

**Architecture:** New `LLMCallUpdate` protocol message emitted by BaseProvider traced methods → WebSocket → frontend TraceStore → TracePanel (bottom panel tab alongside Terminal). In-memory with export.

**Tech Stack:** TypeScript, Zustand, React, @emotion/react, react-window (virtualized list)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/protocol/src/messages.ts` | Add `LLMCallUpdate` interface and union member |
| `packages/runtime/src/providers/base-provider.ts` | Add message emitter + emit LLMCallUpdate in traced methods |
| `packages/runtime/src/context.ts` | Wire emitter when returning providers |
| `web/src/stores/TraceStore.ts` | New Zustand store: accumulate trace events, clear, export |
| `web/src/stores/workflowUpdates.ts` | Feed TraceStore from incoming WebSocket messages |
| `web/src/stores/BottomPanelStore.ts` | Add "trace" as a panel view option |
| `web/src/components/panels/TracePanel.tsx` | New panel: virtualized event list with expand/collapse |
| `web/src/components/panels/PanelBottom.tsx` | Add trace tab alongside terminal |

---

## Task 1: Protocol — Add LLMCallUpdate message type

**Files:**
- Modify: `packages/protocol/src/messages.ts`

- [ ] **Step 1: Add LLMCallUpdate interface**

Add before the `ProcessingMessage` union (around line 350):

```typescript
export interface LLMCallUpdate {
  type: "llm_call";
  node_id: string;
  node_name?: string | null;
  provider: string;
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  response: unknown;
  tool_calls?: Array<{ id: string; name: string; args: unknown }> | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  cost?: number | null;
  duration_ms: number;
  error?: string | null;
  timestamp: string;
}
```

- [ ] **Step 2: Add to ProcessingMessage union**

Add `| LLMCallUpdate` to the union type (after `| Prediction`).

- [ ] **Step 3: Add to exports**

Add `LLMCallUpdate` to the export block at the bottom of the file.

- [ ] **Step 4: Build protocol package**

```bash
cd packages/protocol && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/messages.ts
git commit -m "feat: add LLMCallUpdate protocol message type"
```

---

## Task 2: Runtime — Add message emitter to BaseProvider

**Files:**
- Modify: `packages/runtime/src/providers/base-provider.ts`

- [ ] **Step 1: Add emitter field and methods**

Add after the `_cost` field (around line 29):

```typescript
private _emitMessage: ((msg: unknown) => void) | null = null;

setMessageEmitter(fn: (msg: unknown) => void): void {
  this._emitMessage = fn;
}

protected emitMessage(msg: unknown): void {
  if (this._emitMessage) this._emitMessage(msg);
}
```

- [ ] **Step 2: Emit LLMCallUpdate in generateMessageTraced**

Replace the `generateMessageTraced` method (lines 141-173). After the try/catch, emit the trace message. The key change: capture start time before the call, build the LLMCallUpdate after:

```typescript
async generateMessageTraced(args: Parameters<this["generateMessage"]>[0]): Promise<Message> {
  const startTime = Date.now();
  const tracer = getTracer();

  const doCall = async (): Promise<Message> => {
    if (!tracer) return this.generateMessage(args);
    return tracer.startActiveSpan(`llm.chat ${this.provider}/${args.model}`, async (span) => {
      span.setAttributes({
        "llm.provider": this.provider,
        "llm.model": args.model,
        "llm.request.message_count": args.messages.length,
        "llm.request.tools_count": args.tools?.length ?? 0,
        "llm.request.max_tokens": args.maxTokens ?? 0,
        "llm.request.stream": false,
      });
      try {
        const result = await this.generateMessage(args);
        const content = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
        span.setAttributes({
          "llm.response.role": result.role,
          "llm.response.content": content.slice(0, 2000),
          "llm.response.tool_calls_count": result.toolCalls?.length ?? 0,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  };

  let result: Message | undefined;
  let error: string | undefined;
  try {
    result = await doCall();
    return result;
  } catch (err) {
    error = String(err);
    throw err;
  } finally {
    this.emitMessage({
      type: "llm_call",
      node_id: "",
      provider: this.provider,
      model: args.model,
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      response: result?.content ?? null,
      tool_calls: result?.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args })) ?? null,
      tokens_input: null,
      tokens_output: null,
      cost: null,
      duration_ms: Date.now() - startTime,
      error: error ?? null,
      timestamp: new Date(startTime).toISOString(),
    });
  }
}
```

- [ ] **Step 3: Emit LLMCallUpdate in generateMessagesTraced**

Same pattern for the streaming method. Accumulate text chunks into `fullResponse`, then emit after stream completes:

```typescript
async *generateMessagesTraced(args: Parameters<this["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
  const startTime = Date.now();
  log.debug("LLM call", { provider: this.provider, model: args.model });
  const tracer = getTracer();

  let fullResponse = "";
  let collectedToolCalls: Array<{ id: string; name: string; args: unknown }> = [];
  let error: string | undefined;

  try {
    const source = tracer
      ? this._tracedStream(args, tracer)
      : this.generateMessages(args);

    for await (const item of source) {
      // Accumulate text content from chunks
      if ("type" in item && (item as { type: string }).type === "chunk") {
        const chunk = item as { content?: string };
        if (chunk.content) fullResponse += chunk.content;
      }
      // Collect tool calls
      if ("id" in item && "name" in item && "args" in item) {
        const tc = item as { id: string; name: string; args: unknown };
        collectedToolCalls.push({ id: tc.id, name: tc.name, args: tc.args });
      }
      yield item;
    }
    log.debug("LLM call complete", { provider: this.provider, model: args.model });
  } catch (err) {
    error = String(err);
    throw err;
  } finally {
    this.emitMessage({
      type: "llm_call",
      node_id: "",
      provider: this.provider,
      model: args.model,
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      response: fullResponse || null,
      tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
      tokens_input: null,
      tokens_output: null,
      cost: null,
      duration_ms: Date.now() - startTime,
      error: error ?? null,
      timestamp: new Date(startTime).toISOString(),
    });
  }
}

/** Internal: wrap generateMessages with OTel span */
private async *_tracedStream(
  args: Parameters<this["generateMessages"]>[0],
  tracer: ReturnType<typeof getTracer> & object,
): AsyncGenerator<ProviderStreamItem> {
  const span = tracer.startSpan(`llm.stream ${this.provider}/${args.model}`);
  span.setAttributes({
    "llm.provider": this.provider,
    "llm.model": args.model,
    "llm.request.message_count": args.messages.length,
    "llm.request.tools_count": args.tools?.length ?? 0,
    "llm.request.max_tokens": args.maxTokens ?? 0,
    "llm.request.stream": true,
  });
  let chunkCount = 0;
  try {
    for await (const item of this.generateMessages(args)) {
      chunkCount++;
      yield item;
    }
    span.setAttributes({ "llm.response.chunk_count": chunkCount });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}
```

- [ ] **Step 4: Build runtime**

```bash
cd packages/runtime && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/providers/base-provider.ts
git commit -m "feat: emit LLMCallUpdate from BaseProvider traced methods"
```

---

## Task 3: Runtime — Wire message emitter in ProcessingContext

**Files:**
- Modify: `packages/runtime/src/context.ts`

- [ ] **Step 1: Set emitter when returning providers**

In `getProvider()`, after the provider is resolved and cached, set the message emitter. Add after line 599 (`this._providers.set(providerId, resolved)`):

```typescript
resolved.setMessageEmitter((msg) => this.postMessage(msg as ProcessingMessage));
```

Do this in BOTH resolution paths:
1. After line 599 (registry path): `resolved.setMessageEmitter((msg) => this.postMessage(msg as ProcessingMessage));`
2. After line 604 (resolver path): `resolved.setMessageEmitter((msg) => this.postMessage(msg as ProcessingMessage));`

Also add the import for `ProcessingMessage` from `@nodetool/protocol` if not already present.

- [ ] **Step 2: Build runtime**

```bash
cd packages/runtime && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/context.ts
git commit -m "feat: wire LLM message emitter in ProcessingContext.getProvider()"
```

---

## Task 4: Frontend — TraceStore

**Files:**
- Create: `web/src/stores/TraceStore.ts`

- [ ] **Step 1: Create TraceStore**

```typescript
import { create } from "zustand";

export type TraceEventType =
  | "node_start"
  | "node_complete"
  | "node_error"
  | "llm_call"
  | "tool_call"
  | "tool_result"
  | "edge_active"
  | "output";

export interface TraceEvent {
  id: string;
  timestamp: string;
  relativeMs: number;
  type: TraceEventType;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  summary: string;
  detail: unknown;
}

const MAX_EVENTS = 10_000;

interface TraceStoreState {
  events: TraceEvent[];
  runStartTime: string | null;
  isRecording: boolean;
  startRun: (timestamp: string) => void;
  append: (event: TraceEvent) => void;
  clear: () => void;
  exportJSON: () => string;
}

let nextId = 0;
export function traceEventId(): string {
  return `te-${++nextId}`;
}

const useTraceStore = create<TraceStoreState>((set, get) => ({
  events: [],
  runStartTime: null,
  isRecording: false,

  startRun: (timestamp: string) =>
    set({ events: [], runStartTime: timestamp, isRecording: true }),

  append: (event: TraceEvent) =>
    set((state) => {
      if (!state.isRecording) return state;
      const events =
        state.events.length >= MAX_EVENTS
          ? [...state.events.slice(1), event]
          : [...state.events, event];
      return { events };
    }),

  clear: () => set({ events: [], runStartTime: null, isRecording: false }),

  exportJSON: () => {
    const { events, runStartTime } = get();
    return JSON.stringify({ runStartTime, events }, null, 2);
  },
}));

export default useTraceStore;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/stores/TraceStore.ts
git commit -m "feat: add TraceStore for workflow execution trace"
```

---

## Task 5: Frontend — Feed TraceStore from workflowUpdates

**Files:**
- Modify: `web/src/stores/workflowUpdates.ts`

- [ ] **Step 1: Import TraceStore**

Add at the top of the file:

```typescript
import useTraceStore, { traceEventId } from "./TraceStore";
import type { TraceEvent, TraceEventType } from "./TraceStore";
```

- [ ] **Step 2: Add trace event conversion in handleUpdate**

At the beginning of `handleUpdate` (after line 208), add:

```typescript
const traceAppend = useTraceStore.getState().append;
const traceStart = useTraceStore.getState().startRun;
const traceRunStart = useTraceStore.getState().runStartTime;

const relativeMs = (ts?: string): number => {
  if (!traceRunStart) return 0;
  const start = new Date(traceRunStart).getTime();
  const now = ts ? new Date(ts).getTime() : Date.now();
  return Math.max(0, now - start);
};

const now = new Date().toISOString();
```

- [ ] **Step 3: Add trace branching for each message type**

Add at the end of `handleUpdate`, before the closing brace:

```typescript
// --- Trace event capture ---
if (data.type === "job_update") {
  const ju = data as JobUpdate;
  if (ju.status === "running") {
    traceStart(now);
  } else if (["completed", "failed", "cancelled", "error"].includes(ju.status)) {
    useTraceStore.setState({ isRecording: false });
  }
}

if (data.type === "node_update") {
  const nu = data as NodeUpdate;
  let traceType: TraceEventType | null = null;
  let summary = "";
  if (nu.status === "running") {
    traceType = "node_start";
    summary = `${nu.node_name || nu.node_id} started`;
  } else if (nu.status === "completed") {
    traceType = "node_complete";
    summary = `${nu.node_name || nu.node_id} completed`;
  } else if (nu.status === "error" || nu.status === "failed") {
    traceType = "node_error";
    summary = `${nu.node_name || nu.node_id} error: ${nu.error || "unknown"}`;
  }
  if (traceType) {
    traceAppend({
      id: traceEventId(),
      timestamp: now,
      relativeMs: relativeMs(),
      type: traceType,
      nodeId: nu.node_id,
      nodeName: nu.node_name ?? undefined,
      nodeType: nu.node_type ?? undefined,
      summary,
      detail: nu,
    });
  }
}

if (data.type === "llm_call") {
  const lc = data as any;
  const tokens = lc.tokens_output ? `${lc.tokens_output} tokens` : "";
  const dur = lc.duration_ms ? `${lc.duration_ms}ms` : "";
  const cost = lc.cost ? `$${lc.cost.toFixed(4)}` : "";
  const parts = [tokens, dur, cost].filter(Boolean).join(", ");
  traceAppend({
    id: traceEventId(),
    timestamp: lc.timestamp || now,
    relativeMs: relativeMs(lc.timestamp),
    type: "llm_call",
    nodeId: lc.node_id ?? undefined,
    nodeName: lc.node_name ?? undefined,
    summary: `${lc.provider}/${lc.model}${parts ? ` → ${parts}` : ""}`,
    detail: lc,
  });
}

if (data.type === "tool_call") {
  const tc = data as ToolCallUpdate;
  traceAppend({
    id: traceEventId(),
    timestamp: now,
    relativeMs: relativeMs(),
    type: "tool_call",
    nodeId: tc.node_id,
    summary: `Tool call: ${tc.name}`,
    detail: tc,
  });
}

if (data.type === "tool_result") {
  const tr = data as ToolResultUpdate;
  traceAppend({
    id: traceEventId(),
    timestamp: now,
    relativeMs: relativeMs(),
    type: "tool_result",
    nodeId: tr.node_id,
    summary: `Tool result: ${tr.name}`,
    detail: tr,
  });
}

if (data.type === "output_update") {
  const ou = data as OutputUpdate;
  traceAppend({
    id: traceEventId(),
    timestamp: now,
    relativeMs: relativeMs(),
    type: "output",
    nodeId: ou.node_id,
    summary: `Output: ${ou.output_name}`,
    detail: ou,
  });
}

if (data.type === "edge_update") {
  const eu = data as EdgeUpdate;
  if (eu.status === "active") {
    traceAppend({
      id: traceEventId(),
      timestamp: now,
      relativeMs: relativeMs(),
      type: "edge_active",
      summary: `Edge active: ${eu.edge_id}`,
      detail: eu,
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/stores/workflowUpdates.ts
git commit -m "feat: feed TraceStore from workflow update messages"
```

---

## Task 6: Frontend — BottomPanelStore update

**Files:**
- Modify: `web/src/stores/BottomPanelStore.ts`

- [ ] **Step 1: Add "trace" to BottomPanelView**

Change line 4:

```typescript
export type BottomPanelView = "terminal" | "trace";
```

- [ ] **Step 2: Commit**

```bash
git add web/src/stores/BottomPanelStore.ts
git commit -m "feat: add trace view to BottomPanelStore"
```

---

## Task 7: Frontend — TracePanel component

**Files:**
- Create: `web/src/components/panels/TracePanel.tsx`

- [ ] **Step 1: Create TracePanel**

```tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState } from "react";
import { Box, IconButton, Tooltip, Typography, Chip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BuildIcon from "@mui/icons-material/Build";
import OutputIcon from "@mui/icons-material/Output";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import useTraceStore from "../../stores/TraceStore";
import type { TraceEvent, TraceEventType } from "../../stores/TraceStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const EVENT_ICONS: Record<TraceEventType, React.ReactNode> = {
  node_start: <PlayArrowIcon sx={{ fontSize: 14, color: "info.main" }} />,
  node_complete: <CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} />,
  node_error: <ErrorIcon sx={{ fontSize: 14, color: "error.main" }} />,
  llm_call: <AutoAwesomeIcon sx={{ fontSize: 14, color: "warning.main" }} />,
  tool_call: <BuildIcon sx={{ fontSize: 14, color: "secondary.main" }} />,
  tool_result: <BuildIcon sx={{ fontSize: 14, color: "secondary.light" }} />,
  edge_active: <CallSplitIcon sx={{ fontSize: 14, color: "text.disabled" }} />,
  output: <OutputIcon sx={{ fontSize: 14, color: "primary.main" }} />,
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    ".trace-toolbar": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 12px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: 36,
    },
    ".trace-list": {
      flex: 1,
      overflow: "auto",
      fontFamily: "monospace",
      fontSize: "0.8rem",
    },
    ".trace-row": {
      display: "flex",
      alignItems: "flex-start",
      padding: "3px 12px",
      gap: 8,
      borderBottom: `1px solid ${theme.vars.palette.divider}22`,
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
      },
    },
    ".trace-row.expanded": {
      backgroundColor: theme.vars.palette.action.selected,
    },
    ".trace-time": {
      color: theme.vars.palette.text.disabled,
      minWidth: 60,
      flexShrink: 0,
    },
    ".trace-icon": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      marginTop: 1,
    },
    ".trace-summary": {
      flex: 1,
      color: theme.vars.palette.text.primary,
      wordBreak: "break-word",
    },
    ".trace-detail": {
      padding: "8px 12px 8px 80px",
      backgroundColor: `${theme.vars.palette.background.paper}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}44`,
      "& pre": {
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: "0.75rem",
        maxHeight: 400,
        overflow: "auto",
        color: theme.vars.palette.text.secondary,
      },
    },
    ".llm-section": {
      marginBottom: 8,
      "& .llm-label": {
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        fontSize: "0.75rem",
        marginBottom: 2,
      },
    },
  });

function formatRelativeTime(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(1)}s`;
}

function LLMDetail({ detail }: { detail: Record<string, unknown> }) {
  return (
    <div>
      {detail.messages && (
        <div className="llm-section">
          <div className="llm-label">Request ({(detail.messages as unknown[]).length} messages)</div>
          <pre>{JSON.stringify(detail.messages, null, 2)}</pre>
        </div>
      )}
      {detail.response && (
        <div className="llm-section">
          <div className="llm-label">Response</div>
          <pre>{typeof detail.response === "string" ? detail.response : JSON.stringify(detail.response, null, 2)}</pre>
        </div>
      )}
      {detail.tool_calls && (detail.tool_calls as unknown[]).length > 0 && (
        <div className="llm-section">
          <div className="llm-label">Tool Calls</div>
          <pre>{JSON.stringify(detail.tool_calls, null, 2)}</pre>
        </div>
      )}
      <div className="llm-section">
        <div className="llm-label">
          {[
            detail.tokens_input && `In: ${detail.tokens_input}`,
            detail.tokens_output && `Out: ${detail.tokens_output}`,
            detail.cost && `Cost: $${(detail.cost as number).toFixed(4)}`,
            detail.duration_ms && `Duration: ${detail.duration_ms}ms`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {detail.error && (
        <div className="llm-section">
          <div className="llm-label" style={{ color: "var(--palette-error-main)" }}>Error</div>
          <pre>{String(detail.error)}</pre>
        </div>
      )}
    </div>
  );
}

const TraceRow = memo(function TraceRow({
  event,
  expanded,
  onToggle,
}: {
  event: TraceEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        className={`trace-row ${expanded ? "expanded" : ""}`}
        onClick={onToggle}
      >
        <span className="trace-time">{formatRelativeTime(event.relativeMs)}</span>
        <span className="trace-icon">{EVENT_ICONS[event.type]}</span>
        <span className="trace-summary">{event.summary}</span>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        )}
      </div>
      {expanded && (
        <div className="trace-detail">
          {event.type === "llm_call" ? (
            <LLMDetail detail={event.detail as Record<string, unknown>} />
          ) : (
            <pre>{JSON.stringify(event.detail, null, 2)}</pre>
          )}
        </div>
      )}
    </>
  );
});

const TracePanel: React.FC = () => {
  const theme = useTheme();
  const events = useTraceStore((s) => s.events);
  const clear = useTraceStore((s) => s.clear);
  const exportJSON = useTraceStore((s) => s.exportJSON);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportJSON]);

  return (
    <div css={styles(theme)}>
      <div className="trace-toolbar">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Trace
          </Typography>
          <Chip label={events.length} size="small" variant="outlined" />
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Export as JSON" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton size="small" onClick={handleExport} disabled={events.length === 0}>
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear trace" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton size="small" onClick={clear}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </div>
      <div className="trace-list">
        {events.length === 0 ? (
          <Typography
            variant="body2"
            sx={{ textAlign: "center", color: "text.disabled", py: 4 }}
          >
            Run a workflow to see the execution trace
          </Typography>
        ) : (
          events.map((event) => (
            <TraceRow
              key={event.id}
              event={event}
              expanded={expandedIds.has(event.id)}
              onToggle={() => handleToggle(event.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default memo(TracePanel);
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/panels/TracePanel.tsx
git commit -m "feat: add TracePanel component for execution trace"
```

---

## Task 8: Frontend — Add trace tab to PanelBottom

**Files:**
- Modify: `web/src/components/panels/PanelBottom.tsx`

- [ ] **Step 1: Import TracePanel and icons**

Add imports:

```typescript
import TracePanel from "./TracePanel";
import TimelineIcon from "@mui/icons-material/Timeline";
```

- [ ] **Step 2: Add keyboard shortcut for trace**

After the terminal shortcut (line 113):

```typescript
useCombo(["Control", "Shift", "T"], () => handlePanelToggle("trace"), false);
```

But first, `handlePanelToggle` needs to accept both views. It currently only handles "terminal". Change:

```typescript
const handleTerminalToggle = useCallback(() => {
  handlePanelToggle("terminal");
}, [handlePanelToggle]);

const handleTraceToggle = useCallback(() => {
  handlePanelToggle("trace");
}, [handlePanelToggle]);
```

- [ ] **Step 3: Add trace tab button and content**

In the panel header (after the Terminal icon/text around line 167), replace the header to support tabs:

```tsx
<div className="left">
  <Tooltip title="Terminal (Ctrl+`)" enterDelay={TOOLTIP_ENTER_DELAY}>
    <IconButton
      size="small"
      onClick={handleTerminalToggle}
      sx={{ color: activeView === "terminal" ? "primary.main" : "text.secondary" }}
    >
      <TerminalIcon fontSize="small" />
    </IconButton>
  </Tooltip>
  <Tooltip title="Trace (Ctrl+Shift+T)" enterDelay={TOOLTIP_ENTER_DELAY}>
    <IconButton
      size="small"
      onClick={handleTraceToggle}
      sx={{ color: activeView === "trace" ? "primary.main" : "text.secondary" }}
    >
      <TimelineIcon fontSize="small" />
    </IconButton>
  </Tooltip>
</div>
```

Add the trace content wrapper alongside the terminal wrapper (after line 199):

```tsx
<div
  className="trace-wrapper"
  style={{
    display: activeView === "trace" && isVisible ? "flex" : "none",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  }}
>
  <TracePanel />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/panels/PanelBottom.tsx
git commit -m "feat: add trace tab to bottom panel"
```
