# ComfyUI Executor Routing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route ComfyUI workflow execution through the backend with a per-workflow executor setting (local or RunPod), shown in the floating toolbar.

**Architecture:** When a comfy workflow runs, the frontend sends it to the backend like any other workflow. The backend detects comfy nodes, converts the graph to a ComfyUI API prompt, and submits it to the configured executor (local ComfyUI server or RunPod). The frontend toolbar shows an executor selector for comfy workflows. The separate `RunComfyUIWorkflowNode` / `RunComfyUIWorkflowOnRunPodNode` nodes are removed — all execution goes through the unified runner.

**Tech Stack:** TypeScript, React/MUI, Zustand, Fastify WebSocket, RunPod API

---

## File Structure

### New Files
- `packages/runtime/src/comfy-executor.ts` — ComfyUI prompt submission + polling for local and RunPod backends

### Files to Modify
- `packages/websocket/src/unified-websocket-runner.ts` — detect comfy workflows, route to comfy executor
- `web/src/components/panels/FloatingToolBar.tsx` — add executor selector UI
- `web/src/stores/WorkflowRunner.ts` — include workflow settings in run_job request
- `packages/websocket/src/unified-websocket-runner.ts` — add `settings` to `RunJobRequest`

### Files to Remove
- `packages/base-nodes/src/nodes/comfyui.ts` — standalone comfy nodes
- `packages/runtime/src/runpod-comfy-client.ts` — standalone RunPod client
- `packages/base-nodes/tests/comfyui.test.ts` — tests for removed nodes

### Files to Clean Up (remove references)
- `packages/base-nodes/src/index.ts` — remove COMFYUI_NODES export
- `packages/runtime/src/index.ts` — remove RunPodComfyClient export
- `web/src/hooks/useFloatingToolbarActions.ts` — remove frontend comfy execution branch

---

## Chunk 1: Backend ComfyUI Executor

### Task 1: Create comfy-executor.ts

**Files:**
- Create: `packages/runtime/src/comfy-executor.ts`
- Test: `packages/runtime/tests/comfy-executor.test.ts`

This module takes a ComfyUI API prompt (the `{ nodeId: { class_type, inputs } }` dict) and executes it on either a local ComfyUI server or RunPod. It consolidates logic from the removed `comfyui.ts` nodes and `runpod-comfy-client.ts`.

- [ ] **Step 1: Write the test file**

```typescript
// packages/runtime/tests/comfy-executor.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  executeComfyLocal,
  executeComfyRunPod,
  ComfyExecutorResult,
} from "../src/comfy-executor.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;
afterAll(() => { global.fetch = originalFetch; });

describe("executeComfyLocal", () => {
  beforeEach(() => mockFetch.mockReset());

  it("submits prompt, polls history, and returns images", async () => {
    // POST /prompt
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: "p1", number: 1 }),
    });
    // GET /history/p1 — result ready
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        p1: {
          outputs: {
            "9": { images: [{ filename: "out.png", subfolder: "", type: "output" }] },
          },
        },
      }),
    });
    // GET /view (image fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Buffer.from("PNG_DATA").buffer,
    });

    const result = await executeComfyLocal(
      { "3": { class_type: "KSampler", inputs: {} } },
      "127.0.0.1:8188"
    );

    expect(result.status).toBe("completed");
    expect(result.images).toHaveLength(1);
    expect(result.images![0].filename).toBe("out.png");
  });

  it("returns failed status on submission error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await executeComfyLocal(
      { "3": { class_type: "KSampler", inputs: {} } },
      "127.0.0.1:8188"
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
  });
});

describe("executeComfyRunPod", () => {
  beforeEach(() => mockFetch.mockReset());

  it("submits workflow, polls status, and returns images", async () => {
    // POST /run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "job1", status: "IN_QUEUE" }),
    });
    // GET /status/job1 — completed with data-URI
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "job1",
        status: "COMPLETED",
        output: {
          message: "data:image/png;base64,aWltYWdl",
          status: "success",
        },
      }),
    });

    const result = await executeComfyRunPod(
      { "3": { class_type: "KSampler", inputs: {} } },
      "rpa_key",
      "ep_123"
    );

    expect(result.status).toBe("completed");
    expect(result.images).toHaveLength(1);
    expect(result.images![0].data).toBe("aWltYWdl"); // prefix stripped
  });

  it("returns failed status on RunPod failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "job1", status: "IN_QUEUE" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "job1",
        status: "FAILED",
        error: "GPU OOM",
      }),
    });

    const result = await executeComfyRunPod(
      { "3": { class_type: "KSampler", inputs: {} } },
      "rpa_key",
      "ep_123"
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("GPU OOM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/runtime -- --run tests/comfy-executor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement comfy-executor.ts**

```typescript
// packages/runtime/src/comfy-executor.ts
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.runtime.comfy-executor");

