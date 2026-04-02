# Default Model Preferences & Node Integration Test Route

## Part 1: Default Model Preferences

### Overview
Users can set a default model for each model type (language, image, embedding, TTS, ASR, video). When a new node is created and its model property is empty, the default model fills in automatically. Stored in localStorage via the existing `ModelPreferencesStore`.

### Model Types
The following model types support defaults:
- `language_model`
- `image_model`
- `embedding_model`
- `tts_model`
- `asr_model`
- `video_model`

`llama_model`, `hf.*`, and `comfy.*` types are excluded — they have specialized selection UIs and are not general-purpose defaults.

### Changes

#### 1. Extend ModelPreferencesStore
**File:** `web/src/stores/ModelPreferencesStore.ts`

Add to state:
```typescript
defaults: Record<string, { provider: string; id: string; name: string }>
// keyed by model type string: "language_model", "image_model", etc.

setDefault: (modelType: string, model: { provider: string; id: string; name: string }) => void
clearDefault: (modelType: string) => void
```

Access defaults via selector: `useModelPreferencesStore((s) => s.defaults[modelType])` — no getter method needed.

**Persistence:** Add `defaults` to the existing `partialize` function (line 81) so it serializes alongside favorites/recents. No special rehydration needed (plain object).

#### 2. Shared utility: applyDefaultModels
**File:** `web/src/utils/applyDefaultModels.ts` (new)

Extract the default-model logic into a pure function so both `createNode` and the test runner can use it:

```typescript
import { useModelPreferencesStore } from "../stores/ModelPreferencesStore";

const MODEL_TYPES = new Set([
  "language_model", "image_model", "embedding_model",
  "tts_model", "asr_model", "video_model"
]);

export function applyDefaultModels(
  properties: Record<string, unknown>,
  propertyMetadata: PropertyMetadata[]
): Record<string, unknown> {
  const defaults = useModelPreferencesStore.getState().defaults;
  const result = { ...properties };

  for (const prop of propertyMetadata) {
    if (!MODEL_TYPES.has(prop.type.type)) continue;

    const current = result[prop.name];
    const isEmpty = !current
      || (typeof current === "object" && current !== null
          && (
            (current as Record<string, unknown>).provider === "empty"
            || (current as Record<string, unknown>).provider === ""
            || (current as Record<string, unknown>).id === ""
          ));

    if (isEmpty && defaults[prop.type.type]) {
      const def = defaults[prop.type.type];
      result[prop.name] = {
        type: prop.type.type,
        provider: def.provider,
        id: def.id,
        name: def.name
      };
    }
  }
  return result;
}
```

#### 3. Apply defaults in createNode
**File:** `web/src/stores/NodeStore.ts` — `createNode` function (~line 1187)

After building the `defaults` object from metadata properties, call `applyDefaultModels(defaults, metadata.properties)` to fill in empty model properties.

#### 4. New Settings Tab: Default Models
**File:** `web/src/components/menus/DefaultModelsMenu.tsx` (new)

A settings panel with one row per model type:
- Label: "Language Model", "Image Model", etc.
- Selector: reuses existing model selector components (LanguageModelSelect, ImageModelSelect, etc.)
- Clear button per row to reset to no default
- Current default shown as selected value

**Integration:** Add to `SettingsMenu.tsx` sidebar as a new section/tab called "Default Models".

### What it does NOT do
- No per-provider defaults — one default per model type globally
- No server-side storage — localStorage only
- No migration needed — starts empty, user configures as desired
- Does not override explicitly-set model properties — only fills in empty ones

---

## Part 2: Node Integration Test Route

### Overview
A dev-only route at `/node-test` showing all registered nodes in a virtualized table, grouped by namespace/module. Users can run individual nodes or entire modules as single-node workflows executed concurrently via WebSocket. Results show inline using the existing `OutputRenderer`.

### Execution Model
Each node test = a single-node workflow:
1. Build a minimal workflow graph: one node with default property values from metadata
2. Apply default models via `applyDefaultModels()` (shared utility from Part 1)
3. Send a `RunJobRequest` message directly through `globalWebSocketManager` — bypasses `WorkflowRunner` which is coupled to ReactFlow context
4. Subscribe to `NodeUpdate` messages on the workflow's routing key to collect status and output
5. Each node runs as a separate workflow — failures don't cascade

**Concurrency**: configurable input field (default 4). A queue: N workflows execute simultaneously, next starts when one completes.

**Cancel**: "Stop All" button clears the queue and sends cancel for in-flight workflows.

### Handling Nodes with Required Inputs
Many nodes require connected inputs to function. The test runner handles this pragmatically:
- All nodes are listed and runnable — no filtering
- Nodes that fail due to missing inputs show as "failed" with the error message (e.g., "input 'text' is required")
- This is informative — it tells you which nodes need wiring vs which have actual bugs
- The status filter lets you hide failures to focus on passing nodes

