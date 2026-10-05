import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDb,
  getRawDb,
  Application,
  applicationUsage,
  deleteAppRun,
  setApplicationBudget,
  generationAttachments,
  Asset,
  GenerationAttempt,
  GenerationOutput,
  Prediction,
  createAppInstance,
  getAppInstance,
  getAppRun,
  initTestDb,
  listAppRuns
} from "@nodetool-ai/models";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import {
  ProcessingContext,
  setLastUsage,
  recordGenerationReceipt
} from "@nodetool-ai/runtime";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { executeAppOperation } from "../src/service/app-operation.js";

async function instance(applicationId?: string) {
  return createAppInstance({
    userId: "owner",
    sourceId: "fixture",
    applicationId,
    snapshot: {
      document: {
        schemaVersion: 4,
        ui: { content: [], root: { props: {} } },
        resources: [],
        variables: [
          { id: "answer", name: "Answer", scope: "instance", persist: true }
        ],
        operations: [
          {
            id: "add",
            name: "Add",
            workflowId: "",
            target: { kind: "script", scriptId: "script", scriptVersion: 1 },
            policy: "parallel",
            inputs: { n: { from: "constant", value: 4 } },
            outputs: { sum: { to: "variable", variableId: "answer" } }
          }
        ]
      },
      workflow_graphs: {},
      script_documents: {
        script: {
          ...emptyJsScriptDocument(),
          inputs: [{ name: "n", type: "int" }],
          outputs: [{ name: "sum", type: "int" }],
          code: 'await output("sum", inputs.n + 1)'
        }
      }
    }
  });
}

