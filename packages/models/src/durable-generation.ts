import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  isNotNull,
  lte,
  ne,
  or,
  sql,
  asc
} from "drizzle-orm";
import { createHash } from "node:crypto";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb, getDbType, type DbTransaction } from "./db.js";
import { predictions } from "./schema/predictions.js";
import { generationAttempts } from "./schema/generation-attempts.js";
import { generationWebhookDeliveries } from "./schema/generation-webhook-deliveries.js";
import { generationOutputs } from "./schema/generation-outputs.js";
import { generationAttachments } from "./schema/generation-attachments.js";

export interface DurableGenerationInput {
  id?: string;
  user_id: string;
  provider: string;
  model: string;
  idempotency_key: string;
  input_fingerprint: string;
  node_id?: string;
  node_type?: string;
  capability?: string | null;
  workflow_id?: string | null;
  project_id?: string | null;
  document_id?: string | null;
  surface?: string | null;
  thread_id?: string | null;
  tool_call_id?: string | null;
  request_id?: string | null;
  job_id?: string | null;
  parameters?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  provider_account_ref?: string | null;
  endpoint?: string | null;
  callback_token_hash?: string | null;
  callback_token_ciphertext?: string | null;
  decoder_version?: string | null;
  request_payload?: Record<string, unknown> | null;
}

export interface DurablePredictionAcceptance {
  generation: DurablePrediction;
  created: boolean;
}

export type DurablePublicGenerationStatus =
  | "pending"
  | "running"
  | "recovering"
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_attention"
  | "interrupted";

export type DurableSubmissionStatus =
  | "accepted"
  | "submitting"
  | "submitted"
  | "submission_unknown";
export type DurableProviderStatus =
  | "unknown"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type DurableOutputStatus =
  | "pending"
  | "saving"
  | "ready"
  | "retrying"
  | "unavailable";
export type DurableAttachmentStatus =
  | "pending"
  | "attached"
  | "ready"
  | "superseded"
  | "target_deleted"
  | "retrying";

export interface DurableGenerationTransition {
  status?: string;
  submission_status?: DurableSubmissionStatus;
  provider_status?: DurableProviderStatus;
  output_status?: DurableOutputStatus;
  attachment_status?: DurableAttachmentStatus;
  provider_request_id?: string | null;
  provider_execution_id?: string | null;
  error?: string | null;
  completed_at?: string | null;
  next_check_at?: string | null;
  cancel_requested_at?: string | null;
  asset_ids?: string[] | null;
  last_error?: string | null;
}

export interface GenerationAttemptObservation {
  provider_status?: DurableProviderStatus;
  submission_status?: DurableSubmissionStatus;
  provider_request_id?: string | null;
  provider_execution_id?: string | null;
  gateway_request_id?: string | null;
  raw_result_ref?: string | null;
  next_check_at?: string | null;
  check_attempts?: number;
  last_error?: string | null;
}

export interface GenerationOutputSaveState {
  status: DurableOutputStatus;
  storage_key?: string | null;
  asset_id?: string | null;
  error?: string | null;
  provider_ref?: string | null;
  raw_result?: Record<string, unknown> | null;
}

export interface GenerationAttachmentTransition {
  status: DurableAttachmentStatus;
  selected?: boolean;
  error?: string | null;
}

export interface GenerationAttemptLeaseFence {
  readonly attemptId: string;
  readonly workerId: string;
  readonly leaseVersion: number;
}

/** Derive the user-facing state without conflating provider success and saving. */
export function deriveGenerationStatus(row: {
  status: string;
  lifecycle_owner?: string | null;
  submission_status: string;
  provider_status: string;
  output_status: string;
  attachment_status: string;
  cancel_requested_at?: string | null;
}): DurablePublicGenerationStatus {
  if (row.status === "interrupted") return "interrupted";
  if (row.lifecycle_owner && row.lifecycle_owner !== "durable") {
    return row.status as DurablePublicGenerationStatus;
  }
  if (
    row.output_status === "ready" &&
    (row.provider_status === "failed" ||
      row.provider_status === "cancelled" ||
      row.status === "failed")
  )
    return "needs_attention";
  if (row.provider_status === "succeeded" && row.output_status === "ready") {
    return "completed";
  }
  if (row.provider_status === "cancelled") return "cancelled";
  if (row.status === "cancelled") {
    return row.provider_status === "succeeded" ? "recovering" : "cancelled";
  }
  if (row.status === "failed" || row.provider_status === "failed")
    return "failed";
  if (
    row.output_status === "unavailable" ||
    row.output_status === "retrying" ||
    (row.attachment_status === "retrying" && row.output_status === "pending") ||
    row.submission_status === "submission_unknown"
  )
    return "needs_attention";
  if (row.status === "needs_attention") return "needs_attention";
  if (row.status === "completed" || row.provider_status === "succeeded")
    return "recovering";
  if (
    row.provider_status === "running" ||
    row.provider_status === "queued" ||
    row.submission_status === "submitted"
  )
    return "running";
  return row.cancel_requested_at ? "running" : "pending";
}

