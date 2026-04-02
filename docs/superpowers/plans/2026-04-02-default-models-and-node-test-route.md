# Default Model Preferences & Node Integration Test Route — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-configurable default models (per model type) that auto-fill when creating nodes, plus a dev-only `/node-test` route to run all nodes as single-node workflows with concurrent execution and inline output preview.

**Architecture:** Extend the existing `ModelPreferencesStore` with a `defaults` map persisted to localStorage. Extract a shared `applyDefaultModels()` utility used by both `NodeStore.createNode` and the test runner. The test route sends `run_job` commands directly through `globalWebSocketManager`, bypassing `WorkflowRunner`.

**Tech Stack:** React 18, Zustand, MUI, react-window, globalWebSocketManager (MsgPack WebSocket)

---

## File Structure

**New files:**
| File | Responsibility |
|------|---------------|
| `web/src/utils/applyDefaultModels.ts` | Pure function: given properties + metadata, fills empty model props from defaults |
| `web/src/components/menus/DefaultModelsMenu.tsx` | Settings tab UI for configuring default models |
| `web/src/components/node_test/NodeTestPage.tsx` | Top-level page: toolbar + virtualized table |
| `web/src/components/node_test/NodeTestRow.tsx` | Memoized row component for a single node |
| `web/src/components/node_test/useNodeTestRunner.ts` | Hook: execution queue, concurrency, WebSocket subscriptions, result state |

**Modified files:**
| File | Change |
|------|--------|
| `web/src/stores/ModelPreferencesStore.ts` | Add `defaults` map, `setDefault`, `clearDefault` + update `partialize` |
| `web/src/stores/NodeStore.ts:1192-1204` | Call `applyDefaultModels()` after building property defaults |
| `web/src/components/menus/SettingsMenu.tsx:447-470` | Add "Default Models" tab (index 5) |
| `web/src/index.tsx:406-424` | Add `/node-test` dev route |

---

## Task 1: Extend ModelPreferencesStore with defaults

**Files:**
- Modify: `web/src/stores/ModelPreferencesStore.ts`

- [ ] **Step 1: Add defaults state and actions to the store type**

Add to `ModelPreferencesState` (after line 25):
```typescript
defaults: Record<string, { provider: string; id: string; name: string }>;
setDefault: (modelType: string, model: { provider: string; id: string; name: string }) => void;
clearDefault: (modelType: string) => void;
```

- [ ] **Step 2: Initialize defaults and implement actions**

Add to the store creator (after line 40, alongside other initial state):
```typescript
defaults: {},
setDefault: (modelType, model) => {
  const prev = get().defaults;
  set({ defaults: { ...prev, [modelType]: model } });
},
clearDefault: (modelType) => {
  const { [modelType]: _, ...rest } = get().defaults;
  set({ defaults: rest });
},
```

- [ ] **Step 3: Update partialize to persist defaults**

Change `partialize` (line 81-86) to include `defaults`:
```typescript
partialize: (state) => ({
  favorites: Array.from(state.favorites),
  recents: state.recents,
  onlyAvailable: state.onlyAvailable,
  enabledProviders: state.enabledProviders,
  defaults: state.defaults
}),
```

- [ ] **Step 4: Verify the store compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to ModelPreferencesStore

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/ModelPreferencesStore.ts
git commit -m "feat: add defaults map to ModelPreferencesStore"
```

---

## Task 2: Create applyDefaultModels utility

**Files:**
- Create: `web/src/utils/applyDefaultModels.ts`

- [ ] **Step 1: Create the utility**

```typescript
import useModelPreferencesStore from "../stores/ModelPreferencesStore";

const MODEL_TYPES = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);

interface PropertyMeta {
  name: string;
  type: { type: string };
}

