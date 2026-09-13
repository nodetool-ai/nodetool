import { createHash, randomUUID } from "node:crypto";
import {
  GenerationAttempt,
  Prediction,
  type DurableAcceptance,
  type DurableGenerationInput,
  type DurableGenerationTransition,
  type GenerationAttemptObservation,
  type GenerationOutputSaveState,
  type GenerationAttachmentTransition,
  type GenerationAttemptLeaseFence,
  GenerationOutput,
  GenerationAttachment
} from "@nodetool-ai/models";
import type {
  GenerationLifecycleHooks,
  GenerationProviderRequestOptions,
  GenerationRequest
} from "@nodetool-ai/runtime";
import { decodeFalOutputs } from "./fal-output-decoder.js";

export interface GenerationLeaseWindow {
  now: string;
  expiresAt: string;
}

export interface DurableGenerationAcceptance extends DurableAcceptance {
  attempt: GenerationAttempt;
}

export interface FalGenerationLifecycleHooksOptions {
  readonly userId: string;
  readonly jobId?: string | null;
  readonly projectId?: string | null;
  readonly providerAccountRef?: string | null;
  /** Public HTTPS origin used for signed FAL callbacks. */
  readonly publicUrl?: string | null;
  /** Disable callback generation while retaining durable queue tracking. */
  readonly callbacks?: boolean;
  /** Encrypt callback tokens before they are persisted. */
  readonly encryptCallbackToken?: (
    token: string,
    userId: string
  ) => string | null | undefined;
  /** Optional persistence seam for hosts that already own a lifecycle. */
  readonly lifecycle?: DurableGenerationLifecycle;
}

interface FalGenerationState {
  readonly generationId: string;
  readonly attemptId: string;
  readonly workerId: string;
  readonly generationLeaseVersion: number;
  readonly attemptLeaseVersion: number;
  readonly heartbeat: LeaseHeartbeat;
}

interface LeaseHeartbeat {
  lost(): boolean;
  stop(): void;
}

const LIVE_LEASE_MS = 120_000;
const RECOVERY_RETRY_MS = 60_000;

function startLiveLeaseHeartbeat(
  lifecycle: DurableGenerationLifecycle,
  generationId: string,
  generationLeaseVersion: number,
  attemptId: string,
  attemptLeaseVersion: number,
  workerId: string
): LeaseHeartbeat {
  let stopped = false;
  let renewing = false;
  let leaseLost = false;
  const renew = async (): Promise<void> => {
    if (stopped || renewing || leaseLost) return;
    renewing = true;
    try {
      const expiresAt = new Date(Date.now() + LIVE_LEASE_MS).toISOString();
      const [generationRenewed, attemptRenewed] = await Promise.all([
        lifecycle.renew(
          generationId,
          workerId,
          generationLeaseVersion,
          expiresAt
        ),
        lifecycle.renewAttempt(
          attemptId,
          workerId,
          attemptLeaseVersion,
          expiresAt
        )
      ]);
      if (!generationRenewed || !attemptRenewed) leaseLost = true;
    } catch {
      leaseLost = true;
    } finally {
      renewing = false;
    }
  };
  const timer = setInterval(() => void renew(), LIVE_LEASE_MS / 3);
  return {
    lost: () => leaseLost,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    }
  };
}

type JsonSafeValue =
  | null
  | boolean
  | number
  | string
  | undefined
  | JsonSafeValue[]
  | { [key: string]: JsonSafeValue };

function jsonSafe(value: unknown): JsonSafeValue {
  if (value instanceof Uint8Array) {
    return {
      byte_length: value.byteLength,
      sha256: createHash("sha256").update(value).digest("hex")
    };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, jsonSafe(entry)])
    );
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  return String(value);
}

function callbackOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function falRequestFingerprint(request: GenerationRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        provider: request.provider,
        model: request.model,
        capability: request.capability,
        params: jsonSafe(request.params ?? {})
      })
    )
    .digest("hex");
}

/**
 * Build the durable hooks used by workflow ProcessingContexts.
 *
 * This factory lives in execution so runtime stays independent of models and
 * persistence. It is intentionally FAL-only. Other providers continue to use
 * the existing in-memory receipt and billing path until their submission and
 * recovery contracts are verified.
 */
