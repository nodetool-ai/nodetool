/**
 * A live render saves its asset and only then attaches it to the storyboard.
 * If the process dies in between, or the destination write loses its retries,
 * the paid asset is saved and the shot never gets it — so the durable attempt
 * has to stay scheduled until the attachment intent is applied, not until the
 * media is saved.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GenerationAttachment,
  GenerationAttempt,
  GenerationOutput,
  Prediction,
  initTestDb
} from "@nodetool-ai/models";
import { createFalGenerationLifecycleHooks } from "../src/generation-lifecycle.js";
import { DurableGenerationRecoveryWorker } from "../src/generation-recovery-worker.js";

const REQUEST = {
  provider: "fal_ai",
  capability: "text_to_image",
  model: "fal-ai/flux/dev",
  params: { prompt: "a lighthouse" },
  destination: {
    document_id: "storyboard-1",
    target_type: "storyboard_keyframe",
    target_id: "shot-1",
    selected: true
  }
} as const;

/** Far enough past the live lease and the recovery delay that both expire. */
function laterClock(): () => Date {
  return () => new Date(Date.now() + 5 * 60_000);
}

async function renderAndSaveWithoutAttaching(
  generationId: string
): Promise<void> {
  const hooks = createFalGenerationLifecycleHooks({
    userId: "u1",
    callbacks: false
  });
  await hooks.onGenerationAccepted?.({ generationId, request: REQUEST });
  await hooks.onGenerationTerminal?.({
    generationId,
    request: REQUEST,
    status: "completed",
    output: { images: [{ url: "https://fal.example/shot.png" }] },
    receipt: null,
    assetIds: ["asset-1"]
  });
}

describe("durable attachment recovery", () => {
  beforeEach(() => initTestDb({ strictProjects: true }));

  it("keeps the attempt scheduled when the asset is saved but unattached", async () => {
    await renderAndSaveWithoutAttaching("gen-attach-1");

    const generation = await Prediction.find("gen-attach-1");
    expect(generation?.status).toBe("completed");
    expect(generation?.output_status).toBe("ready");
    expect(generation?.attachment_status).toBe("pending");
    const due = await GenerationAttempt.recoverable(
      new Date(Date.now() + 5 * 60_000).toISOString()
    );
    expect(due.map((attempt) => attempt.generation_id)).toEqual([
      "gen-attach-1"
    ]);
  });

  it("attaches the saved asset once without another provider submission", async () => {
    await renderAndSaveWithoutAttaching("gen-attach-2");
    const [attempt] = await GenerationAttempt.recoverable(
      new Date(Date.now() + 5 * 60_000).toISOString()
    );
    const queueFor = vi.fn(() => {
      throw new Error("recovery must not re-read or re-submit to the provider");
    });
    const attachOutput = vi.fn().mockResolvedValue({
      status: "attached",
      selected: true,
      error: null
    });
    const options = {
      provider: { queueFor },
      attachOutput,
      now: laterClock()
    };

    await new DurableGenerationRecoveryWorker(options).runOnce();
    await new DurableGenerationRecoveryWorker(options).runOnce();

    expect(queueFor).not.toHaveBeenCalled();
    expect(attachOutput).toHaveBeenCalledTimes(1);
    const [output] = await GenerationOutput.forAttempt(attempt.id);
    expect(output.asset_id).toBe("asset-1");
    const attachment = await GenerationAttachment.upsertAttachment({
      generation_id: "gen-attach-2",
      output_id: output.id,
      target_type: "storyboard_keyframe",
      target_id: "shot-1"
    });
    expect(attachment.status).toBe("attached");
    const settled = await GenerationAttempt.get<GenerationAttempt>(attempt.id);
    expect(settled?.next_check_at).toBeNull();
    expect((await Prediction.find("gen-attach-2"))?.attachment_status).toBe(
      "attached"
    );
  });

  it("stays scheduled while the destination write keeps failing", async () => {
    await renderAndSaveWithoutAttaching("gen-attach-3");
    const [attempt] = await GenerationAttempt.recoverable(
      new Date(Date.now() + 5 * 60_000).toISOString()
    );

    await new DurableGenerationRecoveryWorker({
      provider: {
        queueFor: vi.fn(() => {
          throw new Error("unused");
        })
      },
      attachOutput: vi.fn().mockResolvedValue({
        status: "retrying",
        error: "Storyboard changed while attaching recovered output"
      }),
      now: laterClock()
    }).runOnce();

    const rescheduled = await GenerationAttempt.get<GenerationAttempt>(
      attempt.id
    );
    expect(rescheduled?.next_check_at).not.toBeNull();
  });
});
