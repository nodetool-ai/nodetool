import { randomUUID } from "node:crypto";
import {
  GenerationAttempt,
  GenerationAttachment,
  GenerationOutput,
  GenerationWebhookDelivery,
  Prediction
} from "@nodetool-ai/models";
import type { FalQueueOperations } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type {
  GenerationAttachmentTransition,
  GenerationOutputSaveState
} from "@nodetool-ai/models";
import {
  decodeFalOutputs,
  deterministicFalStorageKey,
  type FalOutputDescriptor
} from "./fal-output-decoder.js";

const log = createLogger("nodetool.execution.generation-recovery");

export interface DurableRecoveryProvider {
  queueFor(
    attempt: GenerationAttempt
  ): FalQueueOperations | Promise<FalQueueOperations>;
}

export interface DurableRecoverySubmission {
  readonly providerRequestId: string;
  readonly endpoint?: string | null;
  readonly gatewayRequestId?: string | null;
}

export interface DurableGenerationRecoveryOptions {
  readonly provider: DurableRecoveryProvider;
  readonly workerId?: string;
  readonly batchSize?: number;
  readonly leaseMs?: number;
  readonly now?: () => Date;
  /** Submit an accepted, never-submitted attempt. Never call this for
   * `submitting` or `submission_unknown`, because the paid POST is ambiguous. */
  readonly submitAccepted?: (
    generation: Prediction,
    attempt: GenerationAttempt
  ) => Promise<DurableRecoverySubmission>;
  /** Persist provider media and return its durable storage state. */
  readonly finalizeOutput?: (input: {
    readonly generation: Prediction;
    readonly attempt: GenerationAttempt;
    readonly payload: Record<string, unknown>;
    readonly descriptor: FalOutputDescriptor;
  }) => Promise<GenerationOutputSaveState>;
  /** Apply a destination-specific mutation after an output is saved. Returning
   * null leaves the durable attachment intent pending for a later adapter. */
  readonly attachOutput?: (input: {
    readonly generation: Prediction;
    readonly attempt: GenerationAttempt;
    readonly output: GenerationOutput;
    readonly attachment: GenerationAttachment;
  }) => Promise<GenerationAttachmentTransition | null>;
}

export interface DurableRecoveryRunResult {
  readonly deliveries: number;
  readonly polledAttempts: number;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
}

/** The instant a lease is claimed and when that claim expires. */
interface RecoveryLeaseWindow {
  readonly nowIso: string;
  readonly expiresAt: string;
}

interface LeaseHeartbeat {
  lost(): boolean;
  stop(): void;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsedRecord(
  value: string | null | undefined
): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function statusError(value: Record<string, unknown>): string | null {
  const error = value.error ?? value.error_type ?? value.payload_error;
  if (error == null || error === "") return null;
  return typeof error === "string" ? error : JSON.stringify(error);
}

const TERMINAL_ATTACHMENT_STATUSES = new Set([
  "attached",
  "superseded",
  "target_deleted"
]);

function attachmentIntents(
  generation: Prediction
): Array<Record<string, unknown>> {
  return Array.isArray(generation.metadata?.attachments)
    ? generation.metadata.attachments
        .map(record)
        .filter((value): value is Record<string, unknown> => value !== null)
    : [];
}

function isTerminalProjection(generation: Prediction): boolean {
  return (
    (generation.status === "completed" &&
      generation.provider_status === "succeeded" &&
      generation.output_status === "ready") ||
    generation.status === "failed" ||
    generation.status === "cancelled"
  );
}

/**
 * Bounded, lease-fenced finalization. Webhook rows are consumed before queue
 * polling, so a callback that arrived during a process restart wins without
 * spending another provider read. Every write is idempotent and guarded by
 * the generation and attempt lease versions.
 */
export class DurableGenerationRecoveryWorker {
  private readonly provider: DurableRecoveryProvider;
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private readonly finalizeOutput?: DurableGenerationRecoveryOptions["finalizeOutput"];
  private readonly submitAccepted?: DurableGenerationRecoveryOptions["submitAccepted"];
  private readonly attachOutput?: DurableGenerationRecoveryOptions["attachOutput"];
  private pass: Promise<DurableRecoveryRunResult> | null = null;

  constructor(options: DurableGenerationRecoveryOptions) {
    this.provider = options.provider;
    this.workerId = options.workerId ?? `generation-recovery:${randomUUID()}`;
    this.batchSize = Math.max(1, Math.min(options.batchSize ?? 50, 500));
    this.leaseMs = Math.max(
      5_000,
      Math.min(options.leaseMs ?? 60_000, 15 * 60_000)
    );
    this.now = options.now ?? (() => new Date());
    this.finalizeOutput = options.finalizeOutput;
    this.submitAccepted = options.submitAccepted;
    this.attachOutput = options.attachOutput;
  }

  /**
   * One pass at a time per instance. A pass polls the provider item by item,
   * so it can outlast the interval the host runs it on; a second overlapping
   * pass would reclaim leases the first still holds and redo its work.
   */
  async runOnce(): Promise<DurableRecoveryRunResult> {
    if (this.pass) return this.pass;
    this.pass = this.runPass().finally(() => {
      this.pass = null;
    });
    return this.pass;
  }