export function applyDefaultModels(
  properties: Record<string, unknown>,
  propertyMetadata: PropertyMeta[]
): Record<string, unknown> {
  const defaults = useModelPreferencesStore.getState().defaults;
  if (Object.keys(defaults).length === 0) return properties;

  const result = { ...properties };

  for (const prop of propertyMetadata) {
    const modelType = prop.type.type;
    if (!MODEL_TYPES.has(modelType)) continue;

    const current = result[prop.name] as
      | Record<string, unknown>
      | null
      | undefined;
    const isEmpty =
      !current ||
      current.provider === "empty" ||
      current.provider === "" ||
      current.id === "";

    const userDefault = defaults[modelType];
    if (isEmpty && userDefault) {
      result[prop.name] = {
        type: modelType,
        provider: userDefault.provider,
        id: userDefault.id,
        name: userDefault.name
      };
    }
  }

  return result;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/utils/applyDefaultModels.ts
git commit -m "feat: add applyDefaultModels utility"
```

---

## Task 3: Integrate applyDefaultModels into NodeStore.createNode

**Files:**
- Modify: `web/src/stores/NodeStore.ts:1192-1204`

- [ ] **Step 1: Add import**

Add at the top of NodeStore.ts with other imports:
```typescript
import { applyDefaultModels } from "../utils/applyDefaultModels";
```

- [ ] **Step 2: Apply defaults after building properties**

After line 1203 (after the `if (properties)` block that overrides defaults), add:
```typescript
// Apply user's default models for empty model properties
const withModelDefaults = applyDefaultModels(defaults, metadata.properties);
Object.assign(defaults, withModelDefaults);
```

This goes right before line 1206 (`// Generate default name for input nodes`).

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/stores/NodeStore.ts
git commit -m "feat: apply default models when creating nodes"
```

---

## Task 4: Create DefaultModelsMenu settings tab

**Files:**
- Create: `web/src/components/menus/DefaultModelsMenu.tsx`
- Modify: `web/src/components/menus/SettingsMenu.tsx`

- [ ] **Step 1: Create DefaultModelsMenu component**

```typescript
import React, { useCallback } from "react";
import { Typography, Button, Box } from "@mui/material";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
import EmbeddingModelSelect from "../properties/EmbeddingModelSelect";
import TTSModelSelect from "../properties/TTSModelSelect";
import ASRModelSelect from "../properties/ASRModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";

const MODEL_TYPE_CONFIG = [
  { type: "language_model", label: "Language Model", Select: LanguageModelSelect },
  { type: "image_model", label: "Image Model", Select: ImageModelSelect },
  { type: "embedding_model", label: "Embedding Model", Select: EmbeddingModelSelect },
  { type: "tts_model", label: "Text-to-Speech Model", Select: TTSModelSelect },
  { type: "asr_model", label: "Speech Recognition Model", Select: ASRModelSelect },
  { type: "video_model", label: "Video Model", Select: VideoModelSelect }
] as const;

function DefaultModelsMenu() {
  const defaults = useModelPreferencesStore((s) => s.defaults);
  const setDefault = useModelPreferencesStore((s) => s.setDefault);
  const clearDefault = useModelPreferencesStore((s) => s.clearDefault);

  return (
    <div>
      <Typography variant="h3" style={{ margin: 0 }}>
        Default Models
      </Typography>
      <Typography className="description" sx={{ mb: 2 }}>
        Set default models for each type. These will auto-fill when you create
        new nodes.
      </Typography>

      {MODEL_TYPE_CONFIG.map(({ type, label, Select }) => (
        <DefaultModelRow
          key={type}
          modelType={type}
          label={label}
          Select={Select}
          current={defaults[type]}
          onSelect={setDefault}
          onClear={clearDefault}
        />
      ))}
    </div>
  );
}

interface DefaultModelRowProps {
  modelType: string;
  label: string;
  Select: React.ComponentType<{
    onChange: (value: unknown) => void;
    value: string;
  }>;
  current?: { provider: string; id: string; name: string };
  onSelect: (modelType: string, model: { provider: string; id: string; name: string }) => void;
  onClear: (modelType: string) => void;
}

function DefaultModelRow({
  modelType,
  label,
  Select,
  current,
  onSelect,
  onClear
}: DefaultModelRowProps) {
  const handleChange = useCallback(
    (value: unknown) => {
      const v = value as { provider?: string; id?: string; name?: string };
      if (v?.id) {
        onSelect(modelType, {
          provider: v.provider || "",
          id: v.id,
          name: v.name || ""
        });
      }
    },
    [modelType, onSelect]
  );

  const handleClear = useCallback(() => {
    onClear(modelType);
  }, [modelType, onClear]);

  return (
    <div className="settings-section" id={`default-model-${modelType}`}>
      <Typography variant="h4">{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
        <Select onChange={handleChange} value={current?.id || ""} />
        {current && (
          <Button size="small" onClick={handleClear}>
            Clear
          </Button>
        )}
      </Box>
      {current && (
        <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.7 }}>
          {current.provider} / {current.name || current.id}
        </Typography>
      )}
    </div>
  );
}