export class DurableGenerationIdempotencyConflictError extends Error {
  constructor(
    readonly userId: string,
    readonly idempotencyKey: string
  ) {
    super(
      `Idempotency key ${idempotencyKey} was already used with different input`
    );
    this.name = "DurableGenerationIdempotencyConflictError";
  }
}

export class DurablePrediction extends DBModel {
  static override table = predictions;
  declare id: string;
  declare user_id: string;
  declare provider: string;
  declare model: string;
  declare node_id: string;
  declare node_type: string;
  declare capability: string | null;
  declare workflow_id: string | null;
  declare project_id: string | null;
  declare document_id: string | null;
  declare surface: string | null;
  declare thread_id: string | null;
  declare tool_call_id: string | null;
  declare request_id: string | null;
  declare job_id: string | null;
  declare parameters: Record<string, unknown> | null;
  declare metadata: Record<string, unknown> | null;
  declare status: string;
  declare error: string | null;
  declare cost: number | null;
  declare asset_ids: string[] | null;
  declare provider_request_id: string | null;
  declare idempotency_key: string | null;
  declare input_fingerprint: string | null;
  declare lifecycle_owner: string;
  declare submission_status: string;
  declare provider_status: string;
  declare output_status: string;
  declare attachment_status: string;
  declare accepted_at: string | null;
  declare lease_owner: string | null;
  declare lease_expires_at: string | null;
  declare lease_version: number;
  declare next_check_at: string | null;
  declare attempt_count: number;
  declare cancel_requested_at: string | null;
  declare created_at: string | null;
  declare started_at: string | null;
  declare completed_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.node_id ??= "";
    this.node_type ??= "";
    this.capability ??= null;
    this.status ??= "pending";
    this.lifecycle_owner ??= "legacy";
    this.submission_status ??= "accepted";
    this.provider_status ??= "unknown";
    this.output_status ??= "pending";
    this.attachment_status ??= "pending";
    this.lease_version ??= 0;
    this.attempt_count ??= 0;
  }

  static async acceptGeneration(
    input: DurableGenerationInput,
    createAttempt = false
  ): Promise<DurablePredictionAcceptance> {
    if (
      input.idempotency_key.length === 0 ||
      input.input_fingerprint.length === 0
    ) {
      throw new Error(
        "Durable generation acceptance requires idempotency_key and input_fingerprint"
      );
    }
    const db = getDb();
    const now = new Date().toISOString();
    const id = input.id ?? createTimeOrderedUuid();
    const values = {
      id,
      user_id: input.user_id,
      provider: input.provider,
      model: input.model,
      node_id: input.node_id ?? "",
      node_type: input.node_type ?? "",
      capability: input.capability ?? null,
      workflow_id: input.workflow_id ?? null,
      project_id: input.project_id ?? null,
      document_id: input.document_id ?? null,
      surface: input.surface ?? null,
      thread_id: input.thread_id ?? null,
      tool_call_id: input.tool_call_id ?? null,
      request_id: input.request_id ?? null,
      job_id: input.job_id ?? null,
      parameters: input.parameters ?? null,
      metadata: input.metadata ?? null,
      status: "pending",
      lifecycle_owner: "durable",
      submission_status: "accepted",
      provider_status: "unknown",
      output_status: "pending",
      attachment_status: "pending",
      idempotency_key: input.idempotency_key,
      input_fingerprint: input.input_fingerprint,
      accepted_at: now,
      created_at: now,
      attempt_count: 0,
      lease_version: 0
    };
    const insertGeneration = (tx: DbTransaction) =>
      tx
        .insert(predictions)
        .values(values)
        .onConflictDoNothing({
          target: [predictions.user_id, predictions.idempotency_key]
        })
        .returning({ id: predictions.id });
    const selectGeneration = (
      tx: DbTransaction,
      acceptedId: string | undefined
    ) =>
      tx
        .select()
        .from(predictions)
        .where(
          acceptedId
            ? and(
                eq(predictions.id, acceptedId),
                eq(predictions.user_id, input.user_id)
              )
            : and(
                eq(predictions.user_id, input.user_id),
                eq(predictions.idempotency_key, input.idempotency_key)
              )
        )
        .limit(1);
    const insertAttempt = (tx: DbTransaction, generationId: string) =>
      tx
        .insert(generationAttempts)
        .values({
          id: createTimeOrderedUuid(),
          generation_id: generationId,
          attempt_number: 1,
          provider: input.provider,
          provider_account_ref: input.provider_account_ref ?? null,
          endpoint: input.endpoint ?? null,
          callback_token_hash: input.callback_token_hash ?? null,
          callback_token_ciphertext: input.callback_token_ciphertext ?? null,
          decoder_version: input.decoder_version ?? null,
          input_fingerprint: input.input_fingerprint,
          submission_idempotency_key: input.idempotency_key,
          request_payload: input.request_payload ?? null,
          created_at: now,
          updated_at: now
        })
        .onConflictDoNothing({
          target: [
            generationAttempts.generation_id,
            generationAttempts.attempt_number
          ]
        });
    const accepted = (
      row: Record<string, unknown> | undefined,
      created: boolean
    ): DurablePredictionAcceptance => {
      const generation = row ? new DurablePrediction(row) : null;
      if (!generation) {
        throw new Error("Durable generation acceptance was not persisted");
      }
      if (generation.input_fingerprint !== input.input_fingerprint) {
        throw new DurableGenerationIdempotencyConflictError(
          input.user_id,
          input.idempotency_key
        );
      }
      return { generation, created };
    };

    if (getDbType() === "sqlite") {
      return db.transaction((tx: DbTransaction) => {
        const inserted = insertGeneration(tx).all();
        const existing = selectGeneration(tx, inserted[0]?.id).all();
        const result = accepted(existing[0], inserted.length > 0);
        if (createAttempt) {
          insertAttempt(tx, result.generation.id).run();
        }
        return result;
      });
    }

    return db.transaction(async (tx: DbTransaction) => {
      const inserted = await insertGeneration(tx);
      const existing = await selectGeneration(tx, inserted[0]?.id);
      const generation = existing[0]
        ? new DurablePrediction(existing[0])
        : null;
      if (!generation) {
        throw new Error("Durable generation acceptance was not persisted");
      }
      if (generation.input_fingerprint !== input.input_fingerprint) {
        throw new DurableGenerationIdempotencyConflictError(
          input.user_id,
          input.idempotency_key
        );
      }

      if (createAttempt) {
        await insertAttempt(tx, generation.id);
      }

      return { generation, created: inserted.length > 0 };
    });
  }

  static async acceptGenerationWithAttempt(
    input: DurableGenerationInput
  ): Promise<DurablePredictionAcceptance & { attempt: GenerationAttempt }> {
    const accepted = await DurablePrediction.acceptGeneration(input, true);
    const [attempt] = await GenerationAttempt.forGeneration(
      accepted.generation.id
    );
    if (!attempt) {
      throw new Error("Durable generation attempt was not persisted");
    }
    return { ...accepted, attempt };
  }

  static async claimGenerationLease(
    id: string,
    workerId: string,
    now: string,
    expiresAt: string
  ): Promise<DurablePrediction | null> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set({
        lease_owner: workerId,
        lease_expires_at: expiresAt,
        lease_version: sql`${predictions.lease_version} + 1`
      })
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.lifecycle_owner, "durable"),
          or(
            isNull(predictions.lease_owner),
            and(
              isNotNull(predictions.lease_expires_at),
              lte(predictions.lease_expires_at, now)
            )
          ),
          or(
            inArray(predictions.status, [
              "pending",
              "accepted",
              "submitting",
              "submitted",
              "submission_unknown",
              "recovering",
              "running",
              "needs_attention"
            ]),
            and(
              inArray(predictions.status, ["completed", "cancelled"]),
              or(
                ne(predictions.output_status, "ready"),
                ne(predictions.provider_status, "succeeded")
              )
            )
          )
        )
      )
      .returning();
    return updated[0] ? new DurablePrediction(updated[0]) : null;
  }

  /**
   * Project the settled outcome of a generation's attachment rows onto the
   * generation, and stop scheduling it. A generation whose media is saved and
   * ready is terminal and holds no lease, yet its destination work can still
   * be outstanding, so this write is fenced by the status it replaces instead
   * of a lease version. It only moves a non-terminal attachment projection
   * forward; the attachment rows stay the source of truth.
   */
  static async settleAttachments(
    id: string,
    status: Extract<
      DurableAttachmentStatus,
      "attached" | "superseded" | "target_deleted"
    >
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set({ attachment_status: status, next_check_at: null })
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.lifecycle_owner, "durable"),
          inArray(predictions.attachment_status, [
            "pending",
            "ready",
            "retrying"
          ])
        )
      )
      .returning({ id: predictions.id });
    return updated.length > 0;
  }

  static async renewGenerationLease(
    id: string,
    workerId: string,
    version: number,
    expiresAt: string
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set({ lease_expires_at: expiresAt })
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.lifecycle_owner, "durable"),
          eq(predictions.lease_owner, workerId),
          eq(predictions.lease_version, version)
        )
      )
      .returning({ id: predictions.id });
    return updated.length > 0;
  }

  static async releaseGenerationLease(
    id: string,
    workerId: string,
    version: number
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set({ lease_owner: null, lease_expires_at: null })
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.lifecycle_owner, "durable"),
          eq(predictions.lease_owner, workerId),
          eq(predictions.lease_version, version)
        )
      )
      .returning({ id: predictions.id });
    return updated.length > 0;
  }

  static async bindProviderRequest(
    id: string,
    workerId: string,
    version: number,
    providerRequestId: string
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set({
        provider_request_id: providerRequestId,
        submission_status: "submitted",
        provider_status: "queued"
      })
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.lifecycle_owner, "durable"),
          eq(predictions.lease_owner, workerId),
          eq(predictions.lease_version, version),
          isNull(predictions.provider_request_id)
        )
      )
      .returning({ id: predictions.id });
    return updated.length > 0;
  }

  static async transitionDurable(
    id: string,
    workerId: string,
    version: number,
    update: DurableGenerationTransition
  ): Promise<DurablePrediction | null> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set(update)
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.lifecycle_owner, "durable"),
          eq(predictions.lease_owner, workerId),
          eq(predictions.lease_version, version)
        )
      )
      .returning();
    return updated[0] ? new DurablePrediction(updated[0]) : null;
  }

  static async recoverableGenerations(
    now: string,
    limit = 100
  ): Promise<DurablePrediction[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.lifecycle_owner, "durable"),
          or(
            isNull(predictions.lease_owner),
            and(
              isNotNull(predictions.lease_expires_at),
              lte(predictions.lease_expires_at, now)
            )
          ),
          or(
            inArray(predictions.status, [
              "pending",
              "accepted",
              "submitting",
              "submitted",
              "submission_unknown",
              "recovering",
              "running",
              "needs_attention"
            ]),
            and(
              inArray(predictions.status, ["completed", "cancelled"]),
              or(
                ne(predictions.output_status, "ready"),
                ne(predictions.provider_status, "succeeded")
              )
            )
          ),
          or(
            isNull(predictions.next_check_at),
            lte(predictions.next_check_at, now)
          )
        )
      )
      .orderBy(
        sql`CASE WHEN ${predictions.next_check_at} IS NULL THEN 0 ELSE 1 END`,
        asc(predictions.next_check_at),
        asc(predictions.created_at),
        asc(predictions.id)
      )
      .limit(Math.max(1, Math.min(limit, 500)));
    return rows.map(
      (value: Record<string, unknown>) => new DurablePrediction(value)
    );
  }

  static async requestCancellation(
    id: string,
    userId: string
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(predictions)
      .set({ cancel_requested_at: new Date().toISOString() })
      .where(
        and(
          eq(predictions.id, id),
          eq(predictions.user_id, userId),
          eq(predictions.lifecycle_owner, "durable"),
          inArray(predictions.status, [
            "pending",
            "accepted",
            "submitting",
            "submitted",
            "submission_unknown",
            "recovering",
            "running"
          ])
        )
      )
      .returning({ id: predictions.id });
    return updated.length > 0;
  }
}