export interface ComfyImage {
  type: "image";
  data: string; // base64, no data-URI prefix
  filename: string;
}

export interface ComfyExecutorResult {
  status: "completed" | "failed";
  images?: ComfyImage[];
  raw_output?: Record<string, unknown>;
  error?: string;
}

type ComfyPrompt = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripDataUriPrefix(data: string): string {
  const idx = data.indexOf(",");
  if (idx !== -1 && data.startsWith("data:")) {
    return data.slice(idx + 1);
  }
  return data;
}

// ── Local ComfyUI ────────────────────────────────────────────────

export async function executeComfyLocal(
  prompt: ComfyPrompt,
  addr: string,
  maxAttempts = 600,
  intervalMs = 2000
): Promise<ComfyExecutorResult> {
  const base = addr.startsWith("http") ? addr.replace(/\/+$/, "") : `http://${addr}`;

  let promptId: string;
  try {
    const resp = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { status: "failed", error: `ComfyUI /prompt failed (${resp.status}): ${text}` };
    }
    const body = await resp.json() as { prompt_id: string; node_errors?: Record<string, unknown> };
    if (body.node_errors && Object.keys(body.node_errors).length > 0) {
      return { status: "failed", error: `ComfyUI node errors: ${JSON.stringify(body.node_errors)}` };
    }
    promptId = body.prompt_id;
  } catch (err) {
    return { status: "failed", error: `ComfyUI submission failed: ${err}` };
  }

  // Poll for completion
  for (let i = 0; i < maxAttempts; i++) {
    await delay(intervalMs);
    try {
      const resp = await fetch(`${base}/history/${promptId}`);
      if (!resp.ok) continue;
      const history = await resp.json() as Record<string, { outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }> }>;
      const item = history[promptId];
      if (!item) continue;

      // Collect images
      const images: ComfyImage[] = [];
      const rawOutput: Record<string, unknown> = {};
      for (const [nodeId, output] of Object.entries(item.outputs)) {
        rawOutput[nodeId] = output;
        if (output.images) {
          for (const img of output.images) {
            const params = new URLSearchParams({
              filename: img.filename,
              subfolder: img.subfolder,
              type: img.type,
            });
            try {
              const imgResp = await fetch(`${base}/view?${params.toString()}`);
              if (!imgResp.ok) continue;
              const buf = Buffer.from(await imgResp.arrayBuffer());
              images.push({ type: "image", data: buf.toString("base64"), filename: img.filename });
            } catch {
              log.warn("Failed to fetch image", { filename: img.filename });
            }
          }
        }
      }
      return { status: "completed", images, raw_output: rawOutput };
    } catch {
      // retry
    }
  }
  return { status: "failed", error: `ComfyUI prompt ${promptId} timed out` };
}