export default React.memo(DefaultModelsMenu);
```

- [ ] **Step 2: Add tab to SettingsMenu**

In `web/src/components/menus/SettingsMenu.tsx`:

Add import (after line 34):
```typescript
import DefaultModelsMenu from "./DefaultModelsMenu";
```

Add tab at line 451 (after the "About" tab):
```typescript
<Tab label="Default Models" id="settings-tab-5" />
```

Add sidebar section mapping — update the ternary chain (lines 460-470) to include index 5:
```typescript
: settingsTab === 5
  ? [{ category: "Default Models", items: [
      { id: "default-model-language_model", label: "Language Model" },
      { id: "default-model-image_model", label: "Image Model" },
      { id: "default-model-embedding_model", label: "Embedding Model" },
      { id: "default-model-tts_model", label: "Text-to-Speech" },
      { id: "default-model-asr_model", label: "Speech Recognition" },
      { id: "default-model-video_model", label: "Video" }
    ]}]
```

Add TabPanel (after line 999):
```typescript
<TabPanel value={settingsTab} index={5}>
  <DefaultModelsMenu />
</TabPanel>
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/menus/DefaultModelsMenu.tsx web/src/components/menus/SettingsMenu.tsx
git commit -m "feat: add Default Models settings tab"
```

---

## Task 5: Create useNodeTestRunner hook

**Files:**
- Create: `web/src/components/node_test/useNodeTestRunner.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useCallback, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { applyDefaultModels } from "../../utils/applyDefaultModels";
import { uuidv4 } from "../../stores/uuidv4";
import { BASE_URL } from "../../stores/BASE_URL";
import { isLocalhost } from "../../stores/ApiClient";
import { supabase } from "../../lib/supabaseClient";

export type NodeTestStatus = "idle" | "queued" | "running" | "passed" | "failed";