export class GenerationAttempt extends DBModel {
  static override table = generationAttempts;
  declare id: string;
  declare generation_id: string;
  declare attempt_number: number;
  declare provider: string;
  declare provider_account_ref: string | null;
  declare provider_request_id: string | null;
  declare provider_execution_id: string | null;
  declare gateway_request_id: string | null;
  declare endpoint: string | null;
  declare callback_token_hash: string | null;
  declare callback_token_ciphertext: string | null;
  declare decoder_version: string | null;
  declare input_fingerprint: string | null;
  declare submission_idempotency_key: string | null;
  declare submission_status: string;
  declare provider_status: string;
  declare request_payload: Record<string, unknown> | null;
  declare raw_result_ref: string | null;
  declare lease_owner: string | null;
  declare lease_expires_at: string | null;
  declare lease_version: number;
  declare next_check_at: string | null;
  declare check_attempts: number;
  declare last_error: string | null;
  declare cancel_requested_at: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.attempt_number ??= 1;
    this.submission_status ??= "accepted";
    this.provider_status ??= "unknown";
    this.lease_version ??= 0;
    const now = new Date().toISOString();
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  static async forGeneration(
    generationId: string
  ): Promise<GenerationAttempt[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.generation_id, generationId));
    return rows.map(
      (value: Record<string, unknown>) => new GenerationAttempt(value)
    );
  }

  static async ensureForGeneration(input: {
    generation_id: string;
    provider: string;
    input_fingerprint?: string | null;
    submission_idempotency_key?: string | null;
    attempt_number?: number;
    provider_account_ref?: string | null;
    endpoint?: string | null;
    callback_token_hash?: string | null;
    callback_token_ciphertext?: string | null;
    decoder_version?: string | null;
    request_payload?: Record<string, unknown> | null;
  }): Promise<{ attempt: GenerationAttempt; created: boolean }> {
    const db = getDb();
    const attemptNumber = input.attempt_number ?? 1;
    const id = createTimeOrderedUuid();
    const now = new Date().toISOString();
    const inserted = await db
      .insert(generationAttempts)
      .values({
        id,
        generation_id: input.generation_id,
        attempt_number: attemptNumber,
        provider: input.provider,
        input_fingerprint: input.input_fingerprint ?? null,
        submission_idempotency_key: input.submission_idempotency_key ?? null,
        provider_account_ref: input.provider_account_ref ?? null,
        endpoint: input.endpoint ?? null,
        callback_token_hash: input.callback_token_hash ?? null,
        callback_token_ciphertext: input.callback_token_ciphertext ?? null,
        decoder_version: input.decoder_version ?? null,
        request_payload: input.request_payload ?? null,
        created_at: now,
        updated_at: now
      })
      .onConflictDoNothing({
        target: [
          generationAttempts.generation_id,
          generationAttempts.attempt_number
        ]
      })
      .returning({ id: generationAttempts.id });
    const rows = await db
      .select()
      .from(generationAttempts)
      .where(
        and(
          eq(generationAttempts.generation_id, input.generation_id),
          eq(generationAttempts.attempt_number, attemptNumber)
        )
      )
      .limit(1);
    if (!rows[0]) throw new Error("Generation attempt was not persisted");
    return {
      attempt: new GenerationAttempt(rows[0]),
      created: inserted.length > 0
    };
  }

  static async claimLease(
    id: string,
    workerId: string,
    now: string,
    expiresAt: string
  ): Promise<GenerationAttempt | null> {
    const db = getDb();
    const updated = await db
      .update(generationAttempts)
      .set({
        lease_owner: workerId,
        lease_expires_at: expiresAt,
        lease_version: sql`${generationAttempts.lease_version} + 1`,
        updated_at: now
      })
      .where(
        and(
          eq(generationAttempts.id, id),
          or(
            isNull(generationAttempts.lease_owner),
            and(
              isNotNull(generationAttempts.lease_expires_at),
              lte(generationAttempts.lease_expires_at, now)
            )
          )
        )
      )
      .returning();
    return updated[0] ? new GenerationAttempt(updated[0]) : null;
  }

  static async bindProviderRequest(
    id: string,
    workerId: string,
    version: number,
    providerRequestId: string
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(generationAttempts)
      .set({
        provider_request_id: providerRequestId,
        submission_status: "submitted",
        provider_status: "queued",
        updated_at: new Date().toISOString()
      })
      .where(
        and(
          eq(generationAttempts.id, id),
          eq(generationAttempts.lease_owner, workerId),
          eq(generationAttempts.lease_version, version),
          isNull(generationAttempts.provider_request_id)
        )
      )
      .returning({ id: generationAttempts.id });
    return updated.length > 0;
  }

  static async bindRequestIfUnbound(
    id: string,
    providerRequestId: string,
    gatewayRequestId?: string | null
  ): Promise<GenerationAttempt | null> {
    const db = getDb();
    const updated = await db
      .update(generationAttempts)
      .set({
        provider_request_id: providerRequestId,
        gateway_request_id: gatewayRequestId ?? null,
        submission_status: "submitted",
        provider_status: "queued",
        updated_at: new Date().toISOString()
      })
      .where(
        and(
          eq(generationAttempts.id, id),
          isNull(generationAttempts.provider_request_id)
        )
      )
      .returning();
    return updated[0] ? new GenerationAttempt(updated[0]) : null;
  }

  static async findByProviderRequest(
    provider: string,
    accountRef: string | null,
    providerRequestId: string
  ): Promise<GenerationAttempt | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(generationAttempts)
      .where(
        and(
          eq(generationAttempts.provider, provider),
          accountRef === null
            ? isNull(generationAttempts.provider_account_ref)
            : eq(generationAttempts.provider_account_ref, accountRef),
          eq(generationAttempts.provider_request_id, providerRequestId)
        )
      )
      .limit(1);
    return rows[0] ? new GenerationAttempt(rows[0]) : null;
  }

  static async findByCallbackTokenHash(
    callbackTokenHash: string
  ): Promise<GenerationAttempt | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.callback_token_hash, callbackTokenHash))
      .limit(1);
    return rows[0] ? new GenerationAttempt(rows[0]) : null;
  }

  /**
   * Resolve a provider callback token without exposing the token hash query to
   * HTTP adapters. The plaintext token is never persisted.
   */
  static async findByCallbackToken(
    provider: string,
    callbackToken: string
  ): Promise<GenerationAttempt | null> {
    if (callbackToken.length === 0) return null;
    const db = getDb();
    const callbackTokenHash = createHash("sha256")
      .update(callbackToken)
      .digest("hex");
    const rows = await db
      .select()
      .from(generationAttempts)
      .where(
        and(
          eq(generationAttempts.provider, provider),
          eq(generationAttempts.callback_token_hash, callbackTokenHash)
        )
      )
      .limit(1);
    return rows[0] ? new GenerationAttempt(rows[0]) : null;
  }

  static async recordObservation(
    id: string,
    workerId: string,
    version: number,
    observation: GenerationAttemptObservation
  ): Promise<GenerationAttempt | null> {
    const db = getDb();
    const updated = await db
      .update(generationAttempts)
      .set({
        ...observation,
        updated_at: new Date().toISOString()
      })
      .where(
        and(
          eq(generationAttempts.id, id),
          eq(generationAttempts.lease_owner, workerId),
          eq(generationAttempts.lease_version, version)
        )
      )
      .returning();
    return updated[0] ? new GenerationAttempt(updated[0]) : null;
  }

  static async renewLease(
    id: string,
    workerId: string,
    version: number,
    expiresAt: string
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(generationAttempts)
      .set({
        lease_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .where(
        and(
          eq(generationAttempts.id, id),
          eq(generationAttempts.lease_owner, workerId),
          eq(generationAttempts.lease_version, version)
        )
      )
      .returning({ id: generationAttempts.id });
    return updated.length > 0;
  }

  static async transition(
    id: string,
    workerId: string,
    version: number,
    update: GenerationAttemptObservation
  ): Promise<GenerationAttempt | null> {
    const db = getDb();
    const updated = await db
      .update(generationAttempts)
      .set({ ...update, updated_at: new Date().toISOString() })
      .where(
        and(
          eq(generationAttempts.id, id),
          eq(generationAttempts.lease_owner, workerId),
          eq(generationAttempts.lease_version, version)
        )
      )
      .returning();
    return updated[0] ? new GenerationAttempt(updated[0]) : null;
  }

  static async recoverable(
    now: string,
    limit = 100
  ): Promise<GenerationAttempt[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(generationAttempts)
      .where(
        and(
          eq(generationAttempts.provider, "fal_ai"),
          inArray(generationAttempts.submission_status, [
            "accepted",
            "submitting",
            "submitted",
            "submission_unknown"
          ]),
          or(
            and(
              isNull(generationAttempts.next_check_at),
              ne(generationAttempts.provider_status, "succeeded")
            ),
            lte(generationAttempts.next_check_at, now)
          ),
          inArray(generationAttempts.provider_status, [
            "unknown",
            "queued",
            "running",
            "succeeded"
          ]),
          or(
            isNull(generationAttempts.lease_owner),
            and(
              isNotNull(generationAttempts.lease_expires_at),
              lte(generationAttempts.lease_expires_at, now)
            )
          )
        )
      )
      .orderBy(
        sql`CASE WHEN ${generationAttempts.next_check_at} IS NULL THEN 0 ELSE 1 END`,
        asc(generationAttempts.next_check_at),
        asc(generationAttempts.created_at),
        asc(generationAttempts.id)
      )
      .limit(Math.max(1, Math.min(limit, 500)));
    return rows.map(
      (value: Record<string, unknown>) => new GenerationAttempt(value)
    );
  }
}

export class GenerationWebhookDelivery extends DBModel {
  static override table = generationWebhookDeliveries;
  declare id: string;
  declare provider: string;
  declare provider_account_ref: string;
  declare provider_request_id: string;
  declare payload_hash: string;
  declare generation_id: string | null;
  declare attempt_id: string | null;
  declare raw_payload: string;
  declare signature: string | null;
  declare observation: Record<string, unknown> | null;
  declare status: string;
  declare lease_owner: string | null;
  declare lease_expires_at: string | null;
  declare lease_version: number;
  declare received_at: string;
  declare processed_at: string | null;
  declare error: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.status ??= "pending";
    this.lease_version ??= 0;
    this.received_at ??= new Date().toISOString();
  }

  static async ingest(input: {
    provider: string;
    provider_account_ref: string;
    provider_request_id: string;
    payload_hash: string;
    raw_payload: string;
    signature?: string | null;
    generation_id?: string | null;
    attempt_id?: string | null;
    observation?: Record<string, unknown> | null;
  }): Promise<{ delivery: GenerationWebhookDelivery; created: boolean }> {
    const db = getDb();
    const id = createTimeOrderedUuid();
    const inserted = await db
      .insert(generationWebhookDeliveries)
      .values({
        id,
        ...input,
        signature: input.signature ?? null,
        generation_id: input.generation_id ?? null,
        attempt_id: input.attempt_id ?? null,
        observation: input.observation ?? null,
        received_at: new Date().toISOString()
      })
      .onConflictDoNothing({
        target: [
          generationWebhookDeliveries.provider,
          generationWebhookDeliveries.provider_account_ref,
          generationWebhookDeliveries.provider_request_id,
          generationWebhookDeliveries.payload_hash
        ]
      })
      .returning({ id: generationWebhookDeliveries.id });
    let selected = await db
      .select()
      .from(generationWebhookDeliveries)
      .where(eq(generationWebhookDeliveries.id, inserted[0]?.id ?? id))
      .limit(1);
    if (!selected[0]) {
      selected = await db
        .select()
        .from(generationWebhookDeliveries)
        .where(
          and(
            eq(generationWebhookDeliveries.provider, input.provider),
            eq(
              generationWebhookDeliveries.provider_account_ref,
              input.provider_account_ref
            ),
            eq(
              generationWebhookDeliveries.provider_request_id,
              input.provider_request_id
            ),
            eq(generationWebhookDeliveries.payload_hash, input.payload_hash)
          )
        )
        .limit(1);
    }
    if (!selected[0]) throw new Error("Webhook delivery was not persisted");
    return {
      delivery: new GenerationWebhookDelivery(selected[0]),
      created: inserted.length > 0
    };
  }

  static async claim(
    id: string,
    workerId: string,
    now: string,
    expiresAt: string
  ): Promise<GenerationWebhookDelivery | null> {
    const db = getDb();
    const updated = await db
      .update(generationWebhookDeliveries)
      .set({
        status: "processing",
        lease_owner: workerId,
        lease_expires_at: expiresAt,
        lease_version: sql`${generationWebhookDeliveries.lease_version} + 1`
      })
      .where(
        and(
          eq(generationWebhookDeliveries.id, id),
          or(
            and(
              eq(generationWebhookDeliveries.status, "pending"),
              or(
                isNull(generationWebhookDeliveries.lease_owner),
                and(
                  isNotNull(generationWebhookDeliveries.lease_expires_at),
                  lte(generationWebhookDeliveries.lease_expires_at, now)
                )
              )
            ),
            and(
              eq(generationWebhookDeliveries.status, "processing"),
              or(
                isNull(generationWebhookDeliveries.lease_owner),
                and(
                  isNotNull(generationWebhookDeliveries.lease_expires_at),
                  lte(generationWebhookDeliveries.lease_expires_at, now)
                )
              )
            )
          )
        )
      )
      .returning();
    return updated[0] ? new GenerationWebhookDelivery(updated[0]) : null;
  }

  static async pending(
    now: string,
    limit = 100
  ): Promise<GenerationWebhookDelivery[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(generationWebhookDeliveries)
      .where(
        and(
          eq(generationWebhookDeliveries.provider, "fal_ai"),
          or(
            eq(generationWebhookDeliveries.status, "pending"),
            eq(generationWebhookDeliveries.status, "processing")
          ),
          or(
            isNull(generationWebhookDeliveries.lease_owner),
            and(
              isNotNull(generationWebhookDeliveries.lease_expires_at),
              lte(generationWebhookDeliveries.lease_expires_at, now)
            )
          )
        )
      )
      .orderBy(
        asc(generationWebhookDeliveries.received_at),
        asc(generationWebhookDeliveries.id)
      )
      .limit(Math.max(1, Math.min(limit, 500)));
    return rows.map(
      (value: Record<string, unknown>) => new GenerationWebhookDelivery(value)
    );
  }

  static async markProcessed(
    id: string,
    workerId: string,
    version: number,
    error?: string | null
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(generationWebhookDeliveries)
      .set({
        status: error ? "failed" : "processed",
        processed_at: new Date().toISOString(),
        error: error ?? null
      })
      .where(
        and(
          eq(generationWebhookDeliveries.id, id),
          eq(generationWebhookDeliveries.status, "processing"),
          eq(generationWebhookDeliveries.lease_owner, workerId),
          eq(generationWebhookDeliveries.lease_version, version)
        )
      )
      .returning({ id: generationWebhookDeliveries.id });
    return updated.length > 0;
  }

  /** Mark a duplicate or contradictory observation as handled without
   * turning the generation itself into a provider failure. */
  static async markConflictProcessed(
    id: string,
    workerId: string,
    version: number,
    error: string
  ): Promise<boolean> {
    const db = getDb();
    const updated = await db
      .update(generationWebhookDeliveries)
      .set({
        status: "processed",
        processed_at: new Date().toISOString(),
        error
      })
      .where(
        and(
          eq(generationWebhookDeliveries.id, id),
          eq(generationWebhookDeliveries.status, "processing"),
          eq(generationWebhookDeliveries.lease_owner, workerId),
          eq(generationWebhookDeliveries.lease_version, version)
        )
      )
      .returning({ id: generationWebhookDeliveries.id });
    return updated.length > 0;
  }
}