// ── RunPod ───────────────────────────────────────────────────────

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export async function executeComfyRunPod(
  prompt: ComfyPrompt,
  apiKey: string,
  endpointId: string,
  maxAttempts = 900,
  intervalMs = 2000
): Promise<ComfyExecutorResult> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const baseUrl = `${RUNPOD_API_BASE}/${endpointId}`;

  // Submit
  let jobId: string;
  try {
    const resp = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { workflow: prompt } }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { status: "failed", error: `RunPod /run failed (${resp.status}): ${text}` };
    }
    const body = await resp.json() as { id: string };
    jobId = body.id;
  } catch (err) {
    return { status: "failed", error: `RunPod submission failed: ${err}` };
  }

  // Poll
  for (let i = 0; i < maxAttempts; i++) {
    await delay(intervalMs);
    try {
      const resp = await fetch(`${baseUrl}/status/${jobId}`, { method: "GET", headers });
      if (!resp.ok) continue;
      const body = await resp.json() as {
        id: string;
        status: string;
        error?: string;
        output?: { message?: string; images?: Array<{ filename: string; data: string }>; status?: string; errors?: string[] };
      };
      if (!RUNPOD_TERMINAL.has(body.status)) continue;

      if (body.status !== "COMPLETED") {
        const errorMsg = body.error || body.output?.errors?.join("; ") || `RunPod job ${body.status}`;
        return { status: "failed", error: errorMsg };
      }

      // Collect images
      const images: ComfyImage[] = [];
      if (body.output?.message && typeof body.output.message === "string") {
        images.push({ type: "image", data: stripDataUriPrefix(body.output.message), filename: "output.png" });
      }
      if (body.output?.images) {
        for (const img of body.output.images) {
          images.push({ type: "image", data: stripDataUriPrefix(img.data), filename: img.filename });
        }
      }
      return { status: "completed", images, raw_output: body.output ?? {} };
    } catch {
      // retry
    }
  }

  // Timeout — try to cancel
  try {
    await fetch(`${baseUrl}/cancel/${jobId}`, { method: "POST", headers });
  } catch { /* best effort */ }
  return { status: "failed", error: `RunPod job ${jobId} timed out` };
}
```

- [ ] **Step 4: Export from runtime index**

In `packages/runtime/src/index.ts`, add:
```typescript
export { executeComfyLocal, executeComfyRunPod } from "./comfy-executor.js";
export type { ComfyExecutorResult, ComfyImage } from "./comfy-executor.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build --workspace=packages/runtime && npm run test --workspace=packages/runtime -- --run tests/comfy-executor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/comfy-executor.ts packages/runtime/tests/comfy-executor.test.ts packages/runtime/src/index.ts
git commit -m "feat: add comfy-executor module for local and RunPod ComfyUI execution"
```

---

## Chunk 2: Backend Routing in Unified WebSocket Runner

### Task 2: Add comfy workflow detection and routing to runJob

**Files:**
- Modify: `packages/websocket/src/unified-websocket-runner.ts`

When `runJob` receives a graph where all nodes have `comfy.*` types, it should:
1. Convert the graph to a ComfyUI API prompt
2. Look up workflow settings for executor choice
3. Route to local or RunPod executor
4. Emit progress messages back via the existing WebSocket message stream

- [ ] **Step 1: Add settings to RunJobRequest**

In `packages/websocket/src/unified-websocket-runner.ts`, update `RunJobRequest`:
```typescript
export interface RunJobRequest {
  job_id?: string;
  workflow_id?: string;
  user_id?: string;
  auth_token?: string;
  params?: Record<string, unknown>;
  graph?: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
  explicit_types?: boolean;
  settings?: Record<string, unknown>; // workflow settings (comfy_executor, runpod_endpoint_id, etc.)
}
```

- [ ] **Step 2: Add comfy detection and graph-to-prompt conversion**

Add helper functions near the top of the file (after imports):
```typescript
import { executeComfyLocal, executeComfyRunPod } from "@nodetool/runtime";

function isComfyGraph(graph: { nodes: Array<Record<string, unknown>> }): boolean {
  return graph.nodes.length > 0 && graph.nodes.every(
    (n) => typeof n.type === "string" && (n.type as string).startsWith("comfy.")
  );
}

function graphToComfyPrompt(
  graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};

  for (const node of graph.nodes) {
    const id = String(node.id);
    const nodeType = String(node.type ?? "");
    const classType = nodeType.replace(/^comfy\./, "");
    const props = (node.properties ?? node.data ?? {}) as Record<string, unknown>;

    // Collect inputs from properties, excluding internal fields
    const inputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("_") || key === "workflow_id") continue;
      inputs[key] = value;
    }

    prompt[id] = { class_type: classType, inputs };
  }

  // Wire edges: edges become [sourceNodeId, outputSlotIndex] references
  for (const edge of graph.edges) {
    const targetId = String(edge.target);
    const targetHandle = String(edge.targetHandle ?? "");
    const sourceId = String(edge.source);
    const sourceHandle = String(edge.sourceHandle ?? "");

    if (prompt[targetId] && targetHandle) {
      // ComfyUI uses integer output slot indices; find the slot index
      // from the source node's output list. Default to 0 if not found.
      const sourceNode = graph.nodes.find((n) => String(n.id) === sourceId);
      let slotIndex = 0;
      if (sourceNode) {
        const metadata = ((sourceNode.properties ?? sourceNode.data ?? {}) as Record<string, unknown>)._comfy_metadata as Record<string, unknown> | undefined;
        if (metadata?.outputs && Array.isArray(metadata.outputs)) {
          const idx = (metadata.outputs as Array<{ name: string }>).findIndex((o) => o.name === sourceHandle);
          if (idx >= 0) slotIndex = idx;
        }
      }
      prompt[targetId].inputs[targetHandle] = [sourceId, slotIndex];
    }
  }

  return prompt;
}
```

- [ ] **Step 3: Add comfy execution branch in runJob**

In the `runJob` method, after `const graph = await this.getWorkflowGraph(req);` and before the `WorkflowRunner` creation, add:

```typescript
    // ComfyUI workflow — route to comfy executor instead of kernel runner
    if (isComfyGraph(graph)) {
      await this.runComfyJob(jobId, workflowId, userId, graph, req.settings ?? {});
      return;
    }
