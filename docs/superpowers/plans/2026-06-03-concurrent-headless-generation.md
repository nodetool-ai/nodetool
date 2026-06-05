# Concurrent Headless Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let multiple sketch layers / timeline clips that share one workflow template generate **concurrently**, correctly (each resolves its own result), without changing the editor canvas's single-run model.

**Architecture:** Relax the backend's per-workflow serialization behind an opt-in `concurrent` flag on the run request (the editor canvas does not set it, so it stays serialized until Plan 2). The sketch/timeline job handlers stop reading the shared `workflowId:nodeId` result store and instead resolve each job's output asset from *that job's own* `output_update` messages, so concurrent same-workflow jobs can't clobber each other.

**Tech Stack:** TypeScript, Zustand, Fastify/WebSocket runner (`packages/websocket`), Vitest (packages), Jest (web).

**Prerequisite (already landed):** `WorkflowRunner.run()` returns the id of the run it initiated; the generation hooks use it. Commit `1f59391b9`.

---

## File structure

- `packages/websocket/src/job-queue.ts` — add an optional `concurrent` flag to the queued-job shape so `drainQueue` can tell concurrent runs apart.
- `packages/websocket/src/unified-websocket-runner.ts` — `RunJobRequest.concurrent`; skip the per-workflow gate for concurrent runs in `runJob` and `drainQueue`.
- `web/src/stores/WorkflowRunner.ts` — thread a `concurrent` arg through `run()` → `buildRunJobData` → the `run_job` payload.
- `web/src/stores/outputAssetId.ts` *(new)* — pure `extractAssetId(value)` helper shared by both generation stores.
- `web/src/stores/sketch/SketchGenerationStore.ts`, `web/src/stores/timeline/TimelineGenerationStore.ts` — `resolveOutputAssetId` delegates to `extractAssetId`.
- `web/src/hooks/sketch/useGenerateLayer.ts` — per-job output/error capture; resolve from the job's own output; opt into `concurrent`; conditional runner-store reset; test seams.
- `web/src/hooks/timeline/useGenerateClip.ts` — per-job output capture; resolve from the job's own output; opt into `concurrent`.

---

### Task 1: `concurrent` flag on the job-queue shape

**Files:**
- Modify: `packages/websocket/src/job-queue.ts`
- Test: `packages/websocket/tests/job-queue.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/websocket/tests/job-queue.test.ts` (create the file if it does not exist; if it exists, append the `it` inside the existing top-level `describe`):

```ts
import { describe, it, expect } from "vitest";
import { JobConcurrencyQueue } from "../src/job-queue.js";

describe("JobConcurrencyQueue concurrent flag", () => {
  it("surfaces the concurrent flag in positions()", () => {
    const q = new JobConcurrencyQueue();
    q.enqueue({ job_id: "a", workflow_id: "wf", concurrent: true });
    q.enqueue({ job_id: "b", workflow_id: "wf" });
    const pos = q.positions();
    expect(pos.find((p) => p.jobId === "a")?.concurrent).toBe(true);
    expect(pos.find((p) => p.jobId === "b")?.concurrent).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/websocket -- job-queue`
Expected: FAIL — `concurrent` is not a known property / `positions()` does not return it.

- [ ] **Step 3: Implement**

In `packages/websocket/src/job-queue.ts`, extend the minimal shapes and the mapping:

```ts
/** Minimal shape the queue needs from a queued run request. */
export interface QueueableJob {
  job_id?: string | null;
  workflow_id?: string | null;
  /** When true, the run may start even if its workflow already has a run in flight. */
  concurrent?: boolean;
}

export interface QueuedPosition {
  jobId: string;
  workflowId: string | null;
  /** 1-based position in the pending queue (1 = starts next). */
  position: number;
  concurrent: boolean;
}
```

And in `positions()`:

```ts
  positions(): QueuedPosition[] {
    return this.pending.map((req, index) => ({
      jobId: req.job_id ?? "",
      workflowId: req.workflow_id ?? null,
      position: index + 1,
      concurrent: req.concurrent ?? false
    }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/websocket -- job-queue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/websocket/src/job-queue.ts packages/websocket/tests/job-queue.test.ts
git commit -m "feat(websocket): carry concurrent flag through the job queue"
```

---

### Task 2: `runJob` / `drainQueue` honor `concurrent`