export function createFalGenerationLifecycleHooks(
  options: FalGenerationLifecycleHooksOptions
): GenerationLifecycleHooks {
  const lifecycle = options.lifecycle ?? createDurableGenerationLifecycle();
  const states = new Map<string, FalGenerationState>();
  const publicUrl = callbackOrigin(options.publicUrl);
  const accountRef =
    options.providerAccountRef ?? `user:${options.userId}:secret:FAL_API_KEY`;

  const onGenerationAccepted: NonNullable<
    GenerationLifecycleHooks["onGenerationAccepted"]
  > = async ({ generationId, request }) => {
    if (request.provider !== "fal_ai") return undefined;
    const origin = request.origin ?? {};
    const idempotencyKey = origin.request_id
      ? `fal_ai:${origin.request_id}`
      : generationId;
    const callbackToken =
      options.callbacks !== false && publicUrl && options.encryptCallbackToken
        ? randomUUID()
        : null;
    const callbackTokenCiphertext = callbackToken
      ? (options.encryptCallbackToken?.(callbackToken, options.userId) ?? null)
      : null;
    const metadata = { origin: jsonSafe(origin) };
    if (request.destination) {
      Object.assign(metadata, {
        attachments: [jsonSafe(request.destination)]
      });
    }
    const accepted = await lifecycle.accept({
      id: generationId,
      user_id: options.userId,
      provider: "fal_ai",
      model: request.model,
      idempotency_key: idempotencyKey,
      input_fingerprint: falRequestFingerprint(request),
      node_id: request.nodeId,
      capability: request.capability,
      workflow_id: request.workflowId ?? null,
      surface: origin.surface ?? null,
      thread_id: origin.thread_id ?? null,
      tool_call_id: origin.tool_call_id ?? null,
      request_id: origin.request_id ?? null,
      job_id: options.jobId ?? request.workflowId ?? null,
      project_id: options.projectId ?? null,
      parameters: jsonSafe(request.params ?? {}) as Record<string, unknown>,
      metadata,
      document_id: request.destination?.document_id ?? null,
      provider_account_ref: accountRef,
      endpoint: request.model,
      callback_token_hash: callbackToken
        ? createHash("sha256").update(callbackToken).digest("hex")
        : null,
      callback_token_ciphertext: callbackTokenCiphertext,
      request_payload: jsonSafe(request.params ?? {}) as Record<string, unknown>
    });

    if (!accepted.created) {
      return {
        skipProvider: true,
        existingGenerationId: accepted.generation.id
      } as GenerationProviderRequestOptions & {
        existingGenerationId: string;
      };
    }

    const workerId = `generation:${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LIVE_LEASE_MS).toISOString();
    const claimedGeneration = await lifecycle.claim(
      accepted.generation.id,
      workerId,
      {
        now: now.toISOString(),
        expiresAt
      }
    );
    const claimedAttempt = await lifecycle.claimAttempt(
      accepted.attempt.id,
      workerId,
      {
        now: now.toISOString(),
        expiresAt
      }
    );
    if (!claimedGeneration || !claimedAttempt) {
      throw new Error("Durable FAL generation lease could not be acquired");
    }
    await lifecycle.transitionAttempt(
      claimedAttempt.id,
      workerId,
      claimedAttempt.lease_version,
      { submission_status: "submitting", provider_status: "unknown" }
    );
    await lifecycle.transition(
      accepted.generation.id,
      workerId,
      claimedGeneration.lease_version,
      {
        status: "pending",
        submission_status: "submitting",
        provider_status: "unknown"
      }
    );
    const heartbeat = startLiveLeaseHeartbeat(
      lifecycle,
      accepted.generation.id,
      claimedGeneration.lease_version,
      accepted.attempt.id,
      claimedAttempt.lease_version,
      workerId
    );
    states.set(generationId, {
      generationId: accepted.generation.id,
      attemptId: accepted.attempt.id,
      workerId,
      generationLeaseVersion: claimedGeneration.lease_version,
      attemptLeaseVersion: claimedAttempt.lease_version,
      heartbeat
    });
    const callbackOptions: Record<string, string> = {};
    if (callbackToken && callbackTokenCiphertext && publicUrl) {
      callbackOptions.webhookUrl = `${publicUrl}/api/providers/fal/webhook/${callbackToken}`;
      callbackOptions.callbackToken = callbackToken;
    }
    return {
      ...callbackOptions,
      generationId: accepted.generation.id,
      durable: true
    } as GenerationProviderRequestOptions & { generationId: string };
  };

  const onProviderRequestBound = async (
    binding: unknown,
    generationId?: string
  ): Promise<void> => {
    const value = jsonSafe(binding);
    if (!value || typeof value !== "object") return;
    const requestId = (value as Record<string, unknown>).providerRequestId;
    if (typeof requestId !== "string" || requestId.length === 0) return;
    const state = generationId ? states.get(generationId) : undefined;
    if (!state) return;
    await lifecycle.bindProviderRequest(
      state.generationId,
      state.workerId,
      state.generationLeaseVersion,
      requestId
    );
    await lifecycle.bindAttemptProviderRequest(
      state.attemptId,
      state.workerId,
      state.attemptLeaseVersion,
      requestId
    );
  };

  const onGenerationTerminal: NonNullable<
    GenerationLifecycleHooks["onGenerationTerminal"]
  > = async ({
    generationId,
    request,
    status,
    error,
    receipt,
    assetIds,
    output
  }) => {
    if (!generationId) return;
    const state = states.get(generationId);
    if (!state) return;
    try {
      if (state.heartbeat.lost()) {
        throw new Error(
          "Durable FAL generation lease was lost before finalization"
        );
      }
      if (status === "completed") {
        const outputRecord =
          output && typeof output === "object" && !Array.isArray(output)
            ? (output as Record<string, unknown>)
            : { result: output };
        const descriptors = decodeFalOutputs(outputRecord);
        const mediaCount = descriptors.filter(
          (descriptor) => descriptor.outputType === "media"
        ).length;
        const savedAssetIds = assetIds.filter(
          (assetId): assetId is string => typeof assetId === "string"
        );
        const needsRecovery = savedAssetIds.length < mediaCount;
        // The caller attaches the asset to its destination after this hook
        // returns, so the durable intent is still unapplied here. Keeping the
        // attempt scheduled is what lets recovery finish an attachment the
        // caller never committed; the attachment pass clears the schedule.
        const needsAttachment = Boolean(request.destination?.target_id);
        let mediaIndex = 0;
        const fence: GenerationAttemptLeaseFence = {
          attemptId: state.attemptId,
          workerId: state.workerId,
          leaseVersion: state.attemptLeaseVersion
        };
        for (const descriptor of descriptors) {
          const assetId =
            descriptor.outputType === "media"
              ? (assetIds[mediaIndex++] ?? null)
              : null;
          const saved = await GenerationOutput.upsertOutput({
            generation_id: state.generationId,
            attempt_id: state.attemptId,
            output_key: descriptor.outputKey,
            output_index: descriptor.outputIndex,
            output_type: descriptor.outputType,
            provider_ref: descriptor.providerRef,
            raw_result: jsonSafe(descriptor.rawResult) as Record<
              string,
              unknown
            >
          });
          const transitioned = await lifecycle.saveOutput(
            saved.id,
            {
              status:
                assetId ||
                (!needsRecovery && descriptor.outputType === "structured")
                  ? "ready"
                  : "retrying",
              asset_id: assetId,
              provider_ref: descriptor.providerRef,
              error: null,
              raw_result: jsonSafe(descriptor.rawResult) as Record<
                string,
                unknown
              >
            },
            fence
          );
          if (!transitioned) {
            throw new Error(
              "Durable FAL output lease fence rejected finalization"
            );
          }
        }
        const nextCheckAt =
          needsRecovery || needsAttachment
            ? new Date(Date.now() + RECOVERY_RETRY_MS).toISOString()
            : null;
        if (
          !(await lifecycle.transition(
            state.generationId,
            state.workerId,
            state.generationLeaseVersion,
            {
              status: needsRecovery ? "recovering" : "completed",
              submission_status: "submitted",
              provider_status: "succeeded",
              output_status: needsRecovery ? "retrying" : "ready",
              attachment_status: "pending",
              asset_ids: savedAssetIds,
              error: null,
              next_check_at: nextCheckAt,
              completed_at: needsRecovery ? null : new Date().toISOString()
            }
          ))
        ) {
          throw new Error(
            "Durable FAL generation lease fence rejected finalization"
          );
        }
        if (
          !(await lifecycle.transitionAttempt(
            state.attemptId,
            state.workerId,
            state.attemptLeaseVersion,
            {
              submission_status: "submitted",
              provider_status: "succeeded",
              next_check_at: nextCheckAt,
              raw_result_ref: needsRecovery
                ? JSON.stringify(jsonSafe(output))
                : null
            }
          ))
        ) {
          throw new Error(
            "Durable FAL attempt lease fence rejected finalization"
          );
        }
      } else if (status === "recovering") {
        const recoveryOutput =
          output &&
          typeof output === "object" &&
          !Array.isArray(output) &&
          !(output instanceof Uint8Array)
            ? (output as Record<string, unknown>)
            : null;
        const descriptors = recoveryOutput
          ? decodeFalOutputs(recoveryOutput)
          : [];
        const fence: GenerationAttemptLeaseFence = {
          attemptId: state.attemptId,
          workerId: state.workerId,
          leaseVersion: state.attemptLeaseVersion
        };
        for (const descriptor of descriptors) {
          const saved = await GenerationOutput.upsertOutput({
            generation_id: state.generationId,
            attempt_id: state.attemptId,
            output_key: descriptor.outputKey,
            output_index: descriptor.outputIndex,
            output_type: descriptor.outputType,
            provider_ref: descriptor.providerRef,
            raw_result: descriptor.rawResult
          });
          if (
            !(await lifecycle.saveOutput(
              saved.id,
              {
                status: "retrying",
                provider_ref: descriptor.providerRef,
                raw_result: descriptor.rawResult,
                error: error ?? null
              },
              fence
            ))
          ) {
            throw new Error(
              "Durable FAL output lease fence rejected recovery scheduling"
            );
          }
        }
        const nextCheckAt = new Date(
          Date.now() + RECOVERY_RETRY_MS
        ).toISOString();
        const generationRecovery: DurableGenerationTransition = {
          status: "recovering",
          error: error ?? null,
          next_check_at: nextCheckAt
        };
        if (descriptors.length > 0) {
          generationRecovery.submission_status = "submitted";
          generationRecovery.provider_status = "succeeded";
          generationRecovery.output_status = "retrying";
        }
        if (
          !(await lifecycle.transition(
            state.generationId,
            state.workerId,
            state.generationLeaseVersion,
            generationRecovery
          ))
        ) {
          throw new Error(
            "Durable FAL generation lease fence rejected recovery scheduling"
          );
        }
        const attemptRecovery: GenerationAttemptObservation = {
          last_error: error ?? null,
          next_check_at: nextCheckAt
        };
        if (descriptors.length > 0) {
          attemptRecovery.submission_status = "submitted";
          attemptRecovery.provider_status = "succeeded";
          attemptRecovery.raw_result_ref = JSON.stringify(jsonSafe(output));
        }
        if (
          !(await lifecycle.transitionAttempt(
            state.attemptId,
            state.workerId,
            state.attemptLeaseVersion,
            attemptRecovery
          ))
        ) {
          throw new Error(
            "Durable FAL attempt lease fence rejected recovery scheduling"
          );
        }
      } else {
        if (
          !(await lifecycle.transition(
            state.generationId,
            state.workerId,
            state.generationLeaseVersion,
            {
              status,
              submission_status: "submitted",
              provider_status: status === "cancelled" ? "cancelled" : "failed",
              output_status: "unavailable",
              error: error ?? null,
              completed_at: new Date().toISOString()
            }
          ))
        ) {
          throw new Error(
            "Durable FAL generation lease fence rejected finalization"
          );
        }
        if (
          !(await lifecycle.transitionAttempt(
            state.attemptId,
            state.workerId,
            state.attemptLeaseVersion,
            {
              submission_status: "submitted",
              provider_status: status === "cancelled" ? "cancelled" : "failed",
              last_error: error ?? null,
              next_check_at: null
            }
          ))
        ) {
          throw new Error(
            "Durable FAL attempt lease fence rejected finalization"
          );
        }
      }
      // Cost reconciliation remains independent, but leave the receipt available
      // to the existing ledger listener. It must not overwrite output state.
      void receipt;
    } finally {
      state.heartbeat.stop();
      states.delete(generationId);
    }
  };

  return {
    onGenerationAccepted,
    onProviderRequestBound,
    onGenerationTerminal
  };
}

/**
 * Persistence/orchestration seam for provider workers. It deliberately has no
 * provider or storage dependency: providers submit only after `accept()` and
 * workers use the fenced version returned from `claim()` for every write.
 */
export class DurableGenerationLifecycle {
  async accept(
    input: DurableGenerationInput
  ): Promise<DurableGenerationAcceptance> {
    return Prediction.acceptGenerationWithAttempt(input);
  }

  async claim(
    generationId: string,
    workerId: string,
    window: GenerationLeaseWindow
  ): Promise<Prediction | null> {
    return Prediction.claimGenerationLease(
      generationId,
      workerId,
      window.now,
      window.expiresAt
    );
  }

  async renew(
    generationId: string,
    workerId: string,
    leaseVersion: number,
    expiresAt: string
  ): Promise<boolean> {
    return Prediction.renewGenerationLease(
      generationId,
      workerId,
      leaseVersion,
      expiresAt
    );
  }

  async claimAttempt(
    attemptId: string,
    workerId: string,
    window: GenerationLeaseWindow
  ): Promise<GenerationAttempt | null> {
    return GenerationAttempt.claimLease(
      attemptId,
      workerId,
      window.now,
      window.expiresAt
    );
  }

  async renewAttempt(
    attemptId: string,
    workerId: string,
    leaseVersion: number,
    expiresAt: string
  ): Promise<boolean> {
    return GenerationAttempt.renewLease(
      attemptId,
      workerId,
      leaseVersion,
      expiresAt
    );
  }

  async bindProviderRequest(
    generationId: string,
    workerId: string,
    leaseVersion: number,
    providerRequestId: string
  ): Promise<boolean> {
    return Prediction.bindProviderRequest(
      generationId,
      workerId,
      leaseVersion,
      providerRequestId
    );
  }

  async bindAttemptProviderRequest(
    attemptId: string,
    workerId: string,
    leaseVersion: number,
    providerRequestId: string
  ): Promise<boolean> {
    return GenerationAttempt.bindProviderRequest(
      attemptId,
      workerId,
      leaseVersion,
      providerRequestId
    );
  }

  async transitionAttempt(
    attemptId: string,
    workerId: string,
    leaseVersion: number,
    update: GenerationAttemptObservation
  ): Promise<GenerationAttempt | null> {
    return GenerationAttempt.transition(
      attemptId,
      workerId,
      leaseVersion,
      update as Record<string, unknown>
    );
  }

  async transition(
    generationId: string,
    workerId: string,
    leaseVersion: number,
    update: DurableGenerationTransition
  ): Promise<Prediction | null> {
    return Prediction.transitionDurable(
      generationId,
      workerId,
      leaseVersion,
      update
    );
  }

  async recordAttemptObservation(
    attemptId: string,
    workerId: string,
    leaseVersion: number,
    observation: GenerationAttemptObservation
  ): Promise<GenerationAttempt | null> {
    return GenerationAttempt.recordObservation(
      attemptId,
      workerId,
      leaseVersion,
      observation
    );
  }

  async saveOutput(
    outputId: string,
    state: GenerationOutputSaveState,
    fence?: GenerationAttemptLeaseFence
  ): Promise<GenerationOutput | null> {
    return GenerationOutput.transition(outputId, state, fence);
  }

  async attachOutput(
    attachmentId: string,
    change: GenerationAttachmentTransition
  ): Promise<GenerationAttachment | null> {
    return GenerationAttachment.transition(attachmentId, change);
  }

  async recover(now: string, limit = 100): Promise<Prediction[]> {
    return Prediction.recoverableGenerations(now, limit);
  }
}

export function createDurableGenerationLifecycle(): DurableGenerationLifecycle {
  return new DurableGenerationLifecycle();
}