export interface NodeTestResult {
  status: NodeTestStatus;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export function useNodeTestRunner() {
  const [results, setResults] = useState<Map<string, NodeTestResult>>(new Map());
  const [concurrency, setConcurrency] = useState(4);
  const queueRef = useRef<NodeMetadata[]>([]);
  const activeRef = useRef(0);
  const cancelledRef = useRef(false);
  const unsubscribesRef = useRef<Map<string, () => void>>(new Map());

  const updateResult = useCallback(
    (nodeType: string, update: Partial<NodeTestResult>) => {
      setResults((prev) => {
        const next = new Map(prev);
        const existing = next.get(nodeType) || { status: "idle" as const };
        next.set(nodeType, { ...existing, ...update });
        return next;
      });
    },
    []
  );

  const processQueue = useCallback(async () => {
    while (
      queueRef.current.length > 0 &&
      activeRef.current < concurrency &&
      !cancelledRef.current
    ) {
      const metadata = queueRef.current.shift();
      if (!metadata) break;

      activeRef.current++;
      runSingleNode(metadata).finally(() => {
        activeRef.current--;
        processQueue();
      });
    }
  }, [concurrency]);

  const runSingleNode = useCallback(
    async (metadata: NodeMetadata) => {
      const nodeType = metadata.node_type;
      const jobId = uuidv4();
      const workflowId = `test-${nodeType}-${Date.now()}`;
      const nodeId = "test-node-1";
      const startTime = performance.now();

      updateResult(nodeType, { status: "running", output: undefined, error: undefined });

      // Build properties with defaults
      const properties: Record<string, unknown> = {};
      for (const prop of metadata.properties) {
        if (prop.name) {
          properties[prop.name] = prop.default;
        }
      }
      const withModels = applyDefaultModels(properties, metadata.properties);

      // Build graph node (matches protocol GraphNode shape)
      const graphNode = {
        id: nodeId,
        type: metadata.node_type,
        data: withModels,
        ui_properties: { position: { x: 0, y: 0 }, width: 200 }
      };

      // Auth
      let authToken = "local_token";
      let userId = "1";
      if (!isLocalhost) {
        const { data: { session } } = await supabase.auth.getSession();
        authToken = session?.access_token || "";
        userId = session?.user?.id || "";
      }

      // Subscribe to messages
      const unsub = globalWebSocketManager.subscribe(
        workflowId,
        (message: Record<string, unknown>) => {
          const type = message.type as string;

          if (type === "node_update") {
            const status = message.status as string;
            if (status === "completed") {
              const durationMs = Math.round(performance.now() - startTime);
              const result = message.result as Record<string, unknown> | undefined;
              updateResult(nodeType, {
                status: "passed",
                output: result,
                durationMs
              });
            } else if (status === "error") {
              const durationMs = Math.round(performance.now() - startTime);
              updateResult(nodeType, {
                status: "failed",
                error: (message.error as string) || "Unknown error",
                durationMs
              });
            }
          }

          if (type === "job_update") {
            const status = message.status as string;
            if (status === "failed") {
              const durationMs = Math.round(performance.now() - startTime);
              updateResult(nodeType, {
                status: "failed",
                error: (message.error as string) || "Job failed",
                durationMs
              });
              unsub();
              unsubscribesRef.current.delete(nodeType);
            }
            if (status === "completed" || status === "cancelled") {
              unsub();
              unsubscribesRef.current.delete(nodeType);
            }
          }
        }
      );

      unsubscribesRef.current.set(nodeType, unsub);

      // Send run_job command
      try {
        await globalWebSocketManager.send({
          type: "run_job",
          command: "run_job",
          data: {
            type: "run_job_request",
            job_id: jobId,
            job_type: "workflow",
            execution_strategy: "threaded",
            workflow_id: workflowId,
            user_id: userId,
            auth_token: authToken,
            api_url: BASE_URL,
            params: {},
            explicit_types: false,
            graph: {
              nodes: [graphNode],
              edges: []
            }
          }
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        updateResult(nodeType, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          durationMs
        });
        unsub();
        unsubscribesRef.current.delete(nodeType);
      }
    },
    [updateResult]
  );

  const runNodes = useCallback(
    (metadataList: NodeMetadata[]) => {
      cancelledRef.current = false;
      for (const m of metadataList) {
        updateResult(m.node_type, { status: "queued" });
      }
      queueRef.current.push(...metadataList);
      processQueue();
    },
    [updateResult, processQueue]
  );

  const stopAll = useCallback(() => {
    cancelledRef.current = true;
    queueRef.current = [];
    // Clean up subscriptions
    for (const [nodeType, unsub] of unsubscribesRef.current) {
      unsub();
      updateResult(nodeType, { status: "idle" });
    }
    unsubscribesRef.current.clear();
  }, [updateResult]);

  const clearResults = useCallback(() => {
    setResults(new Map());
  }, []);

  return {
    results,
    concurrency,
    setConcurrency,
    runNodes,
    stopAll,
    clearResults
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/node_test/useNodeTestRunner.ts
git commit -m "feat: add useNodeTestRunner hook for concurrent node execution"
```

---

## Task 6: Create NodeTestRow component

**Files:**
- Create: `web/src/components/node_test/NodeTestRow.tsx`

- [ ] **Step 1: Create the row component**

```typescript
import React, { memo, useCallback, useState } from "react";
import { IconButton, Typography, Chip, Box, Collapse } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeTestResult } from "./useNodeTestRunner";
import OutputRenderer from "../node/OutputRenderer";

const STATUS_COLORS: Record<string, "default" | "info" | "success" | "error" | "warning"> = {
  idle: "default",
  queued: "info",
  running: "warning",
  passed: "success",
  failed: "error"
};

interface NodeTestRowProps {
  metadata: NodeMetadata;
  result: NodeTestResult | undefined;
  onRun: (metadata: NodeMetadata) => void;
  style: React.CSSProperties;
}

function NodeTestRowInner({ metadata, result, onRun, style }: NodeTestRowProps) {
  const [expanded, setExpanded] = useState(false);
  const status = result?.status || "idle";

  const handleRun = useCallback(() => {
    onRun(metadata);
  }, [metadata, onRun]);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div style={{ ...style, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: 48,
          px: 1,
          gap: 1,
          cursor: result?.output || result?.error ? "pointer" : "default",
          "&:hover": { bgcolor: "action.hover" }
        }}
        onClick={toggleExpand}
      >
        {/* Run button */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleRun();
          }}
          disabled={status === "running" || status === "queued"}
          sx={{ width: 32, height: 32 }}
        >
          <PlayArrowIcon fontSize="small" />
        </IconButton>

        {/* Node type */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {metadata.node_type}
        </Typography>

        {/* Title */}
        <Typography
          variant="body2"
          sx={{
            width: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.7
          }}
        >
          {metadata.title}
        </Typography>

        {/* Status chip */}
        <Chip
          label={
            status === "idle"
              ? "—"
              : result?.durationMs
                ? `${status} ${result.durationMs}ms`
                : status
          }
          color={STATUS_COLORS[status]}
          size="small"
          sx={{ width: 120, justifyContent: "center" }}
        />

        {/* Compact result preview */}
        <Typography
          variant="body2"
          sx={{
            width: 300,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.6,
            fontFamily: "monospace",
            fontSize: "0.75rem"
          }}
        >
          {result?.error
            ? result.error
            : result?.output
              ? JSON.stringify(result.output).slice(0, 100)
              : ""}
        </Typography>
      </Box>

      {/* Expanded output */}
      {expanded && (result?.output || result?.error) && (
        <Collapse in={expanded}>
          <Box sx={{ px: 2, py: 1, maxHeight: 400, overflow: "auto" }}>
            {result?.error ? (
              <Typography color="error" sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                {result.error}
              </Typography>
            ) : (
              <OutputRenderer value={result?.output} showTextActions={false} />
            )}
          </Box>
        </Collapse>
      )}
    </div>
  );
}

export const NodeTestRow = memo(NodeTestRowInner);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/node_test/NodeTestRow.tsx
git commit -m "feat: add NodeTestRow component with inline output preview"
```

---

## Task 7: Create NodeTestPage

**Files:**
- Create: `web/src/components/node_test/NodeTestPage.tsx`

- [ ] **Step 1: Create the page component**

```typescript
import React, { useMemo, useCallback, useRef, useState } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Chip,
  ToggleButtonGroup,
  ToggleButton
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as VirtualList, ListChildComponentProps } from "react-window";
import { useMetadataStore } from "../../stores/MetadataStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodeTestRunner, NodeTestResult, NodeTestStatus } from "./useNodeTestRunner";
import { NodeTestRow } from "./NodeTestRow";

type FlatRow =
  | { type: "namespace"; namespace: string; nodeCount: number }
  | { type: "node"; metadata: NodeMetadata; nodeType: string };

const NAMESPACE_ROW_HEIGHT = 36;
const NODE_ROW_HEIGHT = 48;

type StatusFilter = "all" | "passed" | "failed" | "idle";

function NodeTestPage() {
  const metadata = useMetadataStore((s) => s.metadata);
  const {
    results,
    concurrency,
    setConcurrency,
    runNodes,
    stopAll,
    clearResults
  } = useNodeTestRunner();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const listRef = useRef<VirtualList>(null);

  // Group by namespace, filter, flatten
  const flatRows = useMemo(() => {
    const allNodes = Object.values(metadata);
    const filtered = allNodes.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !m.node_type.toLowerCase().includes(q) &&
          !m.title.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter !== "all") {
        const r = results.get(m.node_type);
        const status = r?.status || "idle";
        if (statusFilter === "passed" && status !== "passed") return false;
        if (statusFilter === "failed" && status !== "failed") return false;
        if (statusFilter === "idle" && status !== "idle") return false;
      }
      return true;
    });

