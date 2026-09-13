import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({
  GenerationAttempt: {
    pending: vi.fn(),
    recoverable: vi.fn(),
    claimLease: vi.fn(),
    get: vi.fn(),
    findByProviderRequest: vi.fn(),
    bindRequestIfUnbound: vi.fn(),
    transition: vi.fn(),
    renewLease: vi.fn()
  },
  GenerationWebhookDelivery: {
    pending: vi.fn(),
    claim: vi.fn(),
    markProcessed: vi.fn(),
    markConflictProcessed: vi.fn()
  },
  Prediction: {
    find: vi.fn(),
    claimGenerationLease: vi.fn(),
    transitionDurable: vi.fn(),
    renewGenerationLease: vi.fn(),
    settleAttachments: vi.fn()
  },
  GenerationOutput: {
    upsertOutput: vi.fn(),
    transition: vi.fn(),
    forAttempt: vi.fn()
  },
  GenerationAttachment: {
    upsertAttachment: vi.fn(),
    transition: vi.fn()
  }
}));

vi.mock("@nodetool-ai/models", () => models);

import { DurableGenerationRecoveryWorker } from "../src/generation-recovery-worker.js";

describe("DurableGenerationRecoveryWorker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    models.GenerationAttempt.renewLease.mockResolvedValue(true);
    models.Prediction.renewGenerationLease.mockResolvedValue(true);
    models.GenerationOutput.forAttempt.mockResolvedValue([]);
    models.GenerationAttachment.transition.mockResolvedValue({
      id: "attachment-1",
      status: "attached"
    });
  });

  it("consumes webhook inbox rows before polling the fallback queue", async () => {
    models.GenerationWebhookDelivery.pending.mockResolvedValue([
      { id: "delivery-1", attempt_id: null, lease_version: 1 }
    ]);
    models.GenerationWebhookDelivery.claim.mockResolvedValue({
      id: "delivery-1",
      attempt_id: null,
      lease_version: 2
    });
    models.GenerationAttempt.findByProviderRequest.mockResolvedValue(null);
    models.GenerationWebhookDelivery.markProcessed.mockResolvedValue(true);
    models.GenerationAttempt.recoverable.mockResolvedValue([]);

    const worker = new DurableGenerationRecoveryWorker({
      provider: { queueFor: vi.fn() },
      batchSize: 1,
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const result = await worker.runOnce();
    expect(result.deliveries).toBe(1);
    expect(models.GenerationAttempt.recoverable).not.toHaveBeenCalled();
  });

  it("leaves successful media saving when no host finalizer is supplied", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider: "fal_ai",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4,
      cancel_requested_at: null
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue([attempt]);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      metadata: null,
      cancel_requested_at: null
    });
    models.Prediction.claimGenerationLease.mockResolvedValue({
      id: "generation-1",
      lease_version: 3
    });
    models.Prediction.transitionDurable.mockResolvedValue({
      id: "generation-1"
    });
    models.GenerationOutput.upsertOutput.mockResolvedValue({ id: "output-1" });
    models.GenerationOutput.transition.mockResolvedValue({ id: "output-1" });

    const queue = {
      bind: vi.fn().mockResolvedValue({ bound: true }),
      wait: vi.fn().mockResolvedValue({
        state: "succeeded",
        result: { images: [{ url: "https://fal.media/out.png" }] }
      })
    };
    const worker = new DurableGenerationRecoveryWorker({
      provider: { queueFor: vi.fn().mockResolvedValue(queue) },
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const result = await worker.runOnce();
    expect(result.skipped).toBe(1);
    expect(models.GenerationOutput.transition).toHaveBeenCalledWith(
      "output-1",
      expect.objectContaining({ status: "saving" }),
      expect.objectContaining({ attemptId: "attempt-1" })
    );
    expect(models.Prediction.transitionDurable).toHaveBeenCalledWith(
      "generation-1",
      expect.any(String),
      3,
      expect.objectContaining({ status: "recovering", output_status: "saving" })
    );
  });

  it("decodes and retries each output independently without duplicate assets", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider: "fal_ai",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4,
      cancel_requested_at: null
    };
    const generation = {
      id: "generation-1",
      user_id: "user-1",
      metadata: {
        attachments: [
          {
            target_type: "storyboard_keyframe",
            target_id: "shot-1",
            output_key: "images",
            output_index: 1
          }
        ]
      },
      cancel_requested_at: null
    };
    const rows = new Map<string, Record<string, unknown>>();
    let sequence = 0;
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue([attempt]);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    models.Prediction.find.mockResolvedValue(generation);
    models.Prediction.claimGenerationLease.mockResolvedValue({
      ...generation,
      lease_version: 3
    });
    models.Prediction.transitionDurable.mockResolvedValue({
      id: "generation-1"
    });
    models.GenerationOutput.upsertOutput.mockImplementation(async (input) => {
      const key = `${input.output_key}:${input.output_index ?? 0}`;
      const existing = rows.get(key);
      if (existing) return existing;
      const row = {
        id: `output-${++sequence}`,
        ...input,
        status: "pending",
        storage_key: null,
        asset_id: null,
        error: null
      };
      rows.set(key, row);
      return row;
    });
    models.GenerationOutput.transition.mockImplementation(async (id, state) => {
      for (const row of rows.values()) {
        if (row.id === id) Object.assign(row, state);
      }
      return [...rows.values()].find((row) => row.id === id) ?? null;
    });
    models.GenerationOutput.forAttempt.mockImplementation(async () => [
      ...rows.values()
    ]);
    models.GenerationAttachment.upsertAttachment.mockResolvedValue({
      id: "attachment-1",
      status: "pending"
    });

    const queue = {
      bind: vi.fn().mockResolvedValue({ bound: true }),
      wait: vi.fn().mockResolvedValue({
        state: "succeeded",
        result: {
          images: [
            { url: "https://fal.media/one.png" },
            { url: "https://fal.media/two.png" }
          ],
          seed: 42
        }
      }),
      cancel: vi.fn()
    };
    let failSecond = true;
    const finalizeOutput = vi.fn(async ({ descriptor }) => {
      if (descriptor.outputIndex === 1 && failSecond) {
        failSecond = false;
        throw new Error("temporary storage failure");
      }
      return {
        status: "ready" as const,
        storage_key: `generations/generation-1/${descriptor.outputKey}/${descriptor.outputIndex}.png`,
        asset_id: `asset-${descriptor.outputIndex}`,
        raw_result: descriptor.rawResult
      };
    });
    const provider = { queueFor: vi.fn().mockResolvedValue(queue) };
    const attachOutput = vi.fn().mockResolvedValue({
      status: "attached",
      selected: true,
      error: null
    });
    const options = {
      provider,
      finalizeOutput,
      attachOutput,
      now: () => new Date("2026-01-01T00:00:00.000Z")
    };
    const first = await new DurableGenerationRecoveryWorker(options).runOnce();
    const second = await new DurableGenerationRecoveryWorker(options).runOnce();

    expect(first.skipped).toBe(1);
    expect(second.completed).toBe(1);
    expect(finalizeOutput).toHaveBeenCalledTimes(4);
    expect(rows.size).toBe(3);
    expect(rows.get("images:0")?.asset_id).toBe("asset-0");
    expect(rows.get("images:1")?.asset_id).toBe("asset-1");
    expect(provider.queueFor).toHaveBeenCalledTimes(1);
    expect(queue.wait).toHaveBeenCalledTimes(1);
    expect((queue as { submit?: unknown }).submit).toBeUndefined();
    expect(attachOutput).toHaveBeenCalledTimes(1);
  });

  it("consumes duplicate callbacks after a terminal generation", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([
      {
        id: "delivery-1",
        attempt_id: "attempt-1",
        provider_request_id: "request-1",
        lease_version: 1
      }
    ]);
    models.GenerationWebhookDelivery.claim.mockResolvedValue({
      id: "delivery-1",
      attempt_id: "attempt-1",
      provider_request_id: "request-1",
      lease_version: 2
    });
    models.GenerationAttempt.get.mockResolvedValue(attempt);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    models.GenerationAttempt.recoverable.mockResolvedValue([]);
    models.GenerationOutput.forAttempt.mockResolvedValue([]);
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      status: "completed",
      provider_status: "succeeded",
      output_status: "ready",
      metadata: null
    });
    models.GenerationWebhookDelivery.markProcessed.mockResolvedValue(true);

    const queueFor = vi.fn();
    const result = await new DurableGenerationRecoveryWorker({
      provider: { queueFor },
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    expect(result.deliveries).toBe(1);
    expect(result.skipped).toBe(1);
    expect(queueFor).not.toHaveBeenCalled();
    expect(models.GenerationWebhookDelivery.markProcessed).toHaveBeenCalledWith(
      "delivery-1",
      expect.any(String),
      2,
      null
    );
  });

  it("retains contradictory callbacks as conflicts", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4
    };
    const delivery = {
      id: "delivery-1",
      attempt_id: "attempt-1",
      provider_request_id: "request-1",
      lease_version: 2,
      observation: { status: "ERROR" }
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([delivery]);
    models.GenerationWebhookDelivery.claim.mockResolvedValue(delivery);
    models.GenerationAttempt.get.mockResolvedValue(attempt);
    models.GenerationAttempt.recoverable.mockResolvedValue([]);
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      status: "completed",
      provider_status: "succeeded",
      output_status: "ready"
    });
    models.GenerationWebhookDelivery.markConflictProcessed.mockResolvedValue(
      true
    );

    const wait = vi.fn().mockResolvedValue({ state: "succeeded" });
    const queueFor = vi.fn().mockResolvedValue({
      bind: vi.fn().mockResolvedValue({ bound: true }),
      wait
    });
    const result = await new DurableGenerationRecoveryWorker({
      provider: { queueFor },
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    expect(result.skipped).toBe(1);
    expect(
      models.GenerationWebhookDelivery.markConflictProcessed
    ).toHaveBeenCalledWith(
      "delivery-1",
      expect.any(String),
      2,
      expect.stringContaining(
        "contradicts terminal generation completed; provider recheck reported succeeded"
      )
    );
    expect(queueFor).toHaveBeenCalledWith(attempt);
    expect(wait).toHaveBeenCalled();
    expect(
      models.GenerationWebhookDelivery.markProcessed
    ).not.toHaveBeenCalled();
  });

  it("leaves a contradictory callback claim retryable when recheck times out", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4
    };
    const delivery = {
      id: "delivery-1",
      attempt_id: "attempt-1",
      provider_request_id: "request-1",
      lease_version: 2,
      observation: { status: "ERROR" }
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([delivery]);
    models.GenerationWebhookDelivery.claim.mockResolvedValue(delivery);
    models.GenerationAttempt.get.mockResolvedValue(attempt);
    models.GenerationAttempt.recoverable.mockResolvedValue([]);
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      status: "completed",
      provider_status: "succeeded",
      output_status: "ready"
    });
    const queueFor = vi.fn().mockResolvedValue({
      bind: vi.fn().mockResolvedValue({ bound: true }),
      wait: vi.fn().mockRejectedValue(new Error("poll timed out"))
    });

    const result = await new DurableGenerationRecoveryWorker({
      provider: { queueFor },
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    expect(result.skipped).toBe(1);
    expect(
      models.GenerationWebhookDelivery.markConflictProcessed
    ).not.toHaveBeenCalled();
    expect(
      models.GenerationWebhookDelivery.markProcessed
    ).not.toHaveBeenCalled();
  });

  it("retries pending attachments for an already ready output", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider_request_id: "request-1",
      lease_version: 4
    };
    const output = {
      id: "output-1",
      generation_id: "generation-1",
      attempt_id: "attempt-1",
      output_key: "result",
      output_index: 0,
      status: "ready",
      asset_id: "asset-1"
    };
    const attachment = {
      id: "attachment-1",
      status: "pending",
      target_type: "storyboard_keyframe",
      target_id: "shot-1"
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue([attempt]);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    models.GenerationOutput.forAttempt.mockResolvedValue([output]);
    models.GenerationAttachment.upsertAttachment.mockResolvedValue(attachment);
    models.GenerationAttachment.transition.mockResolvedValue({
      ...attachment,
      status: "attached"
    });
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      status: "completed",
      provider_status: "succeeded",
      output_status: "ready",
      metadata: {
        attachments: [
          {
            target_type: "storyboard_keyframe",
            target_id: "shot-1"
          }
        ]
      }
    });
    const attachOutput = vi.fn().mockResolvedValue({
      status: "attached",
      selected: true,
      error: null
    });

    const result = await new DurableGenerationRecoveryWorker({
      provider: { queueFor: vi.fn() },
      attachOutput,
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    expect(result.polledAttempts).toBe(1);
    expect(result.skipped).toBe(1);
    expect(attachOutput).toHaveBeenCalledWith(
      expect.objectContaining({ output, attachment })
    );
    expect(models.GenerationAttachment.transition).toHaveBeenCalledWith(
      "attachment-1",
      expect.objectContaining({ status: "attached" }),
      expect.objectContaining({
        attemptId: "attempt-1",
        leaseVersion: 4
      })
    );
  });

  it("keeps an attempt scheduled when terminal projection loses its fence", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4,
      cancel_requested_at: null
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue([attempt]);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationOutput.forAttempt.mockResolvedValue([]);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    models.Prediction.find
      .mockResolvedValueOnce({
        id: "generation-1",
        status: "running",
        provider_status: "running",
        output_status: "pending",
        metadata: null,
        cancel_requested_at: null
      })
      .mockResolvedValueOnce({
        id: "generation-1",
        status: "running",
        provider_status: "running",
        output_status: "pending",
        metadata: null
      });
    models.Prediction.claimGenerationLease.mockResolvedValue({
      id: "generation-1",
      lease_version: 3
    });
    models.Prediction.transitionDurable.mockResolvedValue(null);
    const queue = {
      bind: vi.fn().mockResolvedValue({ bound: true }),
      wait: vi.fn().mockResolvedValue({
        state: "succeeded",
        result: { images: [{ url: "https://fal.media/out.png" }] }
      })
    };
    models.GenerationOutput.upsertOutput.mockResolvedValue({
      id: "output-1",
      status: "pending",
      output_key: "images",
      output_index: 0,
      provider_ref: "https://fal.media/out.png",
      raw_result: { url: "https://fal.media/out.png" }
    });
    models.GenerationOutput.transition.mockResolvedValue({
      id: "output-1",
      status: "ready"
    });

    await new DurableGenerationRecoveryWorker({
      provider: { queueFor: vi.fn().mockResolvedValue(queue) },
      finalizeOutput: vi.fn().mockResolvedValue({
        status: "ready",
        storage_key: "storage/out.png",
        asset_id: "asset-1"
      }),
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    const transitionCalls = models.GenerationAttempt.transition.mock.calls;
    expect(
      transitionCalls.some(([, , , update]) => update.next_check_at !== null)
    ).toBe(true);
    expect(
      transitionCalls.some(([, , , update]) => update.next_check_at === null)
    ).toBe(false);
  });

  it("repairs a generation from saved outputs without another provider read", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider: "fal_ai",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4,
      cancel_requested_at: null,
      // What the first pass recorded before it wrote any output row.
      raw_result_ref: JSON.stringify({
        images: [{ url: "https://fal.media/out.png" }],
        seed: 42
      })
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue([attempt]);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    // The generation-state write was lost, so the row is still nonterminal.
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      status: "recovering",
      provider_status: "succeeded",
      output_status: "retrying",
      metadata: null,
      cancel_requested_at: null
    });
    models.Prediction.claimGenerationLease.mockResolvedValue({
      id: "generation-1",
      lease_version: 3
    });
    models.Prediction.transitionDurable.mockResolvedValue({
      id: "generation-1"
    });
    models.GenerationOutput.forAttempt.mockResolvedValue([
      {
        id: "output-1",
        status: "ready",
        output_key: "images",
        output_index: 0,
        asset_id: "asset-1",
        storage_key: "generations/generation-1/out.png",
        provider_ref: "https://fal.media/out.png",
        raw_result: { url: "https://fal.media/out.png" }
      },
      {
        id: "output-2",
        status: "ready",
        output_key: "structured",
        output_index: 0,
        asset_id: null,
        storage_key: null,
        provider_ref: null,
        raw_result: { seed: 42 }
      }
    ]);

    const queueFor = vi.fn(async () => {
      throw new Error("fal is unreachable");
    });
    const result = await new DurableGenerationRecoveryWorker({
      provider: { queueFor },
      finalizeOutput: vi.fn(),
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    expect(queueFor).not.toHaveBeenCalled();
    expect(result.completed).toBe(1);
    expect(models.Prediction.transitionDurable).toHaveBeenCalledWith(
      "generation-1",
      expect.any(String),
      3,
      expect.objectContaining({
        status: "completed",
        output_status: "ready",
        asset_ids: ["asset-1"],
        next_check_at: null
      })
    );
    expect(models.GenerationAttempt.transition).toHaveBeenLastCalledWith(
      "attempt-1",
      expect.any(String),
      4,
      expect.objectContaining({ next_check_at: null })
    );
  });

  it("re-reads the provider when the saved outputs miss part of the result", async () => {
    const attempt = {
      id: "attempt-1",
      generation_id: "generation-1",
      provider: "fal_ai",
      provider_request_id: "request-1",
      endpoint: "fal-ai/flux/dev",
      lease_version: 4,
      cancel_requested_at: null,
      raw_result_ref: JSON.stringify({
        images: [
          { url: "https://fal.media/one.png" },
          { url: "https://fal.media/two.png" }
        ]
      })
    };
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue([attempt]);
    models.GenerationAttempt.claimLease.mockResolvedValue(attempt);
    models.GenerationAttempt.transition.mockResolvedValue(attempt);
    models.Prediction.find.mockResolvedValue({
      id: "generation-1",
      status: "recovering",
      provider_status: "succeeded",
      output_status: "retrying",
      metadata: null,
      cancel_requested_at: null
    });
    models.Prediction.claimGenerationLease.mockResolvedValue({
      id: "generation-1",
      lease_version: 3
    });
    models.Prediction.transitionDurable.mockResolvedValue({
      id: "generation-1"
    });
    // Only the first of the two outputs the result names was recorded.
    models.GenerationOutput.forAttempt.mockResolvedValue([
      {
        id: "output-1",
        status: "ready",
        output_key: "images",
        output_index: 0,
        asset_id: "asset-1",
        storage_key: "generations/generation-1/one.png",
        provider_ref: "https://fal.media/one.png",
        raw_result: { url: "https://fal.media/one.png" }
      }
    ]);

    const queue = {
      bind: vi.fn().mockResolvedValue({ bound: true }),
      wait: vi.fn().mockRejectedValue(new Error("fal is unreachable"))
    };
    const queueFor = vi.fn().mockResolvedValue(queue);
    await new DurableGenerationRecoveryWorker({
      provider: { queueFor },
      finalizeOutput: vi.fn(),
      now: () => new Date("2026-01-01T00:00:00.000Z")
    }).runOnce();

    expect(queue.wait).toHaveBeenCalledTimes(1);
    expect(models.Prediction.transitionDurable).not.toHaveBeenCalled();
  });

  it("leases every item in a slow batch past the moment it is claimed", async () => {
    let clock = new Date("2026-01-01T00:00:00.000Z").getTime();
    const attempts = ["attempt-1", "attempt-2", "attempt-3"].map((id) => ({
      id,
      generation_id: `generation-${id}`,
      provider: "fal_ai",
      provider_request_id: `request-${id}`,
      endpoint: "fal-ai/flux/dev",
      lease_version: 4,
      cancel_requested_at: null
    }));
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    models.GenerationAttempt.recoverable.mockResolvedValue(attempts);
    const claims: Array<{ at: number; expiresAt: number }> = [];
    models.GenerationAttempt.claimLease.mockImplementation(
      async (id: string, _worker: string, _now: string, expiresAt: string) => {
        claims.push({ at: clock, expiresAt: Date.parse(expiresAt) });
        return attempts.find((attempt) => attempt.id === id);
      }
    );
    models.GenerationAttempt.transition.mockResolvedValue(attempts[0]);
    models.GenerationOutput.forAttempt.mockResolvedValue([]);
    models.Prediction.find.mockImplementation(async (id: string) => ({
      id,
      status: "recovering",
      provider_status: "queued",
      output_status: "pending",
      metadata: null,
      cancel_requested_at: null
    }));
    const queue = {
      bind: vi.fn().mockResolvedValue({ bound: true }),
      // Each provider read burns more than half of a default 60s lease, so a
      // window minted once for the batch has expired by the third claim.
      wait: vi.fn().mockImplementation(async () => {
        clock += 35_000;
        throw new Error("status read timed out");
      })
    };

    await new DurableGenerationRecoveryWorker({
      provider: { queueFor: vi.fn().mockResolvedValue(queue) },
      now: () => new Date(clock)
    }).runOnce();

    expect(claims).toHaveLength(3);
    for (const claim of claims) {
      expect(claim.expiresAt).toBeGreaterThan(claim.at);
    }
  });

  it("runs one pass at a time per worker", async () => {
    let release: (() => void) | undefined;
    models.GenerationWebhookDelivery.pending.mockImplementation(
      async () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        })
    );
    models.GenerationAttempt.recoverable.mockResolvedValue([]);
    const worker = new DurableGenerationRecoveryWorker({
      provider: { queueFor: vi.fn() },
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });

    const first = worker.runOnce();
    const second = worker.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release?.();
    await Promise.all([first, second]);

    expect(models.GenerationWebhookDelivery.pending).toHaveBeenCalledTimes(1);
    models.GenerationWebhookDelivery.pending.mockResolvedValue([]);
    await worker.runOnce();
    expect(models.GenerationWebhookDelivery.pending).toHaveBeenCalledTimes(2);
  });
});
