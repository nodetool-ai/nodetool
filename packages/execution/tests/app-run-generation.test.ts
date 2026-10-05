import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  getDb,
  generationAttachments,
  createAppInstance,
  reserveAppRun,
  deleteAppRun,
  GenerationAttempt,
  GenerationAttachment,
  GenerationOutput,
  Prediction,
  initTestDb
} from "@nodetool-ai/models";
import { createFalGenerationLifecycleHooks } from "../src/generation-lifecycle.js";
import { attachAppRunGenerationOutputs } from "../src/app-run-generation.js";
import {
  createTrackerState,
  trackPredictionMessage
} from "../src/generation-tracker.js";

async function runFixture() {
  const document = createEmptyDocument();
  document.operations = [
    {
      id: "generate",
      name: "Generate",
      workflowId: "wf",
      inputs: {},
      outputs: {},
      policy: "parallel"
    }
  ];
  const instance = await createAppInstance({
    userId: "owner",
    sourceId: "fixture",
    snapshot: { document, workflow_graphs: {}, script_documents: {} }
  });
  const reserved = await reserveAppRun({
    userId: "owner",
    instanceId: instance.id,
    operationId: "generate",
    invocationId: "request",
    origin: "ui"
  });
  if (!reserved.allowed) {
    throw new Error("Fixture reservation was denied");
  }
  return {
    userId: "owner",
    instanceId: instance.id,
    appRunId: reserved.run.id,
    traceId: reserved.run.trace_id,
    origin: "ui" as const
  };
}