export class GenerationOutput extends DBModel {
  static override table = generationOutputs;
  declare id: string;
  declare generation_id: string;
  declare attempt_id: string;
  declare output_key: string;
  declare output_index: number;
  declare output_type: string;
  declare provider_ref: string | null;
  declare raw_result: Record<string, unknown> | null;
  declare storage_key: string | null;
  declare asset_id: string | null;
  declare status: string;
  declare error: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.output_index ??= 0;
    this.output_type ??= "media";
    this.status ??= "pending";
    const now = new Date().toISOString();
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  static async forAttempt(attemptId: string): Promise<GenerationOutput[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(generationOutputs)
      .where(eq(generationOutputs.attempt_id, attemptId))
      .orderBy(asc(generationOutputs.output_index), asc(generationOutputs.id));
    return rows.map(
      (value: Record<string, unknown>) => new GenerationOutput(value)
    );
  }

  static async upsertOutput(input: {
    generation_id: string;
    attempt_id: string;
    output_key: string;
    output_index?: number;
    output_type?: string;
    provider_ref?: string | null;
    raw_result?: Record<string, unknown> | null;
  }): Promise<GenerationOutput> {
    const attempt = await GenerationAttempt.get<GenerationAttempt>(
      input.attempt_id
    );
    if (!attempt || attempt.generation_id !== input.generation_id) {
      throw new Error("Output attempt does not belong to generation");
    }
    const db = getDb();
    const id = createTimeOrderedUuid();
    const now = new Date().toISOString();
    const outputIndex = input.output_index ?? 0;
    const inserted = await db
      .insert(generationOutputs)
      .values({
        id,
        ...input,
        output_index: outputIndex,
        output_type: input.output_type ?? "media",
        provider_ref: input.provider_ref ?? null,
        raw_result: input.raw_result ?? null,
        created_at: now,
        updated_at: now
      })
      .onConflictDoNothing({
        target: [
          generationOutputs.generation_id,
          generationOutputs.attempt_id,
          generationOutputs.output_key,
          generationOutputs.output_index
        ]
      })
      .returning({ id: generationOutputs.id });
    const selected = await db
      .select()
      .from(generationOutputs)
      .where(eq(generationOutputs.id, inserted[0]?.id ?? id))
      .limit(1);
    if (!selected[0]) {
      const rows = await db
        .select()
        .from(generationOutputs)
        .where(
          and(
            eq(generationOutputs.generation_id, input.generation_id),
            eq(generationOutputs.attempt_id, input.attempt_id),
            eq(generationOutputs.output_key, input.output_key),
            eq(generationOutputs.output_index, outputIndex)
          )
        )
        .limit(1);
      if (!rows[0]) throw new Error("Output was not persisted");
      return new GenerationOutput(rows[0]);
    }
    return new GenerationOutput(selected[0]);
  }