**Files:**
- Modify: `packages/websocket/src/unified-websocket-runner.ts` (`RunJobRequest` ~604-618; `runJob` ~1235-1250; `drainQueue` candidate filter ~1299-1308)
- Test: `packages/websocket/tests/unified-websocket-runner.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("UnifiedWebSocketRunner", …)` in `packages/websocket/tests/unified-websocket-runner.test.ts`:

```ts
it("queues a second same-workflow run when not opted into concurrency", async () => {
  await initTestDb();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const r = new UnifiedWebSocketRunner({
    resolveExecutor: () => ({ async process() { await gate; return {}; } })
  });
  await r.connect(ws);
  const graph = { nodes: [{ id: "n1", type: "nodetool.constant.String", name: "nodetool.constant.String", properties: { value: "x" } }], edges: [] };

  await r.runJob({ job_id: "A", workflow_id: "wf", graph });
  await r.runJob({ job_id: "B", workflow_id: "wf", graph });
  await new Promise((res) => setTimeout(res, 20));

  const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
  expect(sent.some((m) => m.type === "job_update" && m.job_id === "B" && m.status === "queued")).toBe(true);
  expect(sent.some((m) => m.type === "job_update" && m.job_id === "B" && m.status === "running")).toBe(false);
  release();
  await new Promise((res) => setTimeout(res, 20));
  await r.disconnect();
});

it("runs a second same-workflow run concurrently when opted in", async () => {
  await initTestDb();
  let release!: () => void;
  const gate = new Promise<void>((r2) => { release = r2; });
  const r = new UnifiedWebSocketRunner({
    resolveExecutor: () => ({ async process() { await gate; return {}; } })
  });
  await r.connect(ws);
  const graph = { nodes: [{ id: "n1", type: "nodetool.constant.String", name: "nodetool.constant.String", properties: { value: "x" } }], edges: [] };

  await r.runJob({ job_id: "A", workflow_id: "wf", graph, concurrent: true });
  await r.runJob({ job_id: "B", workflow_id: "wf", graph, concurrent: true });
  await new Promise((res) => setTimeout(res, 20));

  const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
  expect(sent.some((m) => m.type === "job_update" && m.job_id === "B" && m.status === "running")).toBe(true);
  expect(sent.some((m) => m.type === "job_update" && m.job_id === "B" && m.status === "queued")).toBe(false);
  release();
  await new Promise((res) => setTimeout(res, 20));
  await r.disconnect();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test --workspace=packages/websocket -- unified-websocket-runner`
Expected: the "concurrently when opted in" test FAILS (B is queued because the gate ignores `concurrent`); the "not opted in" test passes (current behavior).

- [ ] **Step 3: Implement**

In `RunJobRequest` (around line 604), add:

```ts
export interface RunJobRequest {
  job_id?: string;
  workflow_id?: string;
  /** Allow this run to start even if its workflow already has a run in flight. */
  concurrent?: boolean;
  user_id?: string;
  // …existing fields unchanged…
}
```

In `runJob` (around line 1241), gate the per-workflow check on `!req.concurrent`:

```ts
  async runJob(req: RunJobRequest): Promise<void> {
    const max = await this.getMaxConcurrentJobs();
    if (
      this.inFlightJobCount >= max ||
      (!req.concurrent && this.hasActiveJobForWorkflow(req.workflow_id))
    ) {
      await this.enqueueJob(req);
      return;
    }
    this.startingJobs++;
    await this.startJob(req);
  }
```

In `drainQueue` (the candidate selection, around line 1300), let concurrent runs skip the per-workflow guard:

```ts
        const candidate = this.jobQueue
          .positions()
          .find((p) => p.concurrent || !this.hasActiveJobForWorkflow(p.workflowId));
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test --workspace=packages/websocket -- unified-websocket-runner`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/websocket/src/unified-websocket-runner.ts packages/websocket/tests/unified-websocket-runner.test.ts
git commit -m "feat(websocket): allow opt-in concurrent same-workflow runs"
```

---

### Task 3: thread `concurrent` through `WorkflowRunner.run()`

**Files:**
- Modify: `web/src/stores/WorkflowRunner.ts` (`buildRunJobData` ~78-121; `run` type ~156-170; `run` impl ~335-480)
- Test: `web/src/stores/__tests__/WorkflowRunner.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `describe("run() return value", …)` in `web/src/stores/__tests__/WorkflowRunner.test.ts`:

```ts
it("passes the concurrent flag into the run_job payload when requested", async () => {
  (uuidv4 as jest.Mock).mockReturnValueOnce("job-c");
  await store.getState().run({}, testWorkflow, [], [], undefined, undefined, true);
  expect(globalWebSocketManager.send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "run_job",
      data: expect.objectContaining({ concurrent: true })
    })
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest src/stores/__tests__/WorkflowRunner.test.ts -t "concurrent flag"`
Expected: FAIL — `run()` takes no such argument / payload lacks `concurrent`.

- [ ] **Step 3: Implement**

In `buildRunJobData`, add `concurrent` to the opts and the returned object:

```ts
const buildRunJobData = (opts: {
  jobId: string;
  jobName: string;
  params: Record<string, unknown>;
  workflow: WorkflowAttributes;
  nodes: Node<NodeData>[];
  edges: Edge[];
  resource_limits?: Record<string, unknown>;
  authToken: string;
  userId: string;
  concurrent?: boolean;
}): RunJobRequest & { settings?: Record<string, unknown>; job_id: string; concurrent?: boolean } => {
  // …existing activeNodes/activeEdges logic unchanged…
  return {
    type: "run_job_request",
    api_url: BASE_URL,
    user_id: opts.userId,
    workflow_id: opts.workflow.id,
    job_name: opts.jobName,
    auth_token: opts.authToken,
    job_type: "workflow",
    execution_strategy: opts.resource_limits ? "subprocess" : "threaded",
    params: opts.params || {},
    explicit_types: false,
    graph: {
      nodes: activeNodes.map(reactFlowNodeToGraphNode),
      edges: activeEdges.map(reactFlowEdgeToGraphEdge)
    },
    resource_limits: opts.resource_limits,
    settings: { ...(opts.workflow.settings ?? {}) },
    job_id: opts.jobId,
    concurrent: opts.concurrent
  };
};
```

Update the `run` field type (around line 162) to take the flag:

```ts
  run: (
    params: Record<string, unknown>,
    workflow: WorkflowAttributes,
    nodes: Node<NodeData>[],
    edges: Edge[],
    resource_limits?: Record<string, unknown>,
    subgraphNodeIds?: Set<string>,
    concurrent?: boolean
  ) => Promise<string>;
```

Update the `run` implementation signature (around line 335) to accept `concurrent` and pass it into both `buildRunJobData` calls' opts. The single `buildRunJobData({ … })` call (around line 373) becomes:

```ts
      const req = buildRunJobData({
        jobId,
        jobName: deriveJobTitle(workflow, nodes, subgraphNodeIds),
        params,
        workflow,
        nodes,
        edges,
        resource_limits,
        authToken: auth_token,
        userId: user,
        concurrent
      });
```

And the `run:` impl parameter list:

```ts
    run: async (
      params: Record<string, unknown>,
      workflow: WorkflowAttributes,
      nodes: Node<NodeData>[],
      edges: Edge[],
      resource_limits?: Record<string, unknown>,
      subgraphNodeIds?: Set<string>,
      concurrent?: boolean
    ) => {
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest src/stores/__tests__/WorkflowRunner.test.ts`
Expected: all PASS (the new test plus the existing suite).

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/WorkflowRunner.ts web/src/stores/__tests__/WorkflowRunner.test.ts
git commit -m "feat(web): thread concurrent flag through WorkflowRunner.run"
```

---

### Task 4: shared `extractAssetId` helper

**Files:**
- Create: `web/src/stores/outputAssetId.ts`
- Modify: `web/src/stores/sketch/SketchGenerationStore.ts` (~210-231), `web/src/stores/timeline/TimelineGenerationStore.ts` (~254-277)
- Test: `web/src/stores/__tests__/outputAssetId.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/stores/__tests__/outputAssetId.test.ts`:

```ts
import { extractAssetId } from "../outputAssetId";

