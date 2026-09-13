import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { initTestDb } from "../src/db.js";
import {
  GenerationAttachment,
  GenerationAttempt,
  GenerationOutput,
  GenerationWebhookDelivery,
  Prediction,
  DurableGenerationIdempotencyConflictError
} from "../src/index.js";
import { deriveGenerationStatus } from "../src/index.js";

describe("durable generation persistence", () => {
  beforeEach(() => initTestDb({ strictProjects: true }));

  it("deduplicates acceptance and rejects a different input under the same key", async () => {
    const first = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "take-1",
      input_fingerprint: "hash-a"
    });
    const duplicate = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "take-1",
      input_fingerprint: "hash-a"
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.generation.id).toBe(first.generation.id);
    await expect(
      Prediction.acceptGeneration({
        user_id: "u1",
        provider: "fal_ai",
        model: "flux",
        idempotency_key: "take-1",
        input_fingerprint: "hash-b"
      })
    ).rejects.toBeInstanceOf(DurableGenerationIdempotencyConflictError);
  });

  it("concurrently accepts one generation and one attempt", async () => {
    const input = {
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "concurrent",
      input_fingerprint: "same"
    };
    const accepted = await Promise.all(
      Array.from({ length: 8 }, () => Prediction.acceptGeneration(input))
    );
    expect(new Set(accepted.map((result) => result.generation.id)).size).toBe(
      1
    );
    const ensured = await Promise.all(
      accepted.map((result) =>
        GenerationAttempt.ensureForGeneration({
          generation_id: result.generation.id,
          provider: input.provider,
          input_fingerprint: input.input_fingerprint
        })
      )
    );
    expect(new Set(ensured.map((result) => result.attempt.id)).size).toBe(1);
  });

  it("claims, renews, and fences a generation lease with compare-and-swap", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "lease-1",
      input_fingerprint: "hash"
    });
    const lease = await Prediction.claimGenerationLease(
      generation.id,
      "worker-a",
      "2026-09-13T10:00:00.000Z",
      "2026-09-13T10:01:00.000Z"
    );
    expect(lease?.lease_version).toBe(1);
    expect(
      await Prediction.claimGenerationLease(
        generation.id,
        "worker-b",
        "2026-09-13T10:00:30.000Z",
        "2026-09-13T10:01:30.000Z"
      )
    ).toBeNull();
    expect(
      await Prediction.renewGenerationLease(
        generation.id,
        "worker-a",
        1,
        "2026-09-13T10:02:00.000Z"
      )
    ).toBe(true);
    expect(
      await Prediction.renewGenerationLease(
        generation.id,
        "worker-a",
        1,
        "2026-09-13T10:03:00.000Z"
      )
    ).toBe(true);
  });

  it("recovers only due, unleased rows in stable order", async () => {
    const first = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "due-1",
      input_fingerprint: "a"
    });
    const second = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "due-2",
      input_fingerprint: "b"
    });
    const future = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "future",
      input_fingerprint: "c"
    });
    await first.generation.update({
      next_check_at: "2026-09-13T09:00:00.000Z",
      created_at: "2026-09-13T08:00:00.000Z"
    });
    await second.generation.update({
      next_check_at: "2026-09-13T09:00:00.000Z",
      created_at: "2026-09-13T08:01:00.000Z"
    });
    await future.generation.update({
      next_check_at: "2026-09-13T11:00:00.000Z"
    });
    await second.generation.update({
      lease_owner: "active",
      lease_expires_at: "2026-09-13T11:00:00.000Z"
    });
    const due = await Prediction.recoverableGenerations(
      "2026-09-13T10:00:00.000Z"
    );
    expect(due.map((generation) => generation.id)).toEqual([
      first.generation.id
    ]);
  });

  it("recovers ambiguous submissions and scheduled output retries only", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "attempt-recovery",
      input_fingerprint: "hash"
    });
    const ambiguous = await GenerationAttempt.create<GenerationAttempt>({
      generation_id: generation.id,
      provider: "fal_ai",
      attempt_number: 1,
      submission_status: "submitting",
      provider_status: "unknown",
      created_at: "2026-09-13T08:00:00.000Z"
    });
    await GenerationAttempt.create<GenerationAttempt>({
      generation_id: generation.id,
      provider: "fal_ai",
      attempt_number: 2,
      submission_status: "submitted",
      provider_status: "succeeded",
      created_at: "2026-09-13T08:01:00.000Z"
    });
    const retry = await GenerationAttempt.create<GenerationAttempt>({
      generation_id: generation.id,
      provider: "fal_ai",
      attempt_number: 3,
      submission_status: "submitted",
      provider_status: "succeeded",
      next_check_at: "2026-09-13T09:00:00.000Z",
      created_at: "2026-09-13T08:02:00.000Z"
    });
    const due = await GenerationAttempt.recoverable("2026-09-13T10:00:00.000Z");
    expect(due.map((attempt) => attempt.id)).toEqual([ambiguous.id, retry.id]);
  });

  it("reclaims a completed row when output persistence is not ready", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "output-retry-claim",
      input_fingerprint: "hash"
    });
    await generation.update({
      status: "completed",
      provider_status: "succeeded",
      output_status: "retrying"
    });
    expect(
      await Prediction.claimGenerationLease(
        generation.id,
        "recovery-worker",
        "2026-09-13T10:00:00.000Z",
        "2026-09-13T10:01:00.000Z"
      )
    ).not.toBeNull();
  });

  it("settles the attachment projection of a leaseless terminal generation", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "attachment-settle",
      input_fingerprint: "hash"
    });
    await generation.update({
      status: "completed",
      provider_status: "succeeded",
      output_status: "ready",
      next_check_at: "2026-09-13T11:00:00.000Z"
    });
    // Terminal and ready: no worker can take a lease on it any more.
    expect(
      await Prediction.claimGenerationLease(
        generation.id,
        "recovery-worker",
        "2026-09-13T10:00:00.000Z",
        "2026-09-13T10:01:00.000Z"
      )
    ).toBeNull();

    expect(await Prediction.settleAttachments(generation.id, "attached")).toBe(
      true
    );
    const settled = await Prediction.find(generation.id);
    expect(settled?.attachment_status).toBe("attached");
    expect(settled?.next_check_at).toBeNull();
    // A settled projection never moves again.
    expect(
      await Prediction.settleAttachments(generation.id, "target_deleted")
    ).toBe(false);
    expect((await Prediction.find(generation.id))?.attachment_status).toBe(
      "attached"
    );
  });

  it("rejects a stale worker after an expired lease is reclaimed", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "stale",
      input_fingerprint: "a"
    });
    const first = await Prediction.claimGenerationLease(
      generation.id,
      "worker-a",
      "2026-09-13T10:00:00.000Z",
      "2026-09-13T10:01:00.000Z"
    );
    const second = await Prediction.claimGenerationLease(
      generation.id,
      "worker-b",
      "2026-09-13T10:02:00.000Z",
      "2026-09-13T10:03:00.000Z"
    );
    expect(first?.lease_version).toBe(1);
    expect(second?.lease_version).toBe(2);
    expect(
      await Prediction.transitionDurable(generation.id, "worker-a", 1, {
        provider_status: "running"
      })
    ).toBeNull();
    expect(
      await Prediction.transitionDurable(generation.id, "worker-b", 2, {
        provider_status: "running"
      })
    ).not.toBeNull();
  });

  it("keeps durable work out of the legacy interrupted sweep", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "durable-sweep",
      input_fingerprint: "a"
    });
    await generation.update({
      status: "running",
      started_at: "2026-09-13T08:00:00.000Z"
    });
    expect(
      await Prediction.sweepInterrupted("2026-09-13T09:00:00.000Z")
    ).toEqual([]);
    expect((await Prediction.find(generation.id))?.status).toBe("running");
  });

  it("derives monotonic public states while attachment retries remain visible", () => {
    const base = {
      status: "completed",
      submission_status: "submitted",
      provider_status: "succeeded",
      output_status: "ready",
      attachment_status: "retrying"
    };
    expect(deriveGenerationStatus(base)).toBe("completed");
    expect(deriveGenerationStatus({ ...base, output_status: "saving" })).toBe(
      "recovering"
    );
    expect(
      deriveGenerationStatus({
        ...base,
        provider_status: "failed",
        output_status: "pending"
      })
    ).toBe("failed");
    expect(
      deriveGenerationStatus({
        ...base,
        status: "cancelled",
        provider_status: "succeeded",
        output_status: "pending"
      })
    ).toBe("recovering");
    expect(
      deriveGenerationStatus({
        ...base,
        status: "running",
        provider_status: "cancelled",
        output_status: "pending"
      })
    ).toBe("cancelled");
    expect(deriveGenerationStatus({ ...base, status: "interrupted" })).toBe(
      "interrupted"
    );
  });

  it("deduplicates attempts, webhook deliveries, outputs, and attachments", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "records-1",
      input_fingerprint: "hash"
    });
    const attempt = await GenerationAttempt.create<GenerationAttempt>({
      generation_id: generation.id,
      provider: "fal_ai",
      attempt_number: 1,
      callback_token_hash: "token-hash"
    });
    expect(
      (await GenerationAttempt.findByCallbackTokenHash("token-hash"))?.id
    ).toBe(attempt.id);
    await expect(
      GenerationAttempt.create<GenerationAttempt>({
        generation_id: generation.id,
        provider: "fal_ai",
        attempt_number: 1
      })
    ).rejects.toThrow();
    const delivery = await GenerationWebhookDelivery.ingest({
      provider: "fal_ai",
      provider_account_ref: "acct",
      provider_request_id: "req",
      payload_hash: "body-hash",
      raw_payload: "{}"
    });
    const duplicate = await GenerationWebhookDelivery.ingest({
      provider: "fal_ai",
      provider_account_ref: "acct",
      provider_request_id: "req",
      payload_hash: "body-hash",
      raw_payload: "{}"
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.delivery.id).toBe(delivery.delivery.id);
    const output = await GenerationOutput.upsertOutput({
      generation_id: generation.id,
      attempt_id: attempt.id,
      output_key: "0",
      output_index: 0
    });
    const sameOutput = await GenerationOutput.upsertOutput({
      generation_id: generation.id,
      attempt_id: attempt.id,
      output_key: "0",
      output_index: 0
    });
    expect(sameOutput.id).toBe(output.id);
    const attachment = await GenerationAttachment.upsertAttachment({
      generation_id: generation.id,
      output_id: output.id,
      target_type: "storyboard_take",
      target_id: "take-1"
    });
    expect(
      (
        await GenerationAttachment.upsertAttachment({
          generation_id: generation.id,
          output_id: output.id,
          target_type: "storyboard_take",
          target_id: "take-1"
        })
      ).id
    ).toBe(attachment.id);
    expect(
      (
        await GenerationOutput.markSaved(
          output.id,
          "generation/key/0",
          "asset-1"
        )
      )?.status
    ).toBe("ready");
    expect(
      (
        await GenerationAttachment.transition(attachment.id, {
          status: "attached",
          selected: true
        })
      )?.selected
    ).toBe(true);
  });

  it("resolves callback tokens inside the models repository and scopes provider", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "callback-token-lookup",
      input_fingerprint: "hash"
    });
    const token = "secret-callback-token";
    const attempt = await GenerationAttempt.create<GenerationAttempt>({
      generation_id: generation.id,
      provider: "fal_ai",
      attempt_number: 1,
      callback_token_hash: createHash("sha256").update(token).digest("hex")
    });

    expect(
      (await GenerationAttempt.findByCallbackToken("fal_ai", token))?.id
    ).toBe(attempt.id);
    expect(
      await GenerationAttempt.findByCallbackToken("other_provider", token)
    ).toBeNull();
    expect(
      await GenerationAttempt.findByCallbackToken("fal_ai", "wrong-token")
    ).toBeNull();
  });

  it("fences output and attachment writes to the attempt lease", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "output-fence",
      input_fingerprint: "hash"
    });
    const { attempt } = await GenerationAttempt.ensureForGeneration({
      generation_id: generation.id,
      provider: "fal_ai"
    });
    const firstLease = await GenerationAttempt.claimLease(
      attempt.id,
      "worker-a",
      "2026-09-13T10:00:00.000Z",
      "2026-09-13T10:01:00.000Z"
    );
    const output = await GenerationOutput.upsertOutput({
      generation_id: generation.id,
      attempt_id: attempt.id,
      output_key: "result"
    });
    expect(
      await GenerationOutput.transition(
        output.id,
        { status: "ready", asset_id: "stale-asset" },
        {
          attemptId: attempt.id,
          workerId: "worker-a",
          leaseVersion: firstLease?.lease_version ?? -1
        }
      )
    ).not.toBeNull();

    const secondLease = await GenerationAttempt.claimLease(
      attempt.id,
      "worker-b",
      "2026-09-13T10:02:00.000Z",
      "2026-09-13T10:03:00.000Z"
    );
    const attachment = await GenerationAttachment.upsertAttachment({
      generation_id: generation.id,
      output_id: output.id,
      target_type: "storyboard_take",
      target_id: "take-1"
    });
    expect(
      await GenerationOutput.transition(
        output.id,
        { status: "ready", asset_id: "stale-worker-asset" },
        {
          attemptId: attempt.id,
          workerId: "worker-a",
          leaseVersion: firstLease?.lease_version ?? -1
        }
      )
    ).toBeNull();
    expect(
      await GenerationAttachment.transition(
        attachment.id,
        { status: "attached" },
        {
          attemptId: attempt.id,
          workerId: "worker-a",
          leaseVersion: firstLease?.lease_version ?? -1
        }
      )
    ).toBeNull();
    expect(
      await GenerationAttachment.transition(
        attachment.id,
        { status: "attached" },
        {
          attemptId: attempt.id,
          workerId: "worker-b",
          leaseVersion: secondLease?.lease_version ?? -1
        }
      )
    ).not.toBeNull();
  });

  it("does not regress a ready output or replay a processed terminal callback", async () => {
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "terminal-cas",
      input_fingerprint: "hash"
    });
    const { attempt } = await GenerationAttempt.ensureForGeneration({
      generation_id: generation.id,
      provider: "fal_ai"
    });
    const lease = await GenerationAttempt.claimLease(
      attempt.id,
      "worker-a",
      "2026-09-13T10:00:00.000Z",
      "2026-09-13T10:01:00.000Z"
    );
    const output = await GenerationOutput.upsertOutput({
      generation_id: generation.id,
      attempt_id: attempt.id,
      output_key: "image",
      provider_ref: "https://fal.media/image.png",
      raw_result: { url: "https://fal.media/image.png" }
    });
    expect(
      await GenerationOutput.markSaved(
        output.id,
        "generations/terminal-cas/image.bin",
        "asset-1",
        {
          attemptId: attempt.id,
          workerId: "worker-a",
          leaseVersion: lease?.lease_version ?? -1
        }
      )
    ).not.toBeNull();
    expect(
      await GenerationOutput.transition(
        output.id,
        { status: "retrying", error: "stale worker" },
        {
          attemptId: attempt.id,
          workerId: "worker-a",
          leaseVersion: lease?.lease_version ?? -1
        }
      )
    ).toBeNull();
    expect(
      (await GenerationOutput.get<GenerationOutput>(output.id))?.status
    ).toBe("ready");

    const delivery = await GenerationWebhookDelivery.ingest({
      provider: "fal_ai",
      provider_account_ref: "acct",
      provider_request_id: "request-terminal",
      payload_hash: "terminal-hash",
      raw_payload: '{"status":"OK"}'
    });
    const claimed = await GenerationWebhookDelivery.claim(
      delivery.delivery.id,
      "worker-a",
      "2026-09-13T10:00:00.000Z",
      "2026-09-13T10:01:00.000Z"
    );
    expect(claimed).not.toBeNull();
    expect(
      await GenerationWebhookDelivery.markConflictProcessed(
        delivery.delivery.id,
        "worker-a",
        claimed?.lease_version ?? -1,
        "contradictory terminal observation"
      )
    ).toBe(true);
    expect(
      (
        await GenerationWebhookDelivery.get<GenerationWebhookDelivery>(
          delivery.delivery.id
        )
      )?.status
    ).toBe("processed");
    expect(
      (
        await GenerationWebhookDelivery.get<GenerationWebhookDelivery>(
          delivery.delivery.id
        )
      )?.error
    ).toBe("contradictory terminal observation");
  });

  it("keeps accepted attempts and retained raw outputs in the recovery queue", async () => {
    const accepted = await Prediction.acceptGenerationWithAttempt({
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "accepted-restart",
      input_fingerprint: "hash"
    });
    const due = await GenerationAttempt.recoverable("2026-09-13T10:00:00.000Z");
    expect(due.some((attempt) => attempt.id === accepted.attempt.id)).toBe(
      true
    );

    const output = await GenerationOutput.upsertOutput({
      generation_id: accepted.generation.id,
      attempt_id: accepted.attempt.id,
      output_key: "image",
      raw_result: { url: "https://fal.media/retained.png" }
    });
    const lease = await GenerationAttempt.claimLease(
      accepted.attempt.id,
      "worker-a",
      "2026-09-13T10:00:00.000Z",
      "2026-09-13T10:01:00.000Z"
    );
    await GenerationOutput.transition(
      output.id,
      { status: "retrying", error: "object store unavailable" },
      {
        attemptId: accepted.attempt.id,
        workerId: "worker-a",
        leaseVersion: lease?.lease_version ?? -1
      }
    );
    const retained = await GenerationOutput.forAttempt(accepted.attempt.id);
    expect(retained[0]?.raw_result).toEqual({
      url: "https://fal.media/retained.png"
    });
    expect(retained[0]?.status).toBe("retrying");
  });
});