describe("durable app operations", () => {
  beforeEach(() => initTestDb());
  it("opens before execution, folds output to server state, and does not execute a transport retry twice", async () => {
    const app = await instance();
    let calls = 0;
    const options = {
      userId: "owner",
      instanceId: app.id,
      operationId: "add",
      invocationId: "request",
      origin: "ui" as const,
      context: new ProcessingContext({ jobId: "host", userId: "owner" }),
      registry: new NodeRegistry(),
      scriptRunner: async (
        context: ProcessingContext,
        input: { inputs: Record<string, unknown> }
      ) => {
        calls++;
        expect(
          await getAppRun("owner", context.appRunContext!.appRunId)
        ).toMatchObject({ status: "running", inputs: { n: 4 } });
        return {
          ok: true,
          outputs: { sum: Number(input.inputs.n) + 1 },
          logs: [],
          duration_ms: 1
        };
      }
    };
    const result = await executeAppOperation(options);
    expect(result.run).toMatchObject({
      status: "completed",
      outputs: { answer: 5 },
      origin: "ui"
    });
    expect((await getAppInstance("owner", app.id))?.variables.answer).toBe(5);
    expect((await executeAppOperation(options)).reused).toBe(true);
    expect(calls).toBe(1);
    expect((await listAppRuns("owner", app.id)).length).toBe(1);
  });

  it("executes a real sandbox script and retains its deterministic generation attachment", async () => {
    const app = await instance();
    const context = new ProcessingContext({
      jobId: "host",
      userId: "owner",
      modelInterfaces: {
        createAsset: async (args) =>
          Asset.create({
            user_id: args.userId,
            name: args.name,
            content_type: args.contentType,
            size: args.content.byteLength,
            metadata: args.metadata
          })
      }
    });
    const result = await executeAppOperation({
      userId: "owner",
      instanceId: app.id,
      operationId: "add",
      invocationId: "sandbox-generation",
      origin: "ui",
      context,
      registry: new NodeRegistry(),
      scriptRunner: async (child, input) => {
        const result = await createJsScriptAppRunner("owner", {
          context: child
        })(input);
        await child.runGenerationWith(
          {
            id: "sandbox-generation",
            provider: "replicate",
            model: "fixture",
            capability: "text_to_image",
            nodeId: "fixture",
            persist: { name: "fixture.png", mime: "image/png" }
          },
          async () => new Uint8Array([1, 2, 3]),
          { withoutProvider: true }
        );
        return result;
      }
    });
    expect(result.run).toMatchObject({
      status: "completed",
      inputs: { n: 4 },
      outputs: { answer: 5 }
    });
    const generation = await Prediction.find("sandbox-generation");
    expect(generation?.metadata).toMatchObject({ app_run_id: result.run.id });
    const [attempt] =
      await GenerationAttempt.forGeneration("sandbox-generation");
    const [output] = await GenerationOutput.forAttempt(attempt.id);
    const attachments = await getDb().select().from(generationAttachments);
    expect(attachments).toHaveLength(1);
    const [attachment] = attachments;
    expect(attachment).toMatchObject({
      generation_id: "sandbox-generation",
      output_id: output.id,
      target_type: "app_run",
      target_id: result.run.id
    });
    expect(attachment.status).toBe("attached");
    expect(await Asset.get(output.asset_id!)).not.toBeNull();
  });

  it("settles saved-app billing after deletion without restoring run history or failing execution", async () => {
    await Application.create<Application>({ id: "saved", user_id: "owner" });
    const app = await instance("saved");
    await setApplicationBudget("saved", {
      period: "total",
      maxUsd: 1,
      maxInvocations: 1
    });
    const result = await executeAppOperation({
      userId: "owner",
      instanceId: app.id,
      operationId: "add",
      invocationId: "deleted-operation",
      origin: "cli",
      estimatedUsd: 1,
      registry: new NodeRegistry(),
      context: new ProcessingContext({ jobId: "host", userId: "owner" }),
      scriptRunner: async (child) => {
        setLastUsage({
          inputTokens: 2,
          outputTokens: 1,
          totalTokens: 3,
          cost: 0.25
        });
        const identity = child.appRunContext;
        if (!identity) {
          throw new Error("Missing run identity");
        }
        await deleteAppRun("owner", identity.appRunId);
        return { ok: true, outputs: { sum: 5 }, logs: [], duration_ms: 1 };
      }
    });
    expect(result.run).toMatchObject({
      status: "completed",
      snapshot: null,
      inputs: null,
      outputs: null,
      documents: null
    });
    expect(result.variables.answer).toBe(5);
    expect(await getAppRun("owner", result.run.id)).toBeNull();
    expect(await listAppRuns("owner", app.id)).toEqual([]);
    expect(await applicationUsage("saved", "total")).toMatchObject({
      spentUsd: 0.25,
      invocations: 1
    });
    expect(
      getRawDb()
        .prepare(
          "SELECT status,actual_usd,known_llm_usd,instance_id,snapshot,inputs,outputs,documents,error FROM application_invocations WHERE id=?"
        )
        .get(result.run.id)
    ).toEqual({
      status: "completed",
      actual_usd: 0.25,
      known_llm_usd: 0.25,
      instance_id: null,
      snapshot: null,
      inputs: null,
      outputs: null,
      documents: null,
      error: null
    });
  });

  it.each(["completed", "failed", "cancelled", "deleted", "unpriced"] as const)(
    "finalizes non-FAL background work after its script returns: %s",
    async (outcome) => {
      if (outcome === "deleted") {
        await Application.create<Application>({
          id: "saved",
          user_id: "owner"
        });
      }
      const app = await instance(outcome === "deleted" ? "saved" : undefined);
      const controller = new AbortController();
      const parent = new ProcessingContext({
        jobId: "host",
        userId: "owner",
        modelInterfaces: {
          createAsset: async () => ({ id: "background-asset" })
        }
      });
      parent.signal = controller.signal;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let work: Promise<unknown> | undefined;
      const result = await executeAppOperation({
        userId: "owner",
        instanceId: app.id,
        operationId: "add",
        invocationId: "background",
        origin: "cli",
        estimatedUsd: 1,
        registry: new NodeRegistry(),
        context: parent,
        scriptRunner: async (child) => {
          work = child
            .runGenerationWith(
              {
                id: "background-generation",
                provider: "replicate",
                model: "fixture",
                capability: "text_to_image",
                nodeId: "background",
                persist: { name: "background.png", mime: "image/png" }
              },
              async (_, signal) => {
                await gate;
                if (outcome !== "unpriced") {
                  recordGenerationReceipt({
                    cost: { amount: 0.02, currency: "USD" }
                  });
                }
                signal.throwIfAborted();
                if (outcome === "failed") {
                  throw new Error("Background provider failed");
                }
                return new Uint8Array([1, 2, 3]);
              },
              { withoutProvider: true }
            )
            .catch((error: unknown) => error);
          await vi.waitFor(async () => {
            expect(
              (await Prediction.find("background-generation"))?.status
            ).toBe("running");
          });
          return { ok: true, outputs: { sum: 5 }, logs: [], duration_ms: 1 };
        }
      });
      expect(result.run.status).toBe("completed");
      expect((await Prediction.find("background-generation"))?.status).toBe(
        "running"
      );
      if (outcome === "deleted") {
        await deleteAppRun("owner", result.run.id);
      }
      if (outcome === "cancelled") {
        controller.abort(new Error("Background cancelled"));
      }
      release();
      await work;
      expect(await Prediction.find("background-generation")).toMatchObject({
        status:
          outcome === "failed"
            ? "failed"
            : outcome === "cancelled"
              ? "cancelled"
              : "completed",
        cost: outcome === "unpriced" ? null : 0.02,
        reconciled_at: outcome === "unpriced" ? null : expect.any(String)
      });
      const attachments = await getDb().select().from(generationAttachments);
      if (outcome === "completed" || outcome === "unpriced") {
        expect(attachments).toHaveLength(1);
        expect(attachments[0]).toMatchObject({
          generation_id: "background-generation",
          target_id: result.run.id,
          status: "attached"
        });
        const persisted = await getAppRun("owner", result.run.id);
        expect(persisted?.actual_usd).toBe(
          outcome === "unpriced" ? null : 0.02
        );
        expect(persisted?.estimated_usd).toBe(1);
      } else {
        expect(attachments).toEqual([]);
      }
      if (outcome === "deleted") {
        expect(await getAppRun("owner", result.run.id)).toBeNull();
        expect((await applicationUsage("saved", "total")).spentUsd).toBe(0.02);
      }
    }
  );

  it("settles token-billed provider calls from the LLM account without a second generation charge", async () => {
    const app = await instance();
    const result = await executeAppOperation({
      userId: "owner",
      instanceId: app.id,
      operationId: "add",
      invocationId: "llm-only",
      origin: "cli",
      estimatedUsd: 1,
      registry: new NodeRegistry(),
      context: new ProcessingContext({ jobId: "host", userId: "owner" }),
      scriptRunner: async (child) => {
        await child.runGenerationWith(
          {
            id: "token-call",
            provider: "openai",
            model: "fixture",
            capability: "generate_message"
          },
          async () => {
            setLastUsage({
              inputTokens: 2,
              outputTokens: 1,
              totalTokens: 3,
              cost: 0.25
            });
            return "response";
          },
          { withoutProvider: true }
        );
        return { ok: true, outputs: { sum: 5 }, logs: [], duration_ms: 1 };
      }
    });
    expect(result.run).toMatchObject({
      status: "completed",
      actual_usd: 0.25,
      known_llm_usd: 0.25
    });
    expect(await Prediction.find("token-call")).toBeNull();
  });

  it("records preparation errors and cancellation as terminal runs", async () => {
    const app = await instance();
    const base = {
      userId: "owner",
      instanceId: app.id,
      operationId: "add",
      origin: "cli" as const,
      registry: new NodeRegistry()
    };
    const failed = await executeAppOperation({
      ...base,
      invocationId: "missing-host",
      context: new ProcessingContext({ jobId: "host", userId: "owner" })
    });
    expect(failed.run).toMatchObject({
      status: "failed",
      error: "Host does not provide script execution"
    });
    const context = new ProcessingContext({ jobId: "host", userId: "owner" });
    context.signal = AbortSignal.abort(new Error("Cancelled before execution"));
    const cancelled = await executeAppOperation({
      ...base,
      invocationId: "cancelled",
      context
    });
    expect(cancelled.run.status).toBe("cancelled");
  });
});