### Architecture

**Components:**
- `NodeTestPage.tsx` — top-level: toolbar + virtualized table
- `NodeTestRow.tsx` — memoized row: node info, run button, status badge, timing, expandable OutputRenderer
- `useNodeTestRunner.ts` — custom hook: execution queue, concurrency control, WebSocket subscriptions, result state

### Data Flow
```
MetadataStore.metadata (Record<string, NodeMetadata>)
  → group by namespace
  → flat list of { namespace-header | node-row }
  → react-window VariableSizeList
  → each row state: idle | queued | running | passed | failed
  → results: Map<nodeType, { status, output, error, duration }>
```

### Workflow Execution Detail

The `useNodeTestRunner` hook manages execution without `WorkflowRunner`:

```typescript
// Build ephemeral workflow
function buildTestWorkflow(metadata: NodeMetadata): { nodes, edges, workflowId } {
  const workflowId = `test-${metadata.node_type}-${Date.now()}`;
  const nodeId = "test-node-1";

  // Build properties with defaults
  const properties = {};
  for (const prop of metadata.properties) {
    properties[prop.name] = prop.default;
  }
  const withModels = applyDefaultModels(properties, metadata.properties);

  const nodes = [{
    id: nodeId,
    type: metadata.node_type,
    properties: withModels
  }];

  return { nodes, edges: [], workflowId };
}

// Execute via WebSocket directly
async function runNode(metadata: NodeMetadata) {
  const { nodes, edges, workflowId } = buildTestWorkflow(metadata);

  const unsubscribe = globalWebSocketManager.subscribe(
    `workflow:${workflowId}`,
    (message) => {
      if (message.type === "node_update") {
        // Update status: running → passed/failed
        // Capture output values and error
      }
      if (message.type === "job_update" && message.status === "completed") {
        unsubscribe();
      }
    }
  );

  await globalWebSocketManager.send({
    type: "run_job_request",
    workflow_id: workflowId,
    graph: { nodes, edges }
  });
}
```

### UI Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [Search________] [Concurrency: [4]] [Run All] [Stop All]   │
│ Filter: [All] [Passed] [Failed] [Pending]                  │
├──────────────────────┬────┬────────┬────────────────────────┤
│ > nodetool.text      │ >> │        │                        │
│   SplitText          │ >  │ ✓ 42ms │ ["chunk1","chunk2"]   │
│   ExtractText        │ >  │ ✓ 18ms │ "extracted"           │
│   ChunkText          │ >  │ ✗ 55ms │ Error: missing input  │
│ > nodetool.image     │ >> │        │                        │
│   TextToImage        │ >  │ ◌      │                        │
└──────────────────────┴────┴────────┴────────────────────────┘
```

Columns:
- **Node** — namespace group header or node_type + title
- **Run** — play button per node; `>>` on namespace headers runs all in module
- **Status** — idle/queued/running/pass/fail badge + duration in ms
- **Result** — compact `OutputRenderer` for output value; error message on failure; click to expand

### Key Decisions
- **Namespace headers** clickable to queue all nodes in that module
- **Row height**: fixed ~48px collapsed, variable when expanded (OutputRenderer)
- **Results persist** in component state (Map) — no server storage
- **No workflow persistence** — ephemeral workflows, never saved
- **Filter bar** — search by node type/title, filter by status
- **Stop All** — clears queue and cancels in-flight workflows
- **Route** added to dev-only routes in `web/src/index.tsx` (import `isLocalhost` from `stores/ApiClient`)

### Virtualization
Uses `react-window` `VariableSizeList` + `react-virtualized-auto-sizer`, same pattern as `web/src/components/node_menu/RenderNodes.tsx`.

Row types for the flat list:
```typescript
type FlatRow =
  | { type: "namespace"; namespace: string; nodeCount: number }
  | { type: "node"; metadata: NodeMetadata; nodeType: string }
```

### Files to Create/Modify

**New files:**
- `web/src/utils/applyDefaultModels.ts` — shared utility
- `web/src/components/menus/DefaultModelsMenu.tsx` — settings tab
- `web/src/components/node_test/NodeTestPage.tsx` — main page
- `web/src/components/node_test/NodeTestRow.tsx` — memoized row
- `web/src/components/node_test/useNodeTestRunner.ts` — execution hook

**Modified files:**
- `web/src/stores/ModelPreferencesStore.ts` — add `defaults` state + `partialize` update
- `web/src/stores/NodeStore.ts` — call `applyDefaultModels` in `createNode`
- `web/src/components/menus/SettingsMenu.tsx` — add Default Models tab
- `web/src/index.tsx` — add `/node-test` route (dev-only)
