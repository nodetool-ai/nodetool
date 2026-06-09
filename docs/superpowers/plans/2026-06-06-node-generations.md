# Node Generations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the job-centric `results`/`outputResults` result model with a node-centric **generation timeline** — one read accessor over durable assets + a live buffer, with a user-selectable current generation that feeds downstream.

**Architecture:** A node owns an ordered `Generation[]` merged from two backings (durable workflow assets + an in-memory live buffer fed by `node_update`), source hidden behind one accessor. The `< >` pager writes a persisted `selected_generation` pointer (node data via `ui_properties`, same path as `model_id`); downstream resolution reads `selected ?? latest`. `output_update` is demoted to output-node live display; `tool_result_update` becomes an artifact.

**Tech Stack:** React 19, Zustand 4.5, TanStack Query v5, Jest + React Testing Library, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-06-06-node-generations-architecture-design.md`

---

## File Structure

**New**
- `web/src/utils/nodeGenerations.ts` — pure: `Generation` type, `outputOf`, `assetToGeneration`, `mergeGenerations`, `getCurrentGeneration`, `getCurrentOutput`.
- `web/src/utils/__tests__/nodeGenerations.test.ts`
- `web/src/hooks/nodes/useNodeGenerations.ts` — reactive hook (asset store + live buffer + node `selected`).
- `web/src/hooks/nodes/__tests__/useNodeGenerations.test.tsx`
- `web/src/stores/nodeGenerationAccessor.ts` — sync accessor over the three stores for the run path.

**Modified**
- `web/src/stores/ResultsStore.ts` — add `liveGenerations` buffer + actions.
- `web/src/stores/workflowUpdates.ts` — writers per message-roles table.
- `web/src/stores/NodeData.ts`, `web/src/stores/nodeUiDefaults.ts`, `web/src/stores/reactFlowNodeToGraphNode.ts`, `web/src/stores/graphNodeToReactFlowNode.ts` — persist `selected_generation`.
- `web/src/components/node/NodeHistoryViewer.tsx` — pager writes selection.
- `web/src/hooks/nodes/useNodeIO.ts`, `web/src/hooks/nodes/useNodeExecState.ts`, `web/src/components/node/SketchNode/SketchNode.tsx`, `web/src/hooks/nodes/useRunFromHere.ts`, `web/src/hooks/nodes/useRunSingleNode.ts`, `web/src/hooks/nodes/useRunSelectedNodes.ts` — read via accessor.

**Removed (final stage)**
- `web/src/stores/workflowResultHydration.ts`, `web/src/utils/upstreamResult.ts`, `ResultsStore.results`/`outputResults` general paths.

---

## Stage 1 — Generation model & accessor (no consumer changes)

### Task 1: Generation type + `outputOf`

**Files:**
- Create: `web/src/utils/nodeGenerations.ts`
- Test: `web/src/utils/__tests__/nodeGenerations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { outputOf, type Generation } from "../nodeGenerations";

const gen = (outputs: Record<string, unknown>): Generation => ({
  id: "g1", jobId: "j1", createdAt: 1, outputs, status: "completed"
});