  /** A lease window measured at the moment of the claim it fences. A batch
   * can take longer than one lease, so a window minted for the whole batch
   * hands its last items an expiry that has already passed. */
  private leaseWindow(): RecoveryLeaseWindow {
    const now = this.now();
    return {
      nowIso: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.leaseMs).toISOString()
    };
  }

  private async runPass(): Promise<DurableRecoveryRunResult> {
    const result = {
      deliveries: 0,
      polledAttempts: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };
    const deliveries = await GenerationWebhookDelivery.pending(
      this.now().toISOString(),
      this.batchSize
    );
    for (const delivery of deliveries) {
      const { nowIso, expiresAt } = this.leaseWindow();
      const claimed = await GenerationWebhookDelivery.claim(
        delivery.id,
        this.workerId,
        nowIso,
        expiresAt
      );
      if (!claimed) {
        result.skipped++;
        continue;
      }
      result.deliveries++;
      let outcome: "completed" | "failed" | "skipped";
      try {
        outcome = await this.finalizeDelivery(claimed, nowIso, expiresAt);
      } catch (error) {
        // Storage/finalizer failures are retryable infrastructure failures,
        // not provider failures. Leave the leased delivery for its expiry so
        // another bounded pass can retry it.
        log.warn("Could not finalize FAL webhook delivery", {
          deliveryId: claimed.id,
          error: error instanceof Error ? error.message : String(error)
        });
        outcome = "skipped";
      }
      if (outcome === "completed") result.completed++;
      else if (outcome === "failed") result.failed++;
      else result.skipped++;
    }

    const remaining = Math.max(0, this.batchSize - result.deliveries);
    if (remaining > 0) {
      const attempts = await GenerationAttempt.recoverable(
        this.now().toISOString(),
        remaining
      );
      for (const attempt of attempts) {
        const { nowIso, expiresAt } = this.leaseWindow();
        let outcome: "completed" | "failed" | "skipped";
        try {
          outcome = await this.pollAttempt(attempt, nowIso, expiresAt);
        } catch (error) {
          log.warn("Could not finalize FAL recovery attempt", {
            attemptId: attempt.id,
            error: error instanceof Error ? error.message : String(error)
          });
          outcome = "skipped";
        }
        result.polledAttempts++;
        if (outcome === "completed") result.completed++;
        else if (outcome === "failed") result.failed++;
        else result.skipped++;
      }
    }
    return result;
  }