```

Add the `runComfyJob` method to the class:

```typescript
  private async runComfyJob(
    jobId: string,
    workflowId: string | null,
    userId: string,
    graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> },
    settings: Record<string, unknown>
  ): Promise<void> {
    const active: ActiveJob = {
      jobId,
      workflowId,
      context: createRuntimeContext({ jobId, workflowId, userId }),
      runner: null as unknown as WorkflowRunner, // not used for comfy
      graph,
      finished: false,
      status: "running",
    };
    this.activeJobs.set(jobId, active);

    // Emit job started
    this.sendWsMessage({
      type: "job_update",
      job_id: jobId,
      status: "running",
    });

    try {
      const prompt = graphToComfyPrompt(graph);
      const executor = String(settings.comfy_executor ?? "local");

      let result;
      if (executor === "runpod") {
        const endpointId = String(settings.runpod_endpoint_id ?? "").trim();
        if (!endpointId) throw new Error("RunPod endpoint ID is required");
        const apiKey = await getSecret("RUNPOD_API_KEY", userId) ?? process.env.RUNPOD_API_KEY ?? "";
        if (!apiKey) throw new Error("RUNPOD_API_KEY not configured");
        result = await executeComfyRunPod(prompt, apiKey, endpointId);
      } else {
        const addr = await getSecret("COMFYUI_ADDR", userId) ?? process.env.COMFYUI_ADDR ?? "127.0.0.1:8188";
        result = await executeComfyLocal(prompt, addr);
      }

      if (result.status === "failed") {
        this.sendWsMessage({
          type: "job_update",
          job_id: jobId,
          status: "failed",
          error: result.error,
        });
      } else {
        // Emit output updates for images
        if (result.images && result.images.length > 0) {
          this.sendWsMessage({
            type: "output_update",
            node_id: "comfy_output",
            node_name: "ComfyUI Output",
            output: {
              images: result.images,
              raw_output: result.raw_output,
            },
          });
        }
        this.sendWsMessage({
          type: "job_update",
          job_id: jobId,
          status: "completed",
        });
      }
    } catch (err) {
      this.sendWsMessage({
        type: "job_update",
        job_id: jobId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      active.finished = true;
      active.status = "completed";
      this.activeJobs.delete(jobId);
    }
  }
```

- [ ] **Step 4: Build and run tests**

Run: `npm run build:packages && npm run test --workspace=packages/websocket -- --run`
Expected: Existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add packages/websocket/src/unified-websocket-runner.ts
git commit -m "feat: route ComfyUI workflows to comfy executor in backend runner"
```

---

## Chunk 3: Remove Old ComfyUI Nodes and Frontend Execution

### Task 3: Remove standalone ComfyUI nodes

**Files:**
- Remove: `packages/base-nodes/src/nodes/comfyui.ts`
- Remove: `packages/base-nodes/tests/comfyui.test.ts`
- Remove: `packages/runtime/src/runpod-comfy-client.ts`
- Modify: `packages/base-nodes/src/index.ts` — remove COMFYUI_NODES
- Modify: `packages/runtime/src/index.ts` — remove RunPodComfyClient export

- [ ] **Step 1: Remove the node and client files**

```bash
rm packages/base-nodes/src/nodes/comfyui.ts
rm packages/base-nodes/tests/comfyui.test.ts
rm packages/runtime/src/runpod-comfy-client.ts
```

- [ ] **Step 2: Remove COMFYUI_NODES from base-nodes/src/index.ts**

Remove the import and registration of `COMFYUI_NODES`. Remove `RunComfyUIWorkflowNode` and `RunComfyUIWorkflowOnRunPodNode` from the exports.

- [ ] **Step 3: Remove RunPodComfyClient export from runtime/src/index.ts**

Remove the `RunPodComfyClient` and related type exports.

- [ ] **Step 4: Build and verify**

Run: `npm run build:packages`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove standalone ComfyUI nodes and RunPod client"
```

### Task 4: Remove frontend comfy execution path

**Files:**
- Modify: `web/src/hooks/useFloatingToolbarActions.ts` — remove comfy branch, always use backend runner
- Do NOT remove: `web/src/utils/comfyWorkflowConverter.ts` — still needed for import/export
- Do NOT remove: `web/src/utils/comfyExecutor.ts` — remove only the execution logic, keep detection helpers if used elsewhere

- [ ] **Step 1: Update useFloatingToolbarActions.ts**

Remove the `shouldRunViaComfy` check and `executeComfyWorkflow` call. All workflows now go through the backend `run()` path. The `run_job` request should include workflow settings so the backend can route comfy workflows.

In the `handleRun` callback, replace the comfy/standard branching with just:
```typescript
const currentWorkflow = currentState.getWorkflow();
run(
  {},
  { ...currentWorkflow, settings: currentWorkflow.settings },
  currentState.nodes,
  currentState.edges,
  undefined
);
```

- [ ] **Step 2: Include settings in WorkflowRunner run_job request**

In `web/src/stores/WorkflowRunner.ts`, add `settings` to the `RunJobRequest`:
```typescript
const req: RunJobRequest = {
  // ... existing fields
  settings: workflow.settings ?? {},
};
```

- [ ] **Step 3: Build and verify**

Run: `cd web && npm run typecheck && npm run lint`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useFloatingToolbarActions.ts web/src/stores/WorkflowRunner.ts
git commit -m "refactor: route all workflow execution through backend, include settings in run_job"
```

---

## Chunk 4: Frontend Toolbar Executor Selector

### Task 5: Add executor selector to FloatingToolBar

**Files:**
- Modify: `web/src/components/panels/FloatingToolBar.tsx`
- Modify: `web/src/stores/NodeStore.ts` — add helper to update workflow settings

- [ ] **Step 1: Add a ComfyUI executor selector to the toolbar**

In `FloatingToolBar.tsx`, when `isComfyWorkflow` is true, render a small dropdown before the Run button:

```tsx
{isComfyWorkflow && (
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mr: 1 }}>
    <Select
      size="small"
      value={comfyExecutor}
      onChange={(e) => updateWorkflowSetting("comfy_executor", e.target.value)}
      sx={{ minWidth: 100, height: 28, fontSize: 12 }}
    >
      <MenuItem value="local">Local</MenuItem>
      <MenuItem value="runpod">RunPod</MenuItem>
    </Select>
    {comfyExecutor === "runpod" && (
      <TextField
        size="small"
        placeholder="Endpoint ID"
        value={runpodEndpointId}
        onChange={(e) => updateWorkflowSetting("runpod_endpoint_id", e.target.value)}
        sx={{ width: 120, height: 28, fontSize: 12 }}
      />
    )}
  </Box>
)}
```

Read `comfyExecutor` and `runpodEndpointId` from `workflow.settings` via the node store.

- [ ] **Step 2: Add updateWorkflowSetting helper to NodeStore**

In `web/src/stores/NodeStore.ts`, add a method to update individual workflow settings:
```typescript
updateWorkflowSetting: (key: string, value: unknown) => {
  const current = get().workflow;
  const settings = { ...(current.settings as Record<string, unknown> ?? {}), [key]: value };
  set({ workflow: { ...current, settings } });
}
```

- [ ] **Step 3: Wire up the toolbar to read settings**

```typescript
const comfyExecutor = useNodes((state) => {
  const settings = state.workflow.settings as Record<string, unknown> | undefined;
  return String(settings?.comfy_executor ?? "local");
});
const runpodEndpointId = useNodes((state) => {
  const settings = state.workflow.settings as Record<string, unknown> | undefined;
  return String(settings?.runpod_endpoint_id ?? "");
});
const updateWorkflowSetting = useNodes((state) => state.updateWorkflowSetting);
```

- [ ] **Step 4: Build and verify**

Run: `cd web && npm run typecheck && npm run lint`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add web/src/components/panels/FloatingToolBar.tsx web/src/stores/NodeStore.ts
git commit -m "feat: add ComfyUI executor selector (Local/RunPod) to floating toolbar"
```

---

## Chunk 5: Final Verification

### Task 6: Full test suite and cleanup

- [ ] **Step 1: Rebuild all packages**

Run: `npm run build:packages`

- [ ] **Step 2: Run full test suite**

Run: `make check`
Expected: All existing tests pass, no regressions

- [ ] **Step 3: Verify ComfyUI execution paths**

Manually verify:
- A comfy workflow with "Local" setting sends to backend, which calls ComfyUI server
- A comfy workflow with "RunPod" setting sends to backend, which calls RunPod API
- A non-comfy workflow still runs through the normal kernel runner
- The toolbar shows executor selector only for comfy workflows

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for ComfyUI executor routing"
```