describe("outputOf", () => {
  it("returns the named handle when present", () => {
    expect(outputOf(gen({ image: "A", mask: "B" }), "image")).toBe("A");
  });
  it("falls through to the sole output when the handle does not match", () => {
    // single-output node whose edge handle differs from the stored key
    expect(outputOf(gen({ output: "X" }), "image")).toBe("X");
  });
  it("returns the whole record for a handle miss on a multi-output node", () => {
    expect(outputOf(gen({ a: 1, b: 2 }), "c")).toEqual({ a: 1, b: 2 });
  });
  it("returns undefined outputs as undefined", () => {
    expect(outputOf(gen({}), "x")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/utils/__tests__/nodeGenerations.test.ts`
Expected: FAIL — `Cannot find module '../nodeGenerations'`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ProviderCost } from "../stores/ApiTypes";

export interface Generation {
  id: string;
  jobId: string | null;
  createdAt: number;
  outputs: Record<string, unknown>;
  status: "running" | "completed" | "error";
  cost?: ProviderCost;
  error?: string;
  assetId?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Resolve a generation's value for an edge's source handle. Prefers the named
 * handle; for a single-output generation whose stored key differs from the
 * edge handle, falls through to that sole value; otherwise returns the record.
 */
export const outputOf = (gen: Generation, handle?: string): unknown => {
  const o = gen.outputs;
  if (!isRecord(o)) return o;
  if (handle && handle in o) return o[handle];
  const keys = Object.keys(o);
  if (keys.length === 1) return o[keys[0]];
  if (keys.length === 0) return undefined;
  return o;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/utils/__tests__/nodeGenerations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/nodeGenerations.ts web/src/utils/__tests__/nodeGenerations.test.ts
git commit -m "feat(generations): Generation type and outputOf resolver"
```

---

### Task 2: `assetToGeneration` + `mergeGenerations`

**Files:**
- Modify: `web/src/utils/nodeGenerations.ts`
- Test: `web/src/utils/__tests__/nodeGenerations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { assetToGeneration, mergeGenerations } from "../nodeGenerations";
import type { Asset } from "../../stores/ApiTypes";

const asset = (id: string, jobId: string, createdAt: string): Asset =>
  ({ id, job_id: jobId, node_id: "n1", content_type: "image/png",
     get_url: `http://x/${id}.png`, created_at: createdAt } as unknown as Asset);

describe("assetToGeneration", () => {
  it("wraps the asset value under the output handle and carries asset id", () => {
    const g = assetToGeneration(asset("a1", "j1", "2026-01-01T00:00:00Z"));
    expect(g.assetId).toBe("a1");
    expect(g.jobId).toBe("j1");
    expect(g.status).toBe("completed");
    expect(g.outputs.output).toEqual({ type: "image", uri: "http://x/a1.png" });
  });
});

describe("mergeGenerations", () => {
  it("keeps all persisted assets and drops a live gen once its job persisted", () => {
    const persisted = [
      assetToGeneration(asset("a1", "j1", "2026-01-01T00:00:00Z")),
      assetToGeneration(asset("a2", "j1", "2026-01-01T00:00:01Z")) // batch: same job, 2 assets
    ];
    const live = [
      { id: "j1", jobId: "j1", createdAt: 10, outputs: { output: "stale" }, status: "completed" as const },
      { id: "j2", jobId: "j2", createdAt: 20, outputs: { output: "live" }, status: "running" as const }
    ];
    const merged = mergeGenerations(persisted, live);
    expect(merged.map((g) => g.id)).toEqual(["a1", "a2", "j2"]); // j1 superseded; chronological
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/utils/__tests__/nodeGenerations.test.ts`
Expected: FAIL — `assetToGeneration is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `web/src/utils/nodeGenerations.ts`:

```ts
import type { Asset } from "../stores/ApiTypes";
import { assetToOutputValue } from "../hooks/nodes/useNodeResultHistory";

export const assetToGeneration = (asset: Asset): Generation => ({
  id: asset.id,
  jobId: asset.job_id ?? null,
  createdAt: asset.created_at ? Date.parse(asset.created_at) : 0,
  outputs: { output: assetToOutputValue(asset) },
  status: "completed",
  assetId: asset.id
});

/**
 * One time-ordered list: all persisted generations plus live generations whose
 * job has not yet persisted any asset (a live gen is superseded once its assets
 * land). Sorted oldest→newest by createdAt.
 */
export const mergeGenerations = (
  persisted: Generation[],
  live: Generation[]
): Generation[] => {
  const persistedJobs = new Set(persisted.map((g) => g.jobId).filter(Boolean));
  const survivingLive = live.filter(
    (g) => !(g.jobId && persistedJobs.has(g.jobId))
  );
  return [...persisted, ...survivingLive].sort(
    (a, b) => a.createdAt - b.createdAt
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/utils/__tests__/nodeGenerations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/nodeGenerations.ts web/src/utils/__tests__/nodeGenerations.test.ts
git commit -m "feat(generations): assetToGeneration and mergeGenerations"
```

---

### Task 3: `getCurrentGeneration` + `getCurrentOutput`

**Files:**
- Modify: `web/src/utils/nodeGenerations.ts`
- Test: `web/src/utils/__tests__/nodeGenerations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { getCurrentGeneration, getCurrentOutput } from "../nodeGenerations";

const list = [
  { id: "g1", jobId: "j1", createdAt: 1, outputs: { output: "first" }, status: "completed" as const },
  { id: "g2", jobId: "j2", createdAt: 2, outputs: { output: "latest" }, status: "completed" as const }
];

describe("getCurrentGeneration", () => {
  it("defaults to the latest (last) generation", () => {
    expect(getCurrentGeneration(list)?.id).toBe("g2");
  });
  it("honors an explicit selected id", () => {
    expect(getCurrentGeneration(list, "g1")?.id).toBe("g1");
  });
  it("falls back to latest when the selected id is gone", () => {
    expect(getCurrentGeneration(list, "missing")?.id).toBe("g2");
  });
  it("returns undefined for an empty list", () => {
    expect(getCurrentGeneration([])).toBeUndefined();
  });
});

describe("getCurrentOutput", () => {
  it("returns the current generation's output for a handle", () => {
    expect(getCurrentOutput(list, "g1", "output")).toBe("first");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/utils/__tests__/nodeGenerations.test.ts`
Expected: FAIL — `getCurrentGeneration is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `web/src/utils/nodeGenerations.ts`:

```ts
export const getCurrentGeneration = (
  generations: Generation[],
  selectedId?: string
): Generation | undefined => {
  if (generations.length === 0) return undefined;
  if (selectedId) {
    const found = generations.find((g) => g.id === selectedId);
    if (found) return found;
  }
  return generations[generations.length - 1];
};

export const getCurrentOutput = (
  generations: Generation[],
  selectedId: string | undefined,
  handle?: string
): unknown => {
  const current = getCurrentGeneration(generations, selectedId);
  return current ? outputOf(current, handle) : undefined;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/utils/__tests__/nodeGenerations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/nodeGenerations.ts web/src/utils/__tests__/nodeGenerations.test.ts
git commit -m "feat(generations): current-generation selection and output resolution"
```

---

### Task 4: Live generation buffer in ResultsStore

**Files:**
- Modify: `web/src/stores/ResultsStore.ts`
- Test: `web/src/stores/__tests__/ResultsStore.generations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import useResultsStore from "../ResultsStore";

const reset = () => useResultsStore.setState({ liveGenerations: {} } as never);

describe("ResultsStore live generations", () => {
  beforeEach(reset);

  it("upserts a running generation then finalizes it by jobId", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n1", "j1", { createdAt: 1, status: "running", outputs: {} });
    s.upsertLiveGeneration("wf", "n1", "j1", { status: "completed", outputs: { output: "X" } });
    const list = useResultsStore.getState().getLiveGenerations("wf", "n1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "j1", jobId: "j1", status: "completed", outputs: { output: "X" } });
  });

  it("appends a second generation for a new job", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n1", "j1", { createdAt: 1, status: "completed", outputs: {} });
    s.upsertLiveGeneration("wf", "n1", "j2", { createdAt: 2, status: "completed", outputs: {} });
    expect(useResultsStore.getState().getLiveGenerations("wf", "n1").map((g) => g.id)).toEqual(["j1", "j2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/ResultsStore.generations.test.ts`
Expected: FAIL — `upsertLiveGeneration is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/stores/ResultsStore.ts`: import the type and add to the store type + creator.

```ts
import type { Generation } from "../utils/nodeGenerations";

// add to ResultsStore type:
liveGenerations: Record<string, Generation[]>;
upsertLiveGeneration: (
  workflowId: string, nodeId: string, jobId: string, patch: Partial<Generation>
) => void;
getLiveGenerations: (workflowId: string, nodeId: string) => Generation[];

// add to create<...>((set, get) => ({ ... }))  — initial state:
liveGenerations: {},

// actions:
upsertLiveGeneration: (workflowId, nodeId, jobId, patch) => {
  const key = `${workflowId}:${nodeId}`;
  set((state) => {
    const list = state.liveGenerations[key] ?? [];
    const idx = list.findIndex((g) => g.jobId === jobId);
    const base: Generation =
      idx >= 0
        ? list[idx]
        : { id: jobId, jobId, createdAt: patch.createdAt ?? 0, outputs: {}, status: "running" };
    const next = { ...base, ...patch, id: base.id, jobId };
    const updated = idx >= 0
      ? list.map((g, i) => (i === idx ? next : g))
      : [...list, next];
    return { liveGenerations: { ...state.liveGenerations, [key]: updated } };
  });
},
getLiveGenerations: (workflowId, nodeId) =>
  get().liveGenerations[`${workflowId}:${nodeId}`] ?? [],
```

(Use the existing `nodeKey` helper instead of the inline template if preferred — match the file's style; `nodeKey(wf, "", node)` is not suitable here since the key is `wf:node`, so a literal template is correct.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/ResultsStore.generations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/ResultsStore.ts web/src/stores/__tests__/ResultsStore.generations.test.ts
git commit -m "feat(generations): live generation buffer in ResultsStore"
```

---

### Task 5: Write live generations from `node_update`

**Files:**
- Modify: `web/src/stores/workflowUpdates.ts` (the `node_update` branch, around the existing `setResult`/`setStatus` block)
- Test: `web/src/stores/__tests__/workflowUpdates.generations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Drive the exported node_update handler with running then completed messages
// for a node and assert a single finalized live generation results.
// (Mirror the harness used by existing workflowUpdates tests in this folder.)
import useResultsStore from "../ResultsStore";
import { handleWorkflowMessage } from "../workflowUpdates"; // exported dispatch used by tests

beforeEach(() => useResultsStore.setState({ liveGenerations: {} } as never));

it("creates one finalized generation from running→completed node_update", () => {
  const wf = "wf"; const job = "j1"; const node = "n1";
  handleWorkflowMessage(wf, { type: "node_update", job_id: job, node_id: node, status: "running" } as never);
  handleWorkflowMessage(wf, { type: "node_update", job_id: job, node_id: node, status: "completed", result: { output: 7 }, provider_cost: undefined } as never);
  const list = useResultsStore.getState().getLiveGenerations(wf, node);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ jobId: job, status: "completed", outputs: { output: 7 } });
});
```

> If `workflowUpdates` does not export a single dispatch the test can call, add a thin exported `handleWorkflowMessage(workflowId, data)` wrapper around the existing internal handler (no behavior change) as the first edit, then write this test against it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/workflowUpdates.generations.test.ts`
Expected: FAIL — no generation recorded.

- [ ] **Step 3: Write minimal implementation**

In the `node_update` branch of `workflowUpdates.ts`, alongside the existing `if (jobId)` status/result handling, add (do NOT remove the existing `setResult` yet — parallel write):

```ts
if (jobId) {
  const { upsertLiveGeneration } = useResultsStore.getState();
  if (update.status === "running" || update.status === "starting" || update.status === "booting") {
    upsertLiveGeneration(workflow.id, update.node_id, jobId, {
      createdAt: Date.now(),
      status: "running"
    });
  } else if (update.status === "completed") {
    upsertLiveGeneration(workflow.id, update.node_id, jobId, {
      status: "completed",
      outputs: (update.result as Record<string, unknown>) ?? {},
      cost: update.provider_cost ?? undefined
    });
  } else if (update.status === "error") {
    upsertLiveGeneration(workflow.id, update.node_id, jobId, {
      status: "error",
      error: typeof update.error === "string" ? update.error : undefined
    });
  }
}
```

> `Date.now()` is the live createdAt; persisted generations use the asset `created_at`. Ordering across the two is by `createdAt` in `mergeGenerations`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/workflowUpdates.generations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/workflowUpdates.ts web/src/stores/__tests__/workflowUpdates.generations.test.ts
git commit -m "feat(generations): record live generations from node_update"
```

---

### Task 6: Sync accessor over the three stores

**Files:**
- Create: `web/src/stores/nodeGenerationAccessor.ts`
- Test: `web/src/stores/__tests__/nodeGenerationAccessor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { getNodeGenerations } from "../nodeGenerationAccessor";
import useResultsStore from "../ResultsStore";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
});

it("merges a persisted asset with a live generation for the node", () => {
  useWorkflowAssetStore.setState({
    assetsByWorkflow: { wf: [
      { id: "a1", node_id: "n1", job_id: "j1", content_type: "image/png",
        get_url: "http://x/a1.png", created_at: "2026-01-01T00:00:00Z" } as never
    ] }
  } as never);
  useResultsStore.getState().upsertLiveGeneration("wf", "n1", "j2", {
    createdAt: 2_000_000_000_000, status: "completed", outputs: { output: "live" }
  });
  const gens = getNodeGenerations("wf", "n1");
  expect(gens.map((g) => g.id)).toEqual(["a1", "j2"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/nodeGenerationAccessor.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
import useResultsStore from "./ResultsStore";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";
import {
  assetToGeneration, mergeGenerations, getCurrentOutput, type Generation
} from "../utils/nodeGenerations";

export const getNodeGenerations = (
  workflowId: string, nodeId: string
): Generation[] => {
  const assets = useWorkflowAssetStore
    .getState()
    .getWorkflowAssets(workflowId)
    .filter((a) => a.node_id === nodeId);
  const persisted = assets.map(assetToGeneration);
  const live = useResultsStore.getState().getLiveGenerations(workflowId, nodeId);
  return mergeGenerations(persisted, live);
};

/** Current output for a node, honoring its persisted selection. */
export const getNodeCurrentOutput = (
  workflowId: string, nodeId: string, selectedId?: string, handle?: string
): unknown =>
  getCurrentOutput(getNodeGenerations(workflowId, nodeId), selectedId, handle);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/nodeGenerationAccessor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/nodeGenerationAccessor.ts web/src/stores/__tests__/nodeGenerationAccessor.test.ts
git commit -m "feat(generations): sync accessor over assets + live buffer"
```

---

### Task 7: Reactive `useNodeGenerations` hook

**Files:**
- Create: `web/src/hooks/nodes/useNodeGenerations.ts`
- Test: `web/src/hooks/nodes/__tests__/useNodeGenerations.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from "@testing-library/react";
import { useNodeGenerations } from "../useNodeGenerations";
import useResultsStore from "../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../stores/WorkflowAssetStore";

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
});

it("returns merged generations with latest as current", () => {
  useResultsStore.getState().upsertLiveGeneration("wf", "n1", "j1", {
    createdAt: 1, status: "completed", outputs: { output: "only" }
  });
  const { result } = renderHook(() => useNodeGenerations("wf", "n1"));
  expect(result.current.generations.map((g) => g.id)).toEqual(["j1"]);
  expect(result.current.current?.id).toBe("j1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/hooks/nodes/__tests__/useNodeGenerations.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import useResultsStore from "../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../stores/WorkflowAssetStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  assetToGeneration, mergeGenerations, getCurrentGeneration, type Generation
} from "../../utils/nodeGenerations";

export const useNodeGenerations = (workflowId: string, nodeId: string) => {
  const assets = useWorkflowAssetStore(
    useShallow((s) => s.assetsByWorkflow[workflowId]?.filter((a) => a.node_id === nodeId) ?? [])
  );
  const live = useResultsStore(useShallow((s) => s.liveGenerations[`${workflowId}:${nodeId}`] ?? []));
  const selectedId = useNodes((s) => s.findNode(nodeId)?.data?.selected_generation);
  const updateNodeData = useNodes((s) => s.updateNodeData);

  const generations = useMemo<Generation[]>(
    () => mergeGenerations(assets.map(assetToGeneration), live),
    [assets, live]
  );
  const current = useMemo(
    () => getCurrentGeneration(generations, selectedId),
    [generations, selectedId]
  );
  const select = useCallback(
    (id: string) => updateNodeData(nodeId, { selected_generation: id }),
    [updateNodeData, nodeId]
  );

  return { generations, current, select };
};
```

> Depends on Task 8's `NodeData.selected_generation` field for the type to compile. Implement Task 8 first if running strictly in order, or add the field now.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/hooks/nodes/__tests__/useNodeGenerations.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/nodes/useNodeGenerations.ts web/src/hooks/nodes/__tests__/useNodeGenerations.test.tsx
git commit -m "feat(generations): reactive useNodeGenerations hook"
```

---

## Stage 2 — Selection persistence & UI

### Task 8: Persist `selected_generation` (node data ↔ ui_properties)

**Files:**
- Modify: `web/src/stores/NodeData.ts` (add field), `web/src/stores/nodeUiDefaults.ts` (add to `NodeUIProperties`), `web/src/stores/reactFlowNodeToGraphNode.ts:13-25` (write), `web/src/stores/graphNodeToReactFlowNode.ts:89-113` (read)
- Test: `web/src/stores/__tests__/selectedGenerationRoundtrip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";

it("round-trips selected_generation through ui_properties", () => {
  const rf = {
    id: "n1", type: "nodetool.image.Scale", position: { x: 0, y: 0 },
    data: { properties: {}, dynamic_properties: {}, workflow_id: "wf", selected_generation: "a1" }
  } as never;
  const graph = reactFlowNodeToGraphNode(rf);
  expect((graph.ui_properties as Record<string, unknown>).selected_generation).toBe("a1");
  const back = graphNodeToReactFlowNode(graph as never, "wf");
  expect(back.data.selected_generation).toBe("a1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/selectedGenerationRoundtrip.test.ts`
Expected: FAIL — `selected_generation` undefined after round-trip.

- [ ] **Step 3: Write minimal implementation**

`NodeData.ts` — add field:
```ts
/** Persisted id of the generation chosen to feed downstream (asset id for media). */
selected_generation?: string;
```

`nodeUiDefaults.ts` — add to `NodeUIProperties`:
```ts
selected_generation?: string;
```

`reactFlowNodeToGraphNode.ts` — in the `ui_properties` literal (follow the `model_id` line):
```ts
selected_generation: node.data.selected_generation,
```

`graphNodeToReactFlowNode.ts` — in the `data: { ... }` block (follow `model_id`):
```ts
selected_generation: ui_properties?.selected_generation,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/selectedGenerationRoundtrip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/NodeData.ts web/src/stores/nodeUiDefaults.ts web/src/stores/reactFlowNodeToGraphNode.ts web/src/stores/graphNodeToReactFlowNode.ts web/src/stores/__tests__/selectedGenerationRoundtrip.test.ts
git commit -m "feat(generations): persist selected_generation via ui_properties"
```

---

### Task 9: NodeHistoryViewer selects the current generation

**Files:**
- Modify: `web/src/components/node/NodeHistoryViewer.tsx`
- Test: `web/src/components/node/__tests__/NodeHistoryViewer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// Render with two media generations; click "Next"; assert select(id) was called
// with the second generation's id and that the rendered single value follows.
// Mock useNodeGenerations to return { generations, current, select: jest.fn() }
// and drive index via the returned current.
```

Write a test that mocks `useNodeGenerations` to return two generations and a `select` spy, renders `NodeHistoryViewer`, clicks the "Next output" button (`aria-label="Next output"`), and asserts `select` was called with the second generation's id.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/components/node/__tests__/NodeHistoryViewer.test.tsx`
Expected: FAIL — pager still uses local `useState`, `select` not called.

- [ ] **Step 3: Write minimal implementation**

Replace the local `currentIndex` state and `mediaAssets`/`assetHistory` derivation with `useNodeGenerations`:

```tsx
const { generations, current, select } = useNodeGenerations(workflowId, nodeId);
const total = generations.length;
const currentIndex = Math.max(0, generations.findIndex((g) => g.id === current?.id));

const handlePrev = useCallback(() => {
  if (total <= 1) return;
  const i = (currentIndex - 1 + total) % total;
  select(generations[i].id);
}, [total, currentIndex, generations, select]);

const handleNext = useCallback(() => {
  if (total <= 1) return;
  const i = (currentIndex + 1) % total;
  select(generations[i].id);
}, [total, currentIndex, generations, select]);

const handleSelectThumb = useCallback((i: number) => {
  select(generations[i].id);
  setMode("single");
}, [generations, select]);
```

Render `renderSingle(outputOf(current, undefined))` for the single view; keep the live-during-run branch using `liveResult` when `isRunning && liveResult != null`. Map generations (not raw assets) for the grid; for media thumbnails read `outputOf(gen)` (the `{type, uri}` value).

> Keep `AssetViewer` working: derive `mediaAssets` for the viewer from `generations` that have an `assetId`, or keep a parallel `assetHistory` read solely for the fullscreen viewer. Preserve existing viewer behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/components/node/__tests__/NodeHistoryViewer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/node/NodeHistoryViewer.tsx web/src/components/node/__tests__/NodeHistoryViewer.test.tsx
git commit -m "feat(generations): pager selects current generation"
```

---

## Stage 3 — Re-point readers onto the accessor

### Task 10: Run hooks resolve upstream via the accessor

**Files:**
- Modify: `web/src/hooks/nodes/useRunFromHere.ts`, `web/src/hooks/nodes/useRunSingleNode.ts`, `web/src/hooks/nodes/useRunSelectedNodes.ts` (replace `makeUpstreamResultGetter` with a getter backed by `getNodeCurrentOutput`)
- Test: existing `useRunFromHere.test.ts`, `useRunSingleNode.test.ts` updated; new `web/src/stores/__tests__/runGetterFromGenerations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// A getter built from generations returns the selected upstream's output.
import { getNodeCurrentOutput } from "../nodeGenerationAccessor";
import useResultsStore from "../ResultsStore";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
});

it("returns the upstream node's current output for a handle", () => {
  useResultsStore.getState().upsertLiveGeneration("wf", "up", "j1", {
    createdAt: 1, status: "completed", outputs: { output: "IMG" }
  });
  expect(getNodeCurrentOutput("wf", "up", undefined, "image")).toBe("IMG");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/runGetterFromGenerations.test.ts`
Expected: PASS for the accessor (already built in Task 6) — this test pins the contract the hooks rely on. If it fails, fix the accessor.

- [ ] **Step 3: Write minimal implementation**

In each run hook, replace `getResult: makeUpstreamResultGetter(workflow.id)` with a getter that resolves each upstream's *selected* generation. `buildRunSubgraph` calls `resolveExternalEdgeValue(edge, wf, getResult, findNode)`, which calls `getResult(wf, sourceId)` then `resolveResultValue(value, sourceHandle)`. Provide:

```ts
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { getCurrentGeneration, outputOf } from "../../utils/nodeGenerations";

const getResult = (wf: string, sourceId: string): unknown => {
  const gens = getNodeGenerations(wf, sourceId);
  const selectedId = findNode(sourceId)?.data?.selected_generation;
  const current = getCurrentGeneration(gens, selectedId);
  // Return the full outputs record; resolveExternalEdgeValue unwraps by handle.
  return current?.outputs;
};
```

> `resolveExternalEdgeValue`'s `resolveResultValue` already does `record[handle] ?? record`; passing `current.outputs` preserves handle resolution, with `outputOf` semantics covered by the existing literal-source fallback. Keep `buildRunSubgraph`'s generative-block logic unchanged (it triggers when `getResult` yields nothing for an `auto_save_asset` upstream).

- [ ] **Step 4: Run tests**

Run: `cd web && TZ=UTC npx jest src/hooks/nodes/__tests__/useRunFromHere.test.ts src/hooks/nodes/__tests__/useRunSingleNode.test.ts src/stores/__tests__/runGetterFromGenerations.test.ts`
Expected: PASS (update the run-hook test mocks to seed `liveGenerations`/asset store instead of `makeFocusedResultGetter`).

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/nodes/useRunFromHere.ts web/src/hooks/nodes/useRunSingleNode.ts web/src/hooks/nodes/useRunSelectedNodes.ts web/src/hooks/nodes/__tests__ web/src/stores/__tests__/runGetterFromGenerations.test.ts
git commit -m "feat(generations): run hooks resolve upstream via generation accessor"
```

---

### Task 11: Display hooks resolve via generations

**Files:**
- Modify: `web/src/hooks/nodes/useNodeExecState.ts` (`useNodeResultValue`, `useNodeArtifacts`), `web/src/hooks/nodes/useNodeIO.ts` (`useNodeOutput`, `useUpstreamValue`, `useUpstreamValues`)
- Test: existing `useNodeIO.test.tsx`, `useNodeExecState` tests updated

- [ ] **Step 1: Write the failing test**

Update `useNodeIO.test.tsx` so the mock backing is `useNodeGenerations` (return `{ generations, current }`) instead of the `ResultsStore`/`WorkflowRunsStore` focused-job mocks. Add a case: upstream's current generation output is returned, and switching `current` switches the resolved upstream value.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/hooks/nodes/__tests__/useNodeIO.test.tsx`
Expected: FAIL until hooks read generations.

- [ ] **Step 3: Write minimal implementation**

- `useNodeResultValue(wf, node)` → `useNodeGenerations(wf, node).current` then `outputOf(current)` (own output).
- `useNodeOutput` → `unwrapOutput` replaced by `outputOf(current)`.
- `useUpstreamValue(wf, node, input, fallback)` → find the inbound edge; read `useNodeGenerations(wf, edge.source).current`; return `outputOf(current, edge.sourceHandle)`; else literal-source fallback via `resolveExternalEdgeValue`; else `constantFallback`.
- `useUpstreamValues` → same per input name.
- `useNodeArtifacts` → `result` = `outputOf(current)`, `output` = current generation's `outputs` (or the output-node stream buffer for output nodes, wired in Task 13); keep `chunk/task/toolCall/planningUpdate` reading transient per-(node,job) signals from `ResultsStore` for the focused job (unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && TZ=UTC npx jest src/hooks/nodes/__tests__/useNodeIO.test.tsx src/hooks/nodes/__tests__/useNodeExecState*`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/nodes/useNodeIO.ts web/src/hooks/nodes/useNodeExecState.ts web/src/hooks/nodes/__tests__
git commit -m "feat(generations): display hooks resolve via generation accessor"
```

---

### Task 12: SketchNode layer inputs via generations

**Files:**
- Modify: `web/src/components/node/SketchNode/SketchNode.tsx`
- Test: existing SketchNode tests (update mocks)

- [ ] **Step 1–4:** Replace the `orderedRunJobIds` + `resolveNodeResultAcrossRuns` block with per-source `useNodeGenerations(workflow_id, connection.sourceId).current` → `outputOf(current, connection.sourceHandle)`. Update SketchNode test mocks accordingly; run `cd web && TZ=UTC npx jest src/components/node/SketchNode`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/node/SketchNode/SketchNode.tsx
git commit -m "feat(generations): SketchNode layer inputs via generation accessor"
```

---

## Stage 4 — Writer cleanup

### Task 13: `output_update` → output-node stream buffer only

**Files:**
- Modify: `web/src/stores/workflowUpdates.ts` (`output_update` branch), `web/src/components/node/OutputNode/OutputNode.tsx`
- Test: `web/src/stores/__tests__/workflowUpdates.outputStream.test.ts`

- [ ] **Step 1: Write the failing test**

Assert an `output_update` for a node writes the accumulated value into the output-stream channel (`getOutputResult` / renamed buffer) and does NOT create or modify a live generation.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && TZ=UTC npx jest src/stores/__tests__/workflowUpdates.outputStream.test.ts`
Expected: FAIL — current code may also feed value paths.

- [ ] **Step 3: Write minimal implementation**

Keep `setOutputResult(...append=true)` for `output_update` (the stream buffer, now consumed only by output nodes). Ensure it does not touch `liveGenerations`. `OutputNode.tsx` keeps reading `useNodeArtifacts(...).output` (the stream buffer) for live display and `useNodeGenerations(...).current` for the settled value.

- [ ] **Step 4: Run test to verify it passes** — `cd web && TZ=UTC npx jest src/stores/__tests__/workflowUpdates.outputStream.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/workflowUpdates.ts web/src/components/node/OutputNode/OutputNode.tsx web/src/stores/__tests__/workflowUpdates.outputStream.test.ts
git commit -m "refactor(generations): output_update feeds output-node stream only"
```

---

### Task 14: `tool_result_update` → artifact channel

**Files:**
- Modify: `web/src/stores/workflowUpdates.ts` (`tool_result_update` branch), `web/src/stores/ResultsStore.ts` (a `toolResults` artifact map next to `toolCalls`), consumer that renders agent tool results
- Test: `web/src/stores/__tests__/workflowUpdates.toolResult.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `tool_result_update` writes to the `toolResults` artifact channel and does NOT write to `outputResults`/`liveGenerations`.

- [ ] **Step 2: Run test to verify it fails** — `cd web && TZ=UTC npx jest src/stores/__tests__/workflowUpdates.toolResult.test.ts`. Expected: FAIL (currently writes to `outputResults`).

- [ ] **Step 3: Write minimal implementation**

Add `toolResults: Record<NodeKey, unknown[]>` + `appendToolResult`/`getToolResults` to `ResultsStore`. Change the `tool_result_update` branch to `appendToolResult(workflow.id, jobId, node_id, result)` instead of `setOutputResult`. Update the agent-node tool-log consumer to read `getToolResults`.

- [ ] **Step 4: Run test to verify it passes** — `cd web && TZ=UTC npx jest src/stores/__tests__/workflowUpdates.toolResult.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/workflowUpdates.ts web/src/stores/ResultsStore.ts web/src/stores/__tests__/workflowUpdates.toolResult.test.ts
git commit -m "refactor(generations): tool_result_update becomes an artifact, not a value"
```

---

## Stage 5 — Delete legacy paths

### Task 15: Remove hydration bridge

**Files:**
- Delete: `web/src/stores/workflowResultHydration.ts` and its tests
- Modify: callers (workflow-open flow) to call `useWorkflowAssetStore.loadWorkflowAssets(workflowId)` directly (if not already)
- Test: existing workflow-open tests

- [ ] **Step 1:** Grep callers: `cd web && grep -rn "hydrateWorkflowResultsFromAssets\|HYDRATED_JOB_ID\|workflowResultHydration" src | grep -v dist`.
- [ ] **Step 2:** For each caller, ensure `loadWorkflowAssets` runs on workflow open (it populates the durable backing the accessor reads). Remove the hydration import/call.
- [ ] **Step 3:** Delete `workflowResultHydration.ts` + test.
- [ ] **Step 4:** Run: `cd web && npm run typecheck && TZ=UTC npx jest src/stores`. Expected: PASS, no references remain.
- [ ] **Step 5: Commit**

```bash
git rm web/src/stores/workflowResultHydration.ts web/src/stores/__tests__/workflowResultHydration*.test.ts
git add -A
git commit -m "refactor(generations): remove asset->outputResults hydration bridge"
```

---

### Task 16: Remove `upstreamResult` and `readNodeResult`

**Files:**
- Delete: `web/src/utils/upstreamResult.ts` + `web/src/utils/__tests__/upstreamResult.test.ts`
- Modify: any remaining importers (should be none after Tasks 10–12)

- [ ] **Step 1:** `cd web && grep -rn "upstreamResult\|makeUpstreamResultGetter\|resolveNodeResultAcrossRuns\|orderedRunJobIds\|readNodeResult" src | grep -v dist` — expect only the files about to be deleted.
- [ ] **Step 2:** Delete the files. Run `cd web && npm run typecheck`. Expected: PASS.
- [ ] **Step 3:** Run `cd web && TZ=UTC npx jest src/hooks/nodes src/utils`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git rm web/src/utils/upstreamResult.ts web/src/utils/__tests__/upstreamResult.test.ts
git add -A
git commit -m "refactor(generations): drop focused-run across-runs resolver (superseded)"
```

---

### Task 17: Remove dead `results`/`outputResults` value paths

**Files:**
- Modify: `web/src/stores/ResultsStore.ts` (remove `results` map + `setResult`/`getResult`/`deleteResult`/`clearResults` if no longer used; keep `outputResults` only as the output-node stream), `web/src/stores/workflowUpdates.ts` (drop the parallel `setResult` write from Task 5)
- Test: full suite

- [ ] **Step 1:** `cd web && grep -rn "\.getResult(\|\.setResult(\|state.results\b\|\.results\[" src | grep -v dist | grep -v node_modules` — confirm no remaining value consumers (display + run now use generations). Migrate or remove each.
- [ ] **Step 2:** Remove `results` map and its actions from `ResultsStore`. Remove the parallel `setResult` call added in Task 5.
- [ ] **Step 3:** Run: `cd web && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 4:** Run: `cd web && TZ=UTC npx jest`. Expected: PASS (full suite).
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(generations): remove legacy results value bucket"
```

---

### Task 18: Final verification

- [ ] **Step 1:** `cd web && npm run typecheck`
- [ ] **Step 2:** `cd web && npm run lint`
- [ ] **Step 3:** `cd web && TZ=UTC npx jest`
- [ ] **Step 4:** Manual smoke (document results in the PR): reopen a saved media workflow → previews show; run one node → other previews persist; page `< >` to an older generation → downstream re-resolves to it; reload → the picked generation is still selected for media; run an agent node → tool results render in its log, not as its output value.
- [ ] **Step 5: Commit** any test/lint fixups.

```bash
git add -A
git commit -m "test(generations): full check green"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** single accessor (Tasks 1–7), selection persisted via ui_properties (Task 8), pager selection (Task 9), run + display re-point (Tasks 10–12), output_update→output nodes (Task 13), tool_result→artifact (Task 14), deletions (Tasks 15–17). Covered.
- **Type consistency:** `Generation`, `outputOf`, `assetToGeneration`, `mergeGenerations`, `getCurrentGeneration`, `getCurrentOutput`, `getNodeGenerations`, `getNodeCurrentOutput`, `useNodeGenerations`, `liveGenerations`, `upsertLiveGeneration`, `getLiveGenerations`, `selected_generation` used consistently throughout.
- **Risk resolved:** `selected_generation` persistence rides the same `ui_properties` round-trip already proven by `model_id`/`endpoint_id`.
- **Open verification (non-blocking):** Task 5 assumes `workflowUpdates` exposes a callable dispatch for tests; if not, add the thin `handleWorkflowMessage` wrapper first.