  private async finalizeDelivery(
    delivery: GenerationWebhookDelivery,
    nowIso: string,
    expiresAt: string
  ): Promise<"completed" | "failed" | "skipped"> {
    let attempt = delivery.attempt_id
      ? await GenerationAttempt.get<GenerationAttempt>(delivery.attempt_id)
      : await GenerationAttempt.findByProviderRequest(
          delivery.provider,
          delivery.provider_account_ref,
          delivery.provider_request_id
        );
    if (!attempt) {
      await GenerationWebhookDelivery.markProcessed(
        delivery.id,
        this.workerId,
        delivery.lease_version,
        "generation attempt no longer exists"
      );
      return "skipped";
    }
    const existingGeneration = await Prediction.find(attempt.generation_id);
    const deliveryStatus = asString(record(delivery.observation)?.status);
    const contradictoryTerminal = existingGeneration
      ? (existingGeneration.status === "completed" &&
          deliveryStatus === "ERROR") ||
        ((existingGeneration.status === "failed" ||
          existingGeneration.status === "cancelled") &&
          deliveryStatus === "OK")
      : false;
    if (contradictoryTerminal) {
      if (!attempt.provider_request_id) return "skipped";
      let recheck: string;
      try {
        const queue = await this.provider.queueFor(attempt);
        const binding = await queue.bind({
          provider: "fal_ai",
          endpoint: attempt.endpoint ?? "",
          providerRequestId: attempt.provider_request_id,
          requestId: attempt.provider_request_id
        });
        const observation = await queue.wait(binding, {
          signal: AbortSignal.timeout(5_000),
          pollIntervalMs: 500
        });
        recheck = `provider recheck reported ${observation.state}`;
      } catch (error) {
        const state =
          error && typeof error === "object" && "state" in error
            ? asString(error.state)
            : null;
        if (!state) return "skipped";
        recheck = `provider recheck reported ${state}`;
      }
      await GenerationWebhookDelivery.markConflictProcessed(
        delivery.id,
        this.workerId,
        delivery.lease_version,
        `callback status ${deliveryStatus} contradicts terminal generation ${existingGeneration?.status}; ${recheck}`
      );
      return "skipped";
    }
    if (existingGeneration && isTerminalProjection(existingGeneration)) {
      if (
        attempt.provider_request_id &&
        attempt.provider_request_id !== delivery.provider_request_id
      ) {
        await GenerationWebhookDelivery.markConflictProcessed(
          delivery.id,
          this.workerId,
          delivery.lease_version,
          "callback request ID conflicts with the bound attempt"
        );
        return "skipped";
      }
      const claimed = await GenerationAttempt.claimLease(
        attempt.id,
        this.workerId,
        nowIso,
        expiresAt
      );
      if (!claimed) return "skipped";
      const outputs =
        typeof GenerationOutput.forAttempt === "function"
          ? await GenerationOutput.forAttempt(claimed.id)
          : [];
      const attachments = await this.retryPendingAttachments(
        claimed,
        existingGeneration,
        outputs
      );
      if (attachments === "skipped") return "skipped";
      await this.settleAttachmentProjection(existingGeneration, attachments);
      const nextCheckAt =
        attachments === "pending"
          ? new Date(this.now().getTime() + this.leaseMs).toISOString()
          : null;
      if (
        !(await GenerationAttempt.transition(
          claimed.id,
          this.workerId,
          claimed.lease_version,
          {
            submission_status: "submitted",
            provider_status:
              existingGeneration.status === "completed"
                ? "succeeded"
                : existingGeneration.status === "cancelled"
                  ? "cancelled"
                  : "failed",
            last_error: existingGeneration.error ?? null,
            next_check_at: nextCheckAt
          }
        ))
      )
        return "skipped";
      await GenerationWebhookDelivery.markProcessed(
        delivery.id,
        this.workerId,
        delivery.lease_version,
        null
      );
      return "skipped";
    }
    const claimed = await GenerationAttempt.claimLease(
      attempt.id,
      this.workerId,
      nowIso,
      expiresAt
    );
    if (!claimed) return "skipped";
    attempt = claimed;
    let observation: unknown = delivery.observation;
    if (!attempt.provider_request_id) {
      try {
        const generation = await Prediction.find(attempt.generation_id);
        if (!generation) return "skipped";
        const queue = await this.provider.queueFor(attempt);
        const binding = await queue.bind({
          provider: "fal_ai",
          endpoint: attempt.endpoint ?? "",
          providerRequestId: delivery.provider_request_id,
          requestId: delivery.provider_request_id
        });
        const verified = await queue.wait(binding, {
          signal: AbortSignal.timeout(5_000),
          pollIntervalMs: 500
        });
        const adopted = await GenerationAttempt.bindProviderRequest(
          attempt.id,
          this.workerId,
          attempt.lease_version,
          delivery.provider_request_id
        );
        if (!adopted) {
          const current = await GenerationAttempt.get<GenerationAttempt>(
            attempt.id
          );
          if (current?.provider_request_id !== delivery.provider_request_id) {
            await GenerationWebhookDelivery.markConflictProcessed(
              delivery.id,
              this.workerId,
              delivery.lease_version,
              "callback request ID could not be authenticated to the attempt"
            );
            return "skipped";
          }
        }
        observation = verified;
        attempt =
          (await GenerationAttempt.get<GenerationAttempt>(attempt.id)) ??
          attempt;
      } catch {
        return "skipped";
      }
    } else if (attempt.provider_request_id !== delivery.provider_request_id) {
      await GenerationWebhookDelivery.markConflictProcessed(
        delivery.id,
        this.workerId,
        delivery.lease_version,
        "callback request ID conflicts with the bound attempt"
      );
      return "skipped";
    }
    const callback = record(observation);
    const callbackStatus = asString(callback?.status);
    // fal OK callbacks can omit the result or report payload_error. They are
    // success evidence, not provider failures. Re-read the authoritative
    // result through the attempt's authenticated queue adapter.
    if (
      callbackStatus === "OK" &&
      (callback?.payload_error != null ||
        (!record(callback?.payload) &&
          !record(callback?.result) &&
          !record(callback?.data)))
    ) {
      try {
        const providerRequestId = attempt.provider_request_id;
        if (!providerRequestId) return "skipped";
        const queue = await this.provider.queueFor(attempt);
        const binding = await queue.bind({
          provider: "fal_ai",
          endpoint: attempt.endpoint ?? "",
          providerRequestId,
          requestId: providerRequestId
        });
        observation = await queue.wait(binding, {
          signal: AbortSignal.timeout(5_000),
          pollIntervalMs: 500
        });
      } catch {
        return "skipped";
      }
    }
    const outcome = await this.finalizeAttempt(
      attempt,
      observation,
      nowIso,
      expiresAt,
      true
    );
    if (outcome === "skipped") return "skipped";
    await GenerationWebhookDelivery.markProcessed(
      delivery.id,
      this.workerId,
      delivery.lease_version,
      outcome === "failed" ? "provider returned an error" : null
    );
    return outcome;
  }