    // Group by namespace
    const groups = new Map<string, NodeMetadata[]>();
    for (const m of filtered) {
      const ns = m.namespace || "other";
      if (!groups.has(ns)) groups.set(ns, []);
      groups.get(ns)!.push(m);
    }

    const rows: FlatRow[] = [];
    const sortedNamespaces = Array.from(groups.keys()).sort();
    for (const ns of sortedNamespaces) {
      const nodes = groups.get(ns)!;
      rows.push({ type: "namespace", namespace: ns, nodeCount: nodes.length });
      for (const m of nodes.sort((a, b) => a.node_type.localeCompare(b.node_type))) {
        rows.push({ type: "node", metadata: m, nodeType: m.node_type });
      }
    }
    return rows;
  }, [metadata, search, statusFilter, results]);

  // Collect all node metadata for "Run All" / "Run Module"
  const allNodeMetadata = useMemo(
    () => flatRows.filter((r): r is Extract<FlatRow, { type: "node" }> => r.type === "node").map((r) => r.metadata),
    [flatRows]
  );

  const handleRunAll = useCallback(() => {
    runNodes(allNodeMetadata);
  }, [runNodes, allNodeMetadata]);

  const handleRunNamespace = useCallback(
    (namespace: string) => {
      const nodes = allNodeMetadata.filter((m) => m.namespace === namespace);
      runNodes(nodes);
    },
    [runNodes, allNodeMetadata]
  );

  const handleRunSingle = useCallback(
    (metadata: NodeMetadata) => {
      runNodes([metadata]);
    },
    [runNodes]
  );

  // Stats
  const stats = useMemo(() => {
    let passed = 0, failed = 0, running = 0, queued = 0;
    for (const [, r] of results) {
      if (r.status === "passed") passed++;
      if (r.status === "failed") failed++;
      if (r.status === "running") running++;
      if (r.status === "queued") queued++;
    }
    return { passed, failed, running, queued, total: allNodeMetadata.length };
  }, [results, allNodeMetadata]);

  const renderRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = flatRows[index];
      if (row.type === "namespace") {
        return (
          <Box
            key={row.namespace}
            style={style}
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1,
              gap: 1,
              bgcolor: "background.paper",
              borderBottom: "1px solid",
              borderColor: "divider"
            }}
          >
            <IconButton
              size="small"
              onClick={() => handleRunNamespace(row.namespace)}
              title={`Run all ${row.nodeCount} nodes in ${row.namespace}`}
            >
              <PlayArrowIcon fontSize="small" />
            </IconButton>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {row.namespace}
            </Typography>
            <Chip label={row.nodeCount} size="small" />
          </Box>
        );
      }

      return (
        <NodeTestRow
          key={row.nodeType}
          metadata={row.metadata}
          result={results.get(row.nodeType)}
          onRun={handleRunSingle}
          style={style}
        />
      );
    },
    [flatRows, results, handleRunSingle, handleRunNamespace]
  );

  const getItemSize = useCallback(
    (index: number) => {
      return flatRows[index].type === "namespace" ? NAMESPACE_ROW_HEIGHT : NODE_ROW_HEIGHT;
    },
    [flatRows]
  );

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexWrap: "wrap"
        }}
      >
        <Typography variant="h5">Node Integration Tests</Typography>

        <TextField
          size="small"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 250 }}
        />

        <TextField
          size="small"
          type="number"
          label="Concurrency"
          value={concurrency}
          onChange={(e) => setConcurrency(Math.max(1, Number(e.target.value) || 1))}
          sx={{ width: 100 }}
          inputProps={{ min: 1, max: 50 }}
        />

        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleRunAll}
          size="small"
        >
          Run All ({stats.total})
        </Button>

        <Button
          variant="outlined"
          startIcon={<StopIcon />}
          onClick={stopAll}
          size="small"
          color="warning"
        >
          Stop All
        </Button>

        <Button size="small" onClick={clearResults}>
          Clear
        </Button>

        <ToggleButtonGroup
          size="small"
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="passed">Passed ({stats.passed})</ToggleButton>
          <ToggleButton value="failed">Failed ({stats.failed})</ToggleButton>
          <ToggleButton value="idle">Pending</ToggleButton>
        </ToggleButtonGroup>

        {stats.running > 0 && (
          <Chip label={`Running: ${stats.running}`} color="warning" size="small" />
        )}
        {stats.queued > 0 && (
          <Chip label={`Queued: ${stats.queued}`} color="info" size="small" />
        )}
      </Box>

      {/* Virtualized list */}
      <Box sx={{ flex: 1 }}>
        <AutoSizer>
          {({ height, width }) => (
            <VirtualList
              ref={listRef}
              height={height}
              width={width}
              itemCount={flatRows.length}
              itemSize={getItemSize}
            >
              {renderRow}
            </VirtualList>
          )}
        </AutoSizer>
      </Box>
    </Box>
  );
}