  static async transition(
    id: string,
    saveState: GenerationOutputSaveState,
    fence?: GenerationAttemptLeaseFence
  ): Promise<GenerationOutput | null> {
    const db = getDb();
    const predicates = [eq(generationOutputs.id, id)];
    // A committed asset is terminal for this output. A stale worker may
    // still finish after a lease handoff, but it must not regress ready data
    // to saving/retrying or overwrite its asset identity.
    if (saveState.status !== "ready") {
      predicates.push(ne(generationOutputs.status, "ready"));
    }
    if (fence) {
      predicates.push(
        exists(
          db
            .select({ id: generationAttempts.id })
            .from(generationAttempts)
            .where(
              and(
                eq(generationAttempts.id, fence.attemptId),
                eq(generationAttempts.id, generationOutputs.attempt_id),
                eq(generationAttempts.lease_owner, fence.workerId),
                eq(generationAttempts.lease_version, fence.leaseVersion)
              )
            )
        )
      );
    }
    const updated = await db
      .update(generationOutputs)
      .set({
        ...saveState,
        updated_at: new Date().toISOString()
      })
      .where(and(...predicates))
      .returning();
    return updated[0] ? new GenerationOutput(updated[0]) : null;
  }

  static async markSaved(
    id: string,
    storageKey: string,
    assetId: string,
    fence?: GenerationAttemptLeaseFence
  ): Promise<GenerationOutput | null> {
    return GenerationOutput.transition(
      id,
      {
        status: "ready",
        storage_key: storageKey,
        asset_id: assetId,
        error: null
      },
      fence
    );
  }
}