  private async pollAttempt(
    attempt: GenerationAttempt,
    nowIso: string,
    expiresAt: string
  ): Promise<"completed" | "failed" | "skipped"> {
    const claimed = await GenerationAttempt.claimLease(
      attempt.id,
      this.workerId,
      nowIso,
      expiresAt
    );
    if (!claimed) return "skipped";
    const generation = await Prediction.find(claimed.generation_id);
    if (!generation) return "skipped";
    if (isTerminalProjection(generation)) {
      const storedOutputs =
        typeof GenerationOutput.forAttempt === "function"
          ? await GenerationOutput.forAttempt(claimed.id)
          : [];
      const attachments = await this.retryPendingAttachments(
        claimed,
        generation,
        storedOutputs
      );
      if (attachments === "skipped") return "skipped";
      await this.settleAttachmentProjection(generation, attachments);
      await GenerationAttempt.transition(
        claimed.id,
        this.workerId,
        claimed.lease_version,
        {
          submission_status: "submitted",
          provider_status:
            generation.status === "completed"
              ? "succeeded"
              : generation.status === "cancelled"
                ? "cancelled"
                : "failed",
          last_error: generation.error ?? null,
          next_check_at:
            attachments === "pending"
              ? new Date(this.now().getTime() + this.leaseMs).toISOString()
              : null
        }
      );
      return "skipped";
    }
    const storedRetry = await this.retryStoredOutputs(
      claimed,
      generation,
      nowIso,
      expiresAt
    );
    if (storedRetry !== null) return storedRetry;
    if (!claimed.provider_request_id) {
      if (claimed.submission_status === "accepted" && this.submitAccepted) {
        const submitting = await GenerationAttempt.transition(
          claimed.id,
          this.workerId,
          claimed.lease_version,
          { submission_status: "submitting", next_check_at: null }
        );
        if (!submitting) return "skipped";
        try {
          const submission = await this.submitAccepted(generation, claimed);
          if (!submission.providerRequestId)
            throw new Error("submission did not return a request ID");
          const bound = await GenerationAttempt.bindProviderRequest(
            claimed.id,
            this.workerId,
            claimed.lease_version,
            submission.providerRequestId
          );
          if (!bound) return "skipped";
          if (
            !(await GenerationAttempt.transition(
              claimed.id,
              this.workerId,
              claimed.lease_version,
              {
                provider_request_id: submission.providerRequestId,
                gateway_request_id: submission.gatewayRequestId ?? null,
                submission_status: "submitted",
                provider_status: "queued",
                next_check_at: null
              }
            ))
          )
            return "skipped";
          return "skipped";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await GenerationAttempt.transition(
            claimed.id,
            this.workerId,
            claimed.lease_version,
            {
              submission_status: "submission_unknown",
              provider_status: "unknown",
              last_error: message,
              next_check_at: new Date(
                this.now().getTime() + this.leaseMs
              ).toISOString()
            }
          );
          return "skipped";
        }
      }
      await GenerationAttempt.transition(
        claimed.id,
        this.workerId,
        claimed.lease_version,
        {
          submission_status: "submission_unknown",
          provider_status: "unknown",
          next_check_at: new Date(
            this.now().getTime() + this.leaseMs
          ).toISOString()
        }
      );
      return "skipped";
    }
    if (generation.cancel_requested_at || claimed.cancel_requested_at) {
      try {
        const queue = await this.provider.queueFor(claimed);
        if (claimed.endpoint) {
          const binding = await queue.bind({
            provider: "fal_ai",
            endpoint: claimed.endpoint,
            providerRequestId: claimed.provider_request_id,
            requestId: claimed.provider_request_id
          });
          await queue.cancel(binding);
        }
      } catch (error) {
        log.warn("Could not cancel FAL request during recovery", {
          generationId: claimed.generation_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    try {
      const queue = await this.provider.queueFor(claimed);
      const binding = await queue.bind({
        provider: "fal_ai",
        endpoint: claimed.endpoint ?? "",
        providerRequestId: claimed.provider_request_id,
        requestId: claimed.provider_request_id
      });
      const observation = await queue.wait(binding, {
        signal: AbortSignal.timeout(5_000),
        pollIntervalMs: 500
      });
      return this.finalizeAttempt(
        claimed,
        observation,
        nowIso,
        expiresAt,
        true
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await GenerationAttempt.transition(
        claimed.id,
        this.workerId,
        claimed.lease_version,
        {
          // A bound request remains submitted when a status/result read times
          // out. Only an ambiguous submit is submission_unknown.
          submission_status: "submitted",
          provider_status: "unknown",
          last_error: message,
          next_check_at: new Date(
            this.now().getTime() + this.leaseMs
          ).toISOString()
        }
      );
      return "skipped";
    }
  }

  private async finalizeAttempt(
    attempt: GenerationAttempt,
    rawObservation: unknown,
    nowIso: string,
    expiresAt: string,
    attemptAlreadyClaimed = false
  ): Promise<"completed" | "failed" | "skipped"> {
    const generation = await Prediction.find(attempt.generation_id);
    if (!generation) return "skipped";
    const observation = record(rawObservation) ?? {};
    const status = asString(observation.status);
    const error =
      status === "ERROR" ? statusError(observation) : statusError(observation);
    const payload =
      observation.payload ?? observation.result ?? observation.data;
    const attemptLease = attemptAlreadyClaimed
      ? attempt
      : await GenerationAttempt.claimLease(
          attempt.id,
          this.workerId,
          nowIso,
          expiresAt
        );
    if (!attemptLease) return "skipped";
    const generationLease = await Prediction.claimGenerationLease(
      generation.id,
      this.workerId,
      nowIso,
      expiresAt
    );
    if (!generationLease) return "skipped";
    const heartbeat = this.startLeaseRenewal(attemptLease, generationLease);
    try {
      return await this.finalizeAttemptWithLeases(
        attempt,
        generation,
        observation,
        status,
        error,
        payload,
        nowIso,
        attemptLease,
        generationLease,
        heartbeat
      );
    } finally {
      heartbeat.stop();
    }
  }

  /** Retry durable output saves from the committed raw result before asking
   * fal for a queue result. This is important after result retention expires
   * or after a crash between object upload and the output-row CAS. */
  private async retryStoredOutputs(
    attempt: GenerationAttempt,
    generation: Prediction,
    nowIso: string,
    expiresAt: string
  ): Promise<"completed" | "failed" | "skipped" | null> {
    // Older hosts may not expose the optional output query yet. In that case
    // fall through to the authenticated queue lookup.
    if (typeof GenerationOutput.forAttempt !== "function") return null;
    const outputs = await GenerationOutput.forAttempt(attempt.id);
    if (outputs.length === 0) return null;
    const retryable = outputs.filter(
      (output) =>
        output.status !== "ready" &&
        output.raw_result !== null &&
        this.finalizeOutput !== undefined
    );
    if (retryable.length === 0) {
      const attachments = await this.retryPendingAttachments(
        attempt,
        generation,
        outputs
      );
      if (attachments === "skipped") return "skipped";
      if (attachments === "pending") {
        await GenerationAttempt.transition(
          attempt.id,
          this.workerId,
          attempt.lease_version,
          {
            next_check_at: new Date(
              this.now().getTime() + this.leaseMs
            ).toISOString()
          }
        );
        return "skipped";
      }
      return this.repairFromStoredOutputs(
        attempt,
        generation,
        outputs,
        attachments,
        nowIso,
        expiresAt
      );
    }
    const generationLease = await Prediction.claimGenerationLease(
      generation.id,
      this.workerId,
      nowIso,
      expiresAt
    );
    if (!generationLease) return "skipped";
    const heartbeat = this.startLeaseRenewal(attempt, generationLease);
    try {
      const states = new Map<string, GenerationOutputSaveState>();
      for (const output of outputs) {
        if (output.status === "ready") {
          states.set(output.id, {
            status: "ready",
            storage_key: output.storage_key,
            asset_id: output.asset_id,
            provider_ref: output.provider_ref,
            raw_result: output.raw_result
          });
          continue;
        }
        if (!output.raw_result || !this.finalizeOutput) {
          states.set(output.id, { status: output.status as "pending" });
          continue;
        }
        if (heartbeat.lost()) return "skipped";
        const saving = await GenerationOutput.transition(
          output.id,
          {
            status: "saving",
            provider_ref: output.provider_ref,
            raw_result: output.raw_result
          },
          {
            attemptId: attempt.id,
            workerId: this.workerId,
            leaseVersion: attempt.lease_version
          }
        );
        if (!saving) return "skipped";
        let savedState: GenerationOutputSaveState;
        try {
          savedState = await this.finalizeOutput({
            generation,
            attempt,
            payload: output.raw_result,
            descriptor: {
              outputKey: output.output_key,
              outputIndex: output.output_index,
              outputType:
                output.output_type === "structured" ? "structured" : "media",
              providerRef: output.provider_ref,
              rawResult: output.raw_result,
              storageKey: deterministicFalStorageKey(
                generation.id,
                attempt.id,
                output.output_key,
                output.output_index
              ),
              existingStorageKey: output.storage_key,
              existingAssetId: output.asset_id
            }
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const retrying = await GenerationOutput.transition(
            output.id,
            {
              status: "retrying",
              error: message,
              provider_ref: output.provider_ref,
              raw_result: output.raw_result
            },
            {
              attemptId: attempt.id,
              workerId: this.workerId,
              leaseVersion: attempt.lease_version
            }
          );
          if (!retrying) return "skipped";
          states.set(output.id, { status: "retrying", error: message });
          continue;
        }
        const saved = await GenerationOutput.transition(output.id, savedState, {
          attemptId: attempt.id,
          workerId: this.workerId,
          leaseVersion: attempt.lease_version
        });
        if (!saved || heartbeat.lost()) return "skipped";
        states.set(output.id, savedState);
      }
      const allReady =
        outputs.length > 0 &&
        outputs.every((output) => states.get(output.id)?.status === "ready");
      const hasRetrying = [...states.values()].some(
        (state) => state.status === "retrying"
      );
      const refreshedOutputs = await GenerationOutput.forAttempt(attempt.id);
      const attachments = await this.retryPendingAttachments(
        attempt,
        generation,
        refreshedOutputs
      );
      if (attachments === "skipped") return "skipped";
      const nextCheckAt =
        hasRetrying || attachments === "pending"
          ? new Date(this.now().getTime() + this.leaseMs).toISOString()
          : null;
      const stagedNextCheckAt =
        nextCheckAt ??
        new Date(this.now().getTime() + this.leaseMs).toISOString();
      if (heartbeat.lost()) return "skipped";
      if (
        !(await GenerationAttempt.transition(
          attempt.id,
          this.workerId,
          attempt.lease_version,
          {
            provider_status: "succeeded",
            submission_status: "submitted",
            next_check_at: stagedNextCheckAt
          }
        ))
      )
        return "skipped";
      if (heartbeat.lost()) return "skipped";
      if (
        !(await Prediction.transitionDurable(
          generation.id,
          this.workerId,
          generationLease.lease_version,
          {
            status: allReady ? "completed" : "recovering",
            provider_status: "succeeded",
            output_status: allReady ? "ready" : "retrying",
            attachment_status:
              attachments === "complete" ? "attached" : "pending",
            asset_ids: [...states.values()]
              .map((state) => state.asset_id)
              .filter((id): id is string => typeof id === "string"),
            next_check_at: nextCheckAt,
            completed_at: allReady ? this.now().toISOString() : null
          }
        ))
      )
        return "skipped";
      if (!nextCheckAt) {
        if (
          !(await GenerationAttempt.transition(
            attempt.id,
            this.workerId,
            attempt.lease_version,
            { next_check_at: null }
          ))
        ) {
          return "skipped";
        }
      }
      return allReady && attachments !== "pending" ? "completed" : "skipped";
    } finally {
      heartbeat.stop();
    }
  }

  /**
   * Commit the terminal generation from output rows that are already saved.
   * The attempt's recorded provider result is the manifest of a complete
   * result: every output identity it names must have a ready row before the
   * generation is called completed, so a crash halfway through recording a
   * multi-output result still falls back to the provider. Returning null means
   * the state could not be repaired locally.
   */
  private async repairFromStoredOutputs(
    attempt: GenerationAttempt,
    generation: Prediction,
    outputs: GenerationOutput[],
    attachments: "pending" | "complete" | "skipped" | null,
    nowIso: string,
    expiresAt: string
  ): Promise<"completed" | "skipped" | null> {
    const manifest = parsedRecord(attempt.raw_result_ref);
    if (!manifest) return null;
    const ready = new Map(
      outputs
        .filter((output) => output.status === "ready")
        .map((output) => [
          `${output.output_key}:${output.output_index}`,
          output
        ])
    );
    const expected = decodeFalOutputs(manifest);
    if (
      expected.length === 0 ||
      expected.some(
        (descriptor) =>
          !ready.has(`${descriptor.outputKey}:${descriptor.outputIndex}`)
      )
    ) {
      return null;
    }
    const generationLease = await Prediction.claimGenerationLease(
      generation.id,
      this.workerId,
      nowIso,
      expiresAt
    );
    if (!generationLease) return "skipped";
    if (
      !(await Prediction.transitionDurable(
        generation.id,
        this.workerId,
        generationLease.lease_version,
        {
          status: "completed",
          submission_status: "submitted",
          provider_status: "succeeded",
          provider_request_id: attempt.provider_request_id,
          output_status: "ready",
          attachment_status:
            attachments === "complete" ? "attached" : "pending",
          error: null,
          asset_ids: [...ready.values()]
            .map((output) => output.asset_id)
            .filter((id): id is string => typeof id === "string"),
          next_check_at: null,
          completed_at: this.now().toISOString()
        }
      ))
    )
      return "skipped";
    if (
      !(await GenerationAttempt.transition(
        attempt.id,
        this.workerId,
        attempt.lease_version,
        {
          submission_status: "submitted",
          provider_status: "succeeded",
          last_error: null,
          next_check_at: null
        }
      ))
    )
      return "skipped";
    return "completed";
  }

  private startLeaseRenewal(
    attempt: GenerationAttempt,
    generation: Prediction
  ): LeaseHeartbeat {
    let leaseLost = false;
    let stopped = false;
    let renewing = false;
    const renew = async (): Promise<void> => {
      if (stopped || renewing || leaseLost) return;
      renewing = true;
      try {
        const expiresAt = new Date(
          this.now().getTime() + this.leaseMs
        ).toISOString();
        const [attemptRenewed, generationRenewed] = await Promise.all([
          typeof GenerationAttempt.renewLease === "function"
            ? GenerationAttempt.renewLease(
                attempt.id,
                this.workerId,
                attempt.lease_version,
                expiresAt
              )
            : true,
          typeof Prediction.renewGenerationLease === "function"
            ? Prediction.renewGenerationLease(
                generation.id,
                this.workerId,
                generation.lease_version,
                expiresAt
              )
            : true
        ]);
        if (!attemptRenewed || !generationRenewed) leaseLost = true;
      } catch {
        leaseLost = true;
      } finally {
        renewing = false;
      }
    };
    const timer = setInterval(
      () => void renew(),
      Math.max(1_000, Math.floor(this.leaseMs / 3))
    );
    return {
      lost: () => leaseLost,
      stop: () => {
        stopped = true;
        clearInterval(timer);
      }
    };
  }

  private async finalizeAttemptWithLeases(
    attempt: GenerationAttempt,
    generation: Prediction,
    observation: Record<string, unknown>,
    status: string | null,
    error: string | null,
    payload: unknown,
    nowIso: string,
    attemptLease: GenerationAttempt,
    generationLease: Prediction,
    heartbeat: { lost: () => boolean }
  ): Promise<"completed" | "failed" | "skipped"> {
    if (heartbeat.lost()) return "skipped";
    const queueState = asString(observation.state);
    const terminalFailure =
      status === "ERROR" ||
      queueState === "failed" ||
      queueState === "cancelled";
    const terminalError =
      error ??
      (queueState === "failed"
        ? "provider queue reported failure"
        : queueState === "cancelled"
          ? "provider request was cancelled"
          : status === "ERROR"
            ? "provider returned an error"
            : null);
    if (terminalFailure && terminalError) {
      if (
        !(await Prediction.transitionDurable(
          generation.id,
          this.workerId,
          generationLease.lease_version,
          {
            status: queueState === "cancelled" ? "cancelled" : "failed",
            provider_status:
              queueState === "cancelled" ? "cancelled" : "failed",
            output_status: "unavailable",
            error: terminalError,
            completed_at: nowIso
          }
        ))
      )
        return "skipped";
      if (heartbeat.lost()) return "skipped";
      if (
        !(await GenerationAttempt.transition(
          attempt.id,
          this.workerId,
          attemptLease.lease_version,
          {
            submission_status: "submitted",
            provider_status:
              queueState === "cancelled" ? "cancelled" : "failed",
            last_error: terminalError,
            next_check_at: null
          }
        ))
      )
        return "skipped";
      return queueState === "cancelled" ? "skipped" : "failed";
    }
    if (queueState === "queued" || queueState === "running") {
      return (await GenerationAttempt.transition(
        attempt.id,
        this.workerId,
        attemptLease.lease_version,
        {
          submission_status: "submitted",
          provider_status: queueState,
          next_check_at: new Date(
            this.now().getTime() + Math.min(this.leaseMs, 60_000)
          ).toISOString()
        }
      ))
        ? "skipped"
        : "skipped";
    }
    if (error) return "skipped";

    const output = record(payload);
    if (!output) {
      log.warn("FAL generation completed without an object payload", {
        generationId: generation.id
      });
      if (
        !(await GenerationAttempt.transition(
          attemptLease.id,
          this.workerId,
          attemptLease.lease_version,
          {
            provider_status: "succeeded",
            next_check_at: new Date(
              this.now().getTime() + this.leaseMs
            ).toISOString()
          }
        ))
      )
        return "skipped";
      return "skipped";
    }
    const descriptors = decodeFalOutputs(output);
    // Record the complete provider result before the first output row is
    // written. A later pass reads it back as the manifest of what this result
    // contains, so a crash before the generation projection can be repaired
    // from the saved rows instead of another paid provider read.
    if (
      !(await GenerationAttempt.transition(
        attempt.id,
        this.workerId,
        attemptLease.lease_version,
        { raw_result_ref: JSON.stringify(output) }
      ))
    )
      return "skipped";
    const outputStates: GenerationOutputSaveState[] = [];
    const persistedOutputs: GenerationOutput[] = [];
    for (const descriptor of descriptors) {
      const persisted = await GenerationOutput.upsertOutput({
        generation_id: generation.id,
        attempt_id: attempt.id,
        output_key: descriptor.outputKey,
        output_index: descriptor.outputIndex,
        output_type: descriptor.outputType,
        provider_ref: descriptor.providerRef,
        raw_result: descriptor.rawResult
      });
      // A restart after the storage commit must reuse the existing output and
      // asset instead of downloading or creating another asset.
      if (persisted.status === "ready") {
        persistedOutputs.push(persisted);
        outputStates.push({
          status: "ready",
          provider_ref: persisted.provider_ref,
          raw_result: persisted.raw_result,
          storage_key: persisted.storage_key,
          asset_id: persisted.asset_id
        });
        continue;
      }
      const saving = await GenerationOutput.transition(
        persisted.id,
        {
          status: "saving",
          provider_ref: descriptor.providerRef,
          raw_result: descriptor.rawResult
        },
        {
          attemptId: attemptLease.id,
          workerId: this.workerId,
          leaseVersion: attemptLease.lease_version
        }
      );
      if (!saving || heartbeat.lost()) return "skipped";
      let outputState: GenerationOutputSaveState;
      try {
        outputState = this.finalizeOutput
          ? await this.finalizeOutput({
              generation,
              attempt,
              payload: output,
              descriptor: {
                ...descriptor,
                storageKey: deterministicFalStorageKey(
                  generation.id,
                  attempt.id,
                  descriptor.outputKey,
                  descriptor.outputIndex
                ),
                // A finalizer can use these to make a storage retry reuse a
                // deterministic object rather than uploading a second copy.
                existingStorageKey: persisted.storage_key,
                existingAssetId: persisted.asset_id
              }
            })
          : { status: "saving", raw_result: descriptor.rawResult };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retrying = await GenerationOutput.transition(
          persisted.id,
          {
            status: "retrying",
            error: message,
            provider_ref: descriptor.providerRef,
            raw_result: descriptor.rawResult
          },
          {
            attemptId: attemptLease.id,
            workerId: this.workerId,
            leaseVersion: attemptLease.lease_version
          }
        );
        if (!retrying) return "skipped";
        outputStates.push({ status: "retrying", error: message });
        continue;
      }
      if (this.finalizeOutput || outputState.status !== "saving") {
        const saved = await GenerationOutput.transition(
          persisted.id,
          outputState,
          {
            attemptId: attemptLease.id,
            workerId: this.workerId,
            leaseVersion: attemptLease.lease_version
          }
        );
        if (!saved || heartbeat.lost()) return "skipped";
        if (saved.status === "ready") {
          persistedOutputs.push(saved);
        }
      }
      outputStates.push(outputState);
    }
    const attachments = await this.retryPendingAttachments(
      attemptLease,
      generation,
      persistedOutputs
    );
    if (attachments === "skipped") return "skipped";
    const hasRetryingOutput = outputStates.some(
      (state) => state.status === "retrying"
    );
    const hasSavingOutput = outputStates.some(
      (state) => state.status === "saving"
    );
    const hasUnavailableOutput = outputStates.some(
      (state) => state.status === "unavailable"
    );
    const allReady = outputStates.every((state) => state.status === "ready");
    const nextCheckAt =
      hasRetryingOutput || attachments === "pending"
        ? new Date(this.now().getTime() + this.leaseMs).toISOString()
        : null;
    // Keep the attempt scheduled until the generation projection commits. If
    // a crash or lease loss happens between these writes, the next pass can
    // repair the terminal generation instead of losing the attempt forever.
    const stagedNextCheckAt =
      nextCheckAt ??
      new Date(this.now().getTime() + this.leaseMs).toISOString();
    if (heartbeat.lost()) return "skipped";
    if (
      !(await GenerationAttempt.transition(
        attempt.id,
        this.workerId,
        attemptLease.lease_version,
        {
          submission_status: "submitted",
          provider_status: "succeeded",
          last_error: null,
          next_check_at: stagedNextCheckAt
        }
      ))
    )
      return "skipped";
    if (heartbeat.lost()) return "skipped";
    const projected = await Prediction.transitionDurable(
      generation.id,
      this.workerId,
      generationLease.lease_version,
      {
        status: allReady ? "completed" : "recovering",
        provider_status: "succeeded",
        provider_request_id: attempt.provider_request_id,
        output_status: allReady
          ? "ready"
          : hasUnavailableOutput
            ? "unavailable"
            : hasRetryingOutput
              ? "retrying"
              : hasSavingOutput
                ? "saving"
                : "saving",
        // Intent creation is not a destination mutation. Keep it pending
        // until a destination-specific adapter commits the attachment.
        attachment_status: "pending",
        error: null,
        asset_ids: outputStates
          .map((state) => state.asset_id)
          .filter((id): id is string => typeof id === "string"),
        next_check_at: nextCheckAt,
        completed_at: allReady ? nowIso : null
      }
    );
    if (!projected) {
      const current = await Prediction.find(generation.id);
      const alreadyProjected = current
        ? hasRetryingOutput
          ? current.provider_status === "succeeded" &&
            current.output_status === "retrying"
          : current.provider_status === "succeeded" &&
            current.output_status === "ready"
        : false;
      if (!alreadyProjected) return "skipped";
    }
    if (!nextCheckAt) {
      if (
        !(await GenerationAttempt.transition(
          attempt.id,
          this.workerId,
          attemptLease.lease_version,
          { next_check_at: null }
        ))
      )
        return "skipped";
    }
    return allReady ? "completed" : hasUnavailableOutput ? "failed" : "skipped";
  }

  /** Record on the generation that its destination work is done. A generation
   * whose media is saved and ready is terminal and holds no lease, so the
   * projection cannot ride on a fenced transition. */
  private async settleAttachmentProjection(
    generation: Prediction,
    attachments: "pending" | "complete" | "skipped" | null
  ): Promise<void> {
    if (attachments !== "complete") return;
    if (generation.attachment_status === "attached") return;
    await Prediction.settleAttachments(generation.id, "attached");
  }

  /** Apply each destination intent independently. A ready output can be
   * retried after its generation is terminal, so attachment work must not be
   * coupled to provider polling or storage retries. */
  private async retryPendingAttachments(
    attempt: GenerationAttempt,
    generation: Prediction,
    outputs: GenerationOutput[]
  ): Promise<"pending" | "complete" | "skipped" | null> {
    const intents = attachmentIntents(generation);
    if (intents.length === 0 || !this.attachOutput) return null;
    let pendingCount = 0;
    for (const intent of intents) {
      const targetType = asString(intent.target_type);
      const targetId = asString(intent.target_id);
      if (!targetType || !targetId) continue;
      const outputKey = asString(intent.output_key);
      const outputIndex =
        typeof intent.output_index === "number" ? intent.output_index : 0;
      // An intent without an output key means "the media this generation
      // produced". A structured row carries no asset, so attaching it could
      // never succeed and would reschedule the attempt forever.
      const output = outputKey
        ? outputs.find(
            (candidate) =>
              candidate.output_key === outputKey &&
              candidate.output_index === outputIndex
          )
        : (outputs.find(
            (candidate) =>
              candidate.output_type === "media" && Boolean(candidate.asset_id)
          ) ??
          outputs.find((candidate) => candidate.output_type === "media") ??
          outputs[0]);
      if (!output || output.status !== "ready") {
        pendingCount++;
        continue;
      }
      const attachment = await GenerationAttachment.upsertAttachment({
        generation_id: generation.id,
        output_id: output.id,
        target_type: targetType,
        target_id: targetId,
        selected: intent.selected === true
      });
      if (TERMINAL_ATTACHMENT_STATUSES.has(attachment.status)) continue;
      pendingCount++;
      let change: GenerationAttachmentTransition | null;
      try {
        change = await this.attachOutput({
          generation,
          attempt,
          output,
          attachment
        });
      } catch (error) {
        change = {
          status: "retrying",
          error: error instanceof Error ? error.message : String(error)
        };
      }
      if (!change || change.status === "pending") continue;
      const transitioned = await GenerationAttachment.transition(
        attachment.id,
        change,
        {
          attemptId: attempt.id,
          workerId: this.workerId,
          leaseVersion: attempt.lease_version
        }
      );
      if (!transitioned) return "skipped";
      if (TERMINAL_ATTACHMENT_STATUSES.has(transitioned.status)) {
        pendingCount--;
      }
    }
    return pendingCount > 0 ? "pending" : "complete";
  }
}
