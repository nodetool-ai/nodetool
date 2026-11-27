import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GenerationAttempt,
  Job,
  Prediction,
  Workflow,
  getRunTrace,
  initTestDb
} from "@nodetool-ai/models";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  browserTracePolicy,
  rememberBrowserTracePolicy
} from "../src/browser-trace-policy.js";
import { attachRunCostLedger } from "../src/cost-ledger.js";
import { createFalGenerationLifecycleHooks } from "../src/generation-lifecycle.js";
import { DurableGenerationRecoveryWorker } from "../src/generation-recovery-worker.js";
import { runApplicationDebug } from "../src/service/app-debug-service.js";
import {
  InteractiveEscalationHandle,
  MAX_LIVE_SESSIONS_PER_USER,
  TooManyDebugSessionsError,
  debugSessions
} from "../src/service/debug-sessions.js";
import { registerWorkflowRunTrace } from "../src/service/run-trace-lifecycle.js";
import { runWorkflow } from "../src/service/workflow-run.js";
import { memoryFolder } from "./_helpers/memory-folder.js";

describe("packages/execution bug-hunt regressions", () => {
  beforeEach(() => {
    initTestDb({ strictProjects: true });
  });

  it("serializes prediction and node_update writes in attachRunCostLedger so provider_cost does not double-bill", async () => {
    const listeners = new Set<(msg: ProcessingMessage) => void>();
    const context = {
      addMessageListener(listener: (msg: ProcessingMessage) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    const emit = (msg: ProcessingMessage): void => {
      for (const listener of listeners) listener(msg);
    };

    const ledger = attachRunCostLedger(context, {
      userId: "u1",
      workflowId: "wf-race",
      nodeType: () => "fal.text_to_image.FluxSchnell"
    });

    // Emit running -> completed (with provider receipt) -> node_update (same charge)
    // synchronously in the same turn, mirroring a real node completing right after its provider call.
    emit({
      type: "prediction",
      id: "gen-race-1",
      user_id: "u1",
      node_id: "n1",
      provider: "fal_ai",
      model: "fal-ai/flux/schnell",
      capability: "text_to_image",
      status: "running",
      params: {}
    });
    emit({
      type: "prediction",
      id: "gen-race-1",
      user_id: "u1",
      node_id: "n1",
      provider: "fal_ai",
      model: "fal-ai/flux/schnell",
      capability: "text_to_image",
      status: "completed",
      params: {},
      receipt: {
        cost: { amount: 0.05, currency: "USD" }
      }
    });
    emit({
      type: "node_update",
      node_id: "n1",
      node_name: "Flux",
      node_type: "fal.text_to_image.FluxSchnell",
      status: "completed",
      provider_cost: {
        provider: "fal_ai",
        amount: 0.05,
        unit: "USD",
        currency: "USD",
        model: "fal-ai/flux/schnell"
      }
    });

    await ledger.settled();
    ledger();

    const [rows] = await Prediction.paginate("u1", { limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cost).toBe(0.05);
  });

  it("marks generation attachment_status as attached when finalizeAttemptWithLeases completes all attachments", async () => {
    const request = {
      provider: "fal_ai",
      capability: "text_to_image",
      model: "fal-ai/flux/dev",
      params: { prompt: "a cabin" },
      destination: {
        document_id: "storyboard-1",
        target_type: "storyboard_keyframe",
        target_id: "shot-1",
        selected: true
      }
    } as const;

    const hooks = createFalGenerationLifecycleHooks({
      userId: "u1",
      callbacks: false
    });
    await hooks.onGenerationAccepted?.({
      generationId: "gen-finalize-attach",
      request
    });
    await hooks.onProviderRequestBound?.(
      { providerRequestId: "fal-req-finalize" },
      "gen-finalize-attach"
    );

    const later = () => new Date(Date.now() + 5 * 60_000);
    const worker = new DurableGenerationRecoveryWorker({
      provider: {
        queueFor: () => ({
          bind: async (binding) => binding,
          wait: async () => ({
            state: "completed",
            result: { images: [{ url: "https://fal.example/cabin.png" }] }
          }),
          cancel: async () => undefined
        })
      },
      finalizeOutput: async () => ({
        status: "ready",
        asset_id: "asset-cabin",
        storage_key: "generations/gen-finalize-attach/cabin.png"
      }),
      attachOutput: async () => ({
        status: "attached",
        selected: true,
        error: null
      }),
      now: later
    });

    const result = await worker.runOnce();
    expect(result.completed).toBe(1);

    const generation = await Prediction.find("gen-finalize-attach");
    expect(generation?.status).toBe("completed");
    expect(generation?.attachment_status).toBe("attached");
    const [attempt] = await GenerationAttempt.forGeneration("gen-finalize-attach");
    expect(attempt?.next_check_at).toBeNull();
  });

  it("does not evict the owner's browserTracePolicy when another user queries the traceId", () => {
    const traceId = "trace-tenant-isolation-1";
    rememberBrowserTracePolicy({
      userId: "owner",
      runId: "run-1",
      traceId,
      origin: "ui",
      secretValues: new Set(["super-secret-token"]),
      policy: { contentSuppressed: false }
    });

    // Foreign user fails closed
    const foreign = browserTracePolicy("attacker", traceId);
    expect(foreign.contentSuppressed).toBe(true);
    expect(foreign.secretValues.size).toBe(0);

    // Owner's policy must remain intact
    const owner = browserTracePolicy("owner", traceId);
    expect(owner.contentSuppressed).toBe(false);
    expect(owner.secretValues.has("super-secret-token")).toBe(true);
  });

  it("does not attach a foreign user's workflow as a parent in registerWorkflowRunTrace for inline graphs", async () => {
    const foreignWorkflow = await Workflow.create<Workflow>({
      user_id: "victim",
      name: "Victim Workflow",
      graph: { nodes: [], edges: [] }
    });
    const job = await Job.create<Job>({
      id: "job-inline-foreign",
      user_id: "attacker",
      workflow_id: "",
      status: "running",
      graph: { nodes: [], edges: [] }
    });

    const context = new ProcessingContext({
      jobId: job.id,
      userId: "attacker"
    });
    const scope = await registerWorkflowRunTrace(context, {
      jobId: job.id,
      workflowId: foreignWorkflow.id,
      inlineGraph: true
    });

    const run = await getRunTrace("attacker", scope.runId);
    expect(run?.parents).toContainEqual({ kind: "job", id: job.id });
    expect(run?.parents.some((parent) => parent.kind === "workflow")).toBe(false);
  });

  it("settles the registered run trace as failed when ExecutionSession.create throws during runWorkflow", async () => {
    const registry = new NodeRegistry();
    let registeredRunId: string | null = null;
    const throwingRegistry = Object.create(registry) as NodeRegistry;
    throwingRegistry.resolveMetadata = () => {
      throw new Error("boom during session startup");
    };

    await expect(
      runWorkflow({
        workflowId: "",
        userId: "owner",
        graph: {
          nodes: [{ id: "n1", type: "nodetool.constant.String", properties: {} }],
          edges: []
        },
        resolveWorkspace: memoryFolder,
        environment: {
          registry: throwingRegistry,
          configureContext: (ctx) => {
            let current: ProcessingContext["runTraceContext"];
            Object.defineProperty(ctx, "runTraceContext", {
              configurable: true,
              set(value) {
                current = value;
                if (value?.runId) registeredRunId = value.runId;
              },
              get() {
                return current;
              }
            });
          }
        }
      })
    ).rejects.toThrow("boom during session startup");

    expect(registeredRunId).not.toBeNull();
    const trace = await getRunTrace("owner", registeredRunId!);
    expect(trace?.status).toBe("failed");
  });

  it("does not leak an orphaned app debug simulation when the user is at MAX_LIVE_SESSIONS_PER_USER", async () => {
    const userId = "session-limit-user";
    const resolvers: Array<(r: Record<string, unknown>) => void> = [];

    try {
      for (let i = 0; i < MAX_LIVE_SESSIONS_PER_USER; i++) {
        let resolve!: (r: Record<string, unknown>) => void;
        const done = new Promise<Record<string, unknown>>((r) => {
          resolve = r;
        });
        resolvers.push(resolve);
        debugSessions.create({
          userId,
          workflowId: null,
          jobId: `held-${i}`,
          handle: new InteractiveEscalationHandle(),
          done,
          cancel: () => resolve({ status: "cancelled" })
        });
      }

      const scriptRunner = vi.fn(async () => ({
        ok: true,
        outputs: { out: "ran" },
        logs: [],
        duration_ms: 1
      }));

      await expect(
        runApplicationDebug(
          userId,
          {
            document: {
              bundleVersion: 1,
              name: "Limit Test",
              app: {
                schemaVersion: 4,
                ui: { content: [], root: { props: {} } },
                resources: [],
                variables: [],
                operations: [
                  {
                    id: "main",
                    name: "Main",
                    workflowId: "",
                    target: { kind: "script", scriptId: "s1", scriptVersion: 1 },
                    policy: "parallel",
                    inputs: {},
                    outputs: {}
                  }
                ]
              },
              workflows: [],
              scripts: [
                {
                  key: "s1",
                  name: "S1",
                  document: {
                    ...emptyJsScriptDocument(),
                    outputs: [{ name: "out", type: "str" }],
                    code: 'await output("out", "ran")'
                  }
                }
              ]
            },
            interact: [{ run: "main" }],
            poll: true
          },
          new NodeRegistry(),
          { scriptRunner }
        )
      ).rejects.toThrow(TooManyDebugSessionsError);

      // Give any accidentally started simulation microtasks a chance to execute
      await new Promise((r) => setTimeout(r, 50));
      expect(scriptRunner).not.toHaveBeenCalled();
    } finally {
      for (const resolve of resolvers) {
        resolve({ status: "cancelled" });
      }
    }
  });
});