export class GenerationAttachment extends DBModel {
  static override table = generationAttachments;
  declare id: string;
  declare generation_id: string;
  declare output_id: string;
  declare target_type: string;
  declare target_id: string;
  declare status: string;
  declare selected: boolean;
  declare error: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.status ??= "pending";
    this.selected ??= false;
    const now = new Date().toISOString();
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  static async upsertAttachment(input: {
    generation_id: string;
    output_id: string;
    target_type: string;
    target_id: string;
    selected?: boolean;
  }): Promise<GenerationAttachment> {
    const output = await GenerationOutput.get<GenerationOutput>(
      input.output_id
    );
    if (!output || output.generation_id !== input.generation_id) {
      throw new Error("Attachment output does not belong to generation");
    }
    const db = getDb();
    const id = createTimeOrderedUuid();
    const now = new Date().toISOString();
    const inserted = await db
      .insert(generationAttachments)
      .values({
        id,
        ...input,
        selected: input.selected ?? false,
        created_at: now,
        updated_at: now
      })
      .onConflictDoNothing({
        target: [
          generationAttachments.generation_id,
          generationAttachments.output_id,
          generationAttachments.target_type,
          generationAttachments.target_id
        ]
      })
      .returning({ id: generationAttachments.id });
    const selected = await db
      .select()
      .from(generationAttachments)
      .where(eq(generationAttachments.id, inserted[0]?.id ?? id))
      .limit(1);
    if (!selected[0]) {
      const rows = await db
        .select()
        .from(generationAttachments)
        .where(
          and(
            eq(generationAttachments.generation_id, input.generation_id),
            eq(generationAttachments.output_id, input.output_id),
            eq(generationAttachments.target_type, input.target_type),
            eq(generationAttachments.target_id, input.target_id)
          )
        )
        .limit(1);
      if (!rows[0]) throw new Error("Attachment was not persisted");
      return new GenerationAttachment(rows[0]);
    }
    return new GenerationAttachment(selected[0]);
  }

  static async transition(
    id: string,
    change: GenerationAttachmentTransition,
    fence?: GenerationAttemptLeaseFence
  ): Promise<GenerationAttachment | null> {
    const db = getDb();
    const predicates = [eq(generationAttachments.id, id)];
    if (fence) {
      predicates.push(
        exists(
          db
            .select({ id: generationAttempts.id })
            .from(generationAttempts)
            .innerJoin(
              generationOutputs,
              eq(generationOutputs.attempt_id, generationAttempts.id)
            )
            .where(
              and(
                eq(generationAttempts.id, fence.attemptId),
                eq(generationOutputs.id, generationAttachments.output_id),
                eq(generationAttempts.lease_owner, fence.workerId),
                eq(generationAttempts.lease_version, fence.leaseVersion)
              )
            )
        )
      );
    }
    const updated = await db
      .update(generationAttachments)
      .set({
        ...change,
        updated_at: new Date().toISOString()
      })
      .where(and(...predicates))
      .returning();
    return updated[0] ? new GenerationAttachment(updated[0]) : null;
  }
}