describe("extractAssetId", () => {
  it("returns undefined for empty values", () => {
    expect(extractAssetId(undefined)).toBeUndefined();
    expect(extractAssetId(null)).toBeUndefined();
    expect(extractAssetId("")).toBeUndefined();
  });
  it("returns a plain string id", () => {
    expect(extractAssetId("asset-1")).toBe("asset-1");
  });
  it("reads asset_id then id from an object", () => {
    expect(extractAssetId({ uri: "x", asset_id: "a1" })).toBe("a1");
    expect(extractAssetId({ id: "i1" })).toBe("i1");
  });
  it("returns undefined for an object without an id", () => {
    expect(extractAssetId({ uri: "x" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest src/stores/__tests__/outputAssetId.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `web/src/stores/outputAssetId.ts`:

```ts
/**
 * Extract an asset id from a node output value. The value may be a plain string
 * id or an AssetRef-like object (`{ uri, asset_id }` or `{ id }`).
 */
export const extractAssetId = (result: unknown): string | undefined => {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.asset_id === "string") return r.asset_id;
    if (typeof r.id === "string") return r.id;
  }
  return undefined;
};
```

Then in `SketchGenerationStore.ts`, import it and replace the body of `resolveOutputAssetId`:

```ts
import { extractAssetId } from "../outputAssetId";
// …
      resolveOutputAssetId: (workflowId, selectedOutputNodeId) =>
        extractAssetId(
          useResultsStore
            .getState()
            .getOutputResult(workflowId, selectedOutputNodeId)
        )
```

Apply the identical change in `TimelineGenerationStore.ts` (`import { extractAssetId } from "../outputAssetId";` and the same delegating body).

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest src/stores/__tests__/outputAssetId.test.ts && npx jest src/stores/sketch src/stores/timeline`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/outputAssetId.ts web/src/stores/__tests__/outputAssetId.test.ts web/src/stores/sketch/SketchGenerationStore.ts web/src/stores/timeline/TimelineGenerationStore.ts
git commit -m "refactor(web): extract shared extractAssetId helper"
```

---

### Task 5: per-job resolution in `useGenerateLayer`

**Files:**
- Modify: `web/src/hooks/sketch/useGenerateLayer.ts`
- Test: `web/src/hooks/sketch/__tests__/useGenerateLayer.concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/sketch/__tests__/useGenerateLayer.concurrency.test.ts`:

```ts
import {
  __setJobContextForTests,
  __resetGenerateLayerSubscriptionsForTests,
  handleJobMessage
} from "../useGenerateLayer";
import { useSketchGenerationStore } from "../../../stores/sketch/SketchGenerationStore";

const ctx = (layerId: string, workflowId: string, outNode: string) => ({
  layerId, documentId: "doc", workflowId, selectedOutputNodeId: outNode
});

describe("useGenerateLayer concurrent resolution", () => {
  beforeEach(() => {
    __resetGenerateLayerSubscriptionsForTests();
    useSketchGenerationStore.setState({ layerJobs: {}, jobToLayer: {} });
  });

  it("resolves each concurrent job's own output asset", async () => {
    const store = useSketchGenerationStore.getState();
    store.registerJob("layer1", "A", "wf");
    store.registerJob("layer2", "B", "wf");
    __setJobContextForTests("A", ctx("layer1", "wf", "out"));
    __setJobContextForTests("B", ctx("layer2", "wf", "out"));

    const spy = jest.spyOn(useSketchGenerationStore.getState(), "updateJobStatus");

    // Interleaved outputs for the SAME output node id, different jobs.
    await handleJobMessage("A", { type: "output_update", node_id: "out", value: { asset_id: "assetA" }, job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "output_update", node_id: "out", value: { asset_id: "assetB" }, job_id: "B", workflow_id: "wf" } as never);
    await handleJobMessage("A", { type: "job_update", status: "completed", job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "job_update", status: "completed", job_id: "B", workflow_id: "wf" } as never);

    expect(spy).toHaveBeenCalledWith("A", "completed", { assetId: "assetA" });
    expect(spy).toHaveBeenCalledWith("B", "completed", { assetId: "assetB" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest src/hooks/sketch/__tests__/useGenerateLayer.concurrency.test.ts`
Expected: FAIL — `__setJobContextForTests` / `handleJobMessage` are not exported (and, once exported, the assets would cross because resolution reads the shared store).

- [ ] **Step 3: Implement**

In `web/src/hooks/sketch/useGenerateLayer.ts`:

Add imports and per-job maps near the existing module maps (after line 83):

```ts
import { extractAssetId } from "../../stores/outputAssetId";
// …
const jobOutputs = new Map<string, unknown>();
const jobNodeErrors = new Map<string, string>();
```

Export test seams next to `__resetGenerateLayerSubscriptionsForTests` (and clear the new maps there):

```ts
export const __resetGenerateLayerSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
  jobOutputs.clear();
  jobNodeErrors.clear();
};

export const __setJobContextForTests = (
  jobId: string,
  context: JobSubscriptionContext
): void => {
  jobContexts.set(jobId, context);
};
```

In `unsubscribeJob`, also drop the per-job maps:

```ts
const unsubscribeJob = (jobId: string): void => {
  const unsubscribe = jobSubscriptions.get(jobId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(jobId);
  }
  jobContexts.delete(jobId);
  jobOutputs.delete(jobId);
  jobNodeErrors.delete(jobId);
};
```

Export `handleJobMessage` (change `const handleJobMessage = async …` to `export const handleJobMessage = async …`) and, at its top after `forwardWorkflowMessage(context.workflowId, message)`, capture this job's output + error:

```ts
  if (
    message.type === "output_update" &&
    message.node_id === context.selectedOutputNodeId
  ) {
    jobOutputs.set(jobId, normalizeOutputUpdateValue(message as unknown as OutputUpdate));
  }
  if (
    message.type === "node_update" &&
    typeof message.error === "string" &&
    message.error.trim().length > 0
  ) {
    jobNodeErrors.set(jobId, message.error);
  }
```

In the `status === "completed"` branch, resolve from this job's captured output instead of the shared store:

```ts
    const assetId = context.selectedOutputNodeId
      ? extractAssetId(jobOutputs.get(jobId))
      : undefined;
```

In the same branch's no-asset path, use this job's captured error instead of scanning `ErrorStore` by workflow prefix:

```ts
    if (!assetId) {
      const errorMessage =
        jobNodeErrors.get(jobId) ??
        "Workflow finished without producing an output asset.";
      generationStore.updateJobStatus(jobId, "failed", { errorMessage });
      context.onFailed?.(errorMessage);
      unsubscribeJob(jobId);
      return;
    }
```

Make the shared runner-store reset (the block near the top of the `job_update` handling that calls `getWorkflowRunnerStore(context.workflowId).setState({ … })`) fire **only** when this job is the one the runner is tracking, so a sibling's terminal update can't reset a concurrent run:

```ts
  if (
    status === "completed" ||
    status === "cancelled" ||
    status === "failed" ||
    status === "timed_out"
  ) {
    const runner = getWorkflowRunnerStore(context.workflowId);
    if (runner.getState().job_id === jobId) {
      runner.setState({
        state:
          status === "completed" || status === "cancelled" ? "idle" : "error",
        job_id: null
      });
    }
  }
```

Finally, in `generateLayer`, opt into concurrency on the run call:

```ts
    const jobId = await runnerStore
      .getState()
      .run(binding.paramOverrides ?? {}, workflow, nodes, edges, undefined, undefined, true);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest src/hooks/sketch/__tests__/useGenerateLayer.concurrency.test.ts`
Expected: PASS — `assetA`/`assetB` resolve to their own jobs.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/sketch/useGenerateLayer.ts web/src/hooks/sketch/__tests__/useGenerateLayer.concurrency.test.ts
git commit -m "fix(web): resolve sketch layer output per job for concurrent runs"
```

---

### Task 6: per-job resolution in `useGenerateClip`

**Files:**
- Modify: `web/src/hooks/timeline/useGenerateClip.ts`
- Test: `web/src/hooks/timeline/__tests__/useGenerateClip.concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/timeline/__tests__/useGenerateClip.concurrency.test.ts`:

```ts
import {
  __setJobContextForTests,
  __resetGenerateClipSubscriptionsForTests,
  handleJobMessage
} from "../useGenerateClip";
import { useTimelineGenerationStore } from "../../../stores/timeline/TimelineGenerationStore";

describe("useGenerateClip concurrent resolution", () => {
  beforeEach(() => {
    __resetGenerateClipSubscriptionsForTests();
    useTimelineGenerationStore.setState({ clipJobs: {}, jobToClip: {} });
  });

  it("resolves each concurrent job's own output asset", async () => {
    const store = useTimelineGenerationStore.getState();
    store.registerJob("clip1", "A", "wf");
    store.registerJob("clip2", "B", "wf");
    __setJobContextForTests("A", { clipId: "clip1", workflowId: "wf", selectedOutputNodeId: "out" });
    __setJobContextForTests("B", { clipId: "clip2", workflowId: "wf", selectedOutputNodeId: "out" });

    const spy = jest.spyOn(useTimelineGenerationStore.getState(), "updateJobStatus");

    await handleJobMessage("A", { type: "output_update", node_id: "out", value: { asset_id: "assetA" }, job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "output_update", node_id: "out", value: { asset_id: "assetB" }, job_id: "B", workflow_id: "wf" } as never);
    await handleJobMessage("A", { type: "job_update", status: "completed", job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "job_update", status: "completed", job_id: "B", workflow_id: "wf" } as never);

    expect(spy).toHaveBeenCalledWith("A", "completed", { assetId: "assetA" });
    expect(spy).toHaveBeenCalledWith("B", "completed", { assetId: "assetB" });
  });
});
```

> Note: `useGenerateClip`'s `clearJob` runs after `updateJobStatus("completed", …)`; the test asserts via the spy on `updateJobStatus`, so the post-clear state does not matter. The test omits a matching `TimelineStore` clip, so the `patchClip` branch is skipped (it is guarded by `clips.find(...)`).

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest src/hooks/timeline/__tests__/useGenerateClip.concurrency.test.ts`
Expected: FAIL — seams not exported; assets cross via the shared store.

- [ ] **Step 3: Implement**

In `web/src/hooks/timeline/useGenerateClip.ts`:

Add the import and per-job map near the module maps (after line 43):

```ts
import { extractAssetId } from "../../stores/outputAssetId";
// …
const jobOutputs = new Map<string, unknown>();
```

Update `unsubscribeJob` to clear it and add the seam, mirroring the existing reset helper:

```ts
const unsubscribeJob = (jobId: string): void => {
  const unsubscribe = jobSubscriptions.get(jobId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(jobId);
  }
  jobContexts.delete(jobId);
  jobOutputs.delete(jobId);
};

export const __setJobContextForTests = (
  jobId: string,
  context: JobSubscriptionContext
): void => {
  jobContexts.set(jobId, context);
};
```

And clear `jobOutputs` inside `__resetGenerateClipSubscriptionsForTests`:

```ts
export const __resetGenerateClipSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
  jobOutputs.clear();
};
```

Make `handleJobMessage` exported and `async` (`export const handleJobMessage = async (jobId: string, message: WebSocketMessage): Promise<void> => {`), and at its top after `forwardWorkflowMessage(context.workflowId, message)` capture this job's output:

```ts
  if (
    message.type === "output_update" &&
    message.node_id === context.selectedOutputNodeId
  ) {
    jobOutputs.set(jobId, normalizeOutputUpdateValue(message as unknown as OutputUpdate));
  }
```

In the `status === "completed"` branch, resolve from the per-job output:

```ts
    const assetId = context.selectedOutputNodeId
      ? extractAssetId(jobOutputs.get(jobId))
      : undefined;
```

Update the `subscribeJob` callback that calls `handleJobMessage` to keep awaiting/voiding the now-async function (it is already invoked as `void handleJobMessage(jobId, message)` — leave that call site as-is; `void` on a promise is fine).

In `generateClip`, opt into concurrency:

```ts
    const jobId = await runnerStore
      .getState()
      .run(clip.paramOverrides ?? {}, workflow, nodes, edges, undefined, undefined, true);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest src/hooks/timeline/__tests__/useGenerateClip.concurrency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/timeline/useGenerateClip.ts web/src/hooks/timeline/__tests__/useGenerateClip.concurrency.test.ts
git commit -m "fix(web): resolve timeline clip output per job for concurrent runs"
```

---

### Task 7: full verification

- [ ] **Step 1: Typecheck + lint + test the web package**

Run: `cd web && npm run typecheck && npm run lint && npx jest src/stores src/hooks`
Expected: clean; all suites PASS.

- [ ] **Step 2: Build + test the websocket package**

Run: `npm run build:packages && npm run test --workspace=packages/websocket`
Expected: clean build; all suites PASS.

- [ ] **Step 3: Manual smoke (sketch concurrency)**

With `make dev` running: in the AI image editor, bind two layers to the same generation workflow with different prompts, trigger both quickly. Expected: both show "running" simultaneously in the layer rows; each layer receives its **own** generated image; neither stays stuck "running".

- [ ] **Step 4: Commit any lint/type fixups**

```bash
git add -A && git commit -m "chore: verification fixups for concurrent headless generation"
```

---

## Self-review notes

- **Spec coverage:** backend gate (opt-in) — Tasks 1-2; per-job result resolution (decouple from `wf:node` store) — Tasks 4-6; no sibling-clobbering runner reset — Task 5. The canvas telemetry rekey, `WorkflowRunsStore`/`focusedJobId`, and the overlay/gallery are **Plan 2** (editor-canvas multi-run lens), not this plan.
- **Out of scope here:** `useRegenerateStaleLayers` stays sequential (it awaits each job) and does not opt into `concurrent`.
- **Type consistency:** `concurrent?: boolean` is the same name across `QueueableJob`, `RunJobRequest`, `buildRunJobData`, and `run()`. `extractAssetId` and `handleJobMessage`/`__setJobContextForTests` names match between implementation and tests.