export default NodeTestPage;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/node_test/NodeTestPage.tsx
git commit -m "feat: add NodeTestPage with virtualized node list and concurrent execution"
```

---

## Task 8: Register the /node-test route

**Files:**
- Modify: `web/src/index.tsx`

- [ ] **Step 1: Add lazy import**

Add near other lazy imports at the top of the file:
```typescript
const NodeTestPage = React.lazy(() => import("./components/node_test/NodeTestPage"));
```

- [ ] **Step 2: Add route in the isLocalhost block**

Add inside the `if (isLocalhost)` block (after line 423):
```typescript
routes.push({
  path: "/node-test",
  element: (
    <React.Suspense fallback={<div>Loading...</div>}>
      <NodeTestPage />
    </React.Suspense>
  )
});
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

1. Run `make dev` (or `cd web && npm start`)
2. Navigate to `http://localhost:3000/node-test`
3. Verify: node list renders, grouped by namespace
4. Click a simple node's play button (e.g., `nodetool.constant.Integer`)
5. Verify: status changes to running → passed with output shown
6. Click a namespace header play button → all nodes in that module queue up
7. Test "Stop All" clears the queue
8. Test search filtering
9. Open Settings → "Default Models" tab → set a language model default
10. Verify creating a new language model node in the editor uses that default

- [ ] **Step 5: Commit**

```bash
git add web/src/index.tsx
git commit -m "feat: add /node-test dev-only route"
```