describe("app run generation association", () => {
  beforeEach(() => initTestDb());
  it("persists association at non-FAL acceptance and attaches after a terminal output exists", async () => {
    const identity = await runFixture();
    const hooks = createFalGenerationLifecycleHooks({
      userId: "owner",
      appRunContext: identity
    });
    await hooks.onGenerationAccepted?.({
      generationId: "legacy-generation",
      request: {
        provider: "replicate",
        model: "fixture",
        capability: "text_to_image"
      }
    });
    expect(
      (await Prediction.find("legacy-generation"))?.metadata
    ).toMatchObject({ app_run_id: identity.appRunId });
    await trackPredictionMessage(
      {
        type: "prediction",
        id: "legacy-generation",
        status: "completed",
        provider: "replicate",
        model: "fixture",
        capability: "text_to_image",
        node_id: "node",
        asset_ids: ["asset-ref"]
      },
      { userId: "owner", workflowId: null, appRunContext: identity },
      createTrackerState()
    );
    const [attempt] =
      await GenerationAttempt.forGeneration("legacy-generation");
    const [output] = await GenerationOutput.forAttempt(attempt.id);
    const attachments = await getDb().select().from(generationAttachments);
    expect(attachments).toHaveLength(1);
    const [attachment] = attachments;
    expect(attachment).toMatchObject({
      generation_id: "legacy-generation",
      output_id: output.id,
      target_type: "app_run",
      target_id: identity.appRunId
    });
    expect(attachment.status).toBe("attached");
    await deleteAppRun("owner", identity.appRunId);
    await attachAppRunGenerationOutputs(
      await Prediction.find("legacy-generation"),
      [output]
    );
    expect(await GenerationAttachment.get(attachment.id)).toBeNull();
    expect(await Prediction.find("legacy-generation")).toMatchObject({
      asset_ids: ["asset-ref"]
    });
  });

  it("keeps a finalized authoritative receipt when the live ledger repeats the terminal message", async () => {
    const identity = await runFixture();
    const hooks = createFalGenerationLifecycleHooks({
      userId: "owner",
      appRunContext: identity
    });
    const request = {
      provider: "replicate",
      model: "fixture",
      capability: "text_to_image" as const
    };
    await hooks.onGenerationAccepted?.({
      generationId: "receipt-generation",
      request
    });
    await hooks.onGenerationTerminal?.({
      generationId: "receipt-generation",
      request,
      status: "completed",
      receipt: { cost: { amount: 0.02, currency: "USD" } },
      assetIds: ["asset-ref"]
    });
    const initial = await Prediction.find("receipt-generation");
    await trackPredictionMessage(
      {
        type: "prediction",
        id: "receipt-generation",
        status: "completed",
        provider: "replicate",
        model: "fixture",
        capability: "text_to_image",
        node_id: "node",
        asset_ids: ["asset-ref"],
        receipt: { cost: { amount: 99, currency: "USD" } }
      },
      { userId: "owner", workflowId: null, appRunContext: identity },
      createTrackerState()
    );
    await hooks.onGenerationTerminal?.({
      generationId: "receipt-generation",
      request,
      status: "completed",
      receipt: { cost: { amount: 99, currency: "USD" } },
      assetIds: ["asset-ref"]
    });
    expect(await Prediction.find("receipt-generation")).toMatchObject({
      cost: 0.02,
      reconciled_at: initial?.reconciled_at,
      completed_at: initial?.completed_at
    });
    expect(await getDb().select().from(generationAttachments)).toHaveLength(1);
  });

  it("accepts a later authoritative receipt after an initially unpriced terminal", async () => {
    const identity = await runFixture();
    const hooks = createFalGenerationLifecycleHooks({
      userId: "owner",
      appRunContext: identity
    });
    const request = {
      provider: "replicate",
      model: "fixture",
      capability: "text_to_image" as const
    };
    await hooks.onGenerationAccepted?.({
      generationId: "late-receipt-generation",
      request
    });
    await hooks.onGenerationTerminal?.({
      generationId: "late-receipt-generation",
      request,
      status: "completed",
      receipt: null,
      assetIds: ["asset-ref"]
    });
    const initial = await Prediction.find("late-receipt-generation");
    expect(initial).toMatchObject({
      cost: null,
      reconciled_at: null,
      status: "completed"
    });
    await trackPredictionMessage(
      {
        type: "prediction",
        id: "late-receipt-generation",
        status: "completed",
        provider: "replicate",
        model: "fixture",
        capability: "text_to_image",
        node_id: "node",
        asset_ids: ["asset-ref"],
        receipt: { cost: { amount: 0.04, currency: "USD" } }
      },
      { userId: "owner", workflowId: null, appRunContext: identity },
      createTrackerState()
    );
    expect(await Prediction.find("late-receipt-generation")).toMatchObject({
      cost: 0.04,
      reconciled_at: expect.any(String),
      completed_at: initial?.completed_at
    });
    expect(await getDb().select().from(generationAttachments)).toHaveLength(1);
  });

  it("attaches FAL output references and recovery repeats cannot duplicate or resurrect them", async () => {
    const identity = await runFixture();
    const hooks = createFalGenerationLifecycleHooks({
      userId: "owner",
      appRunContext: identity,
      callbacks: false
    });
    const request = {
      provider: "fal_ai",
      model: "fal-ai/fixture",
      capability: "text_to_image" as const
    };
    await hooks.onGenerationAccepted?.({
      generationId: "durable-generation",
      request
    });
    await hooks.onGenerationTerminal?.({
      generationId: "durable-generation",
      request,
      status: "completed",
      output: { images: [{ url: "https://fal.example/image.png" }] },
      receipt: null,
      assetIds: ["asset-ref"]
    });
    const [attempt] =
      await GenerationAttempt.forGeneration("durable-generation");
    const [output] = await GenerationOutput.forAttempt(attempt.id);
    await attachAppRunGenerationOutputs(
      await Prediction.find("durable-generation"),
      [output]
    );
    const attachments = await getDb().select().from(generationAttachments);
    expect(attachments).toHaveLength(1);
    const [attachment] = attachments;
    expect(attachment).toMatchObject({
      generation_id: "durable-generation",
      output_id: output.id,
      target_type: "app_run",
      target_id: identity.appRunId
    });
    expect(attachment.status).toBe("attached");
    await deleteAppRun("owner", identity.appRunId);
    await attachAppRunGenerationOutputs(
      await Prediction.find("durable-generation"),
      [output]
    );
    expect(await GenerationAttachment.get(attachment.id)).toBeNull();
    expect(await Prediction.find("durable-generation")).not.toBeNull();
  });
});
