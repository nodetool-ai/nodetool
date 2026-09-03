/**
 * UserEvent — the narrow, privacy-scoped audit log keyed by user id.
 *
 * What may be written here is fixed by {@link UserEventType} and what may be
 * written *about* it is fixed by {@link USER_EVENT_METADATA_ALLOWLIST}. Those
 * two lists are the privacy control: a caller cannot widen the table by
 * passing a richer object, because everything off the allowlist is dropped
 * before the insert.
 *
 * See `schema/user-events.ts` for the columns and for why there is no IP
 * address, no user agent and no free-text column.
 */

import { and, desc, eq, gte, inArray, lt, lte, notInArray } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { userEvents } from "./schema/user-events.js";

const log = createLogger("nodetool.models.user-event");

// ── Event vocabulary ─────────────────────────────────────────────────

/**
 * Every action this table records, grouped by the reason it is lawful to
 * record it. Nothing outside these three groups belongs in a user-keyed log.
 */
export const UserEventType = {
  // Auth and credentials — Art. 6(1)(f), legitimate interest in security.
  SIGN_IN: "sign_in",
  SIGN_OUT: "sign_out",
  ACCESS_TOKEN_ISSUED: "access_token_issued",
  ACCESS_TOKEN_REVOKED: "access_token_revoked",
  EXTERNAL_IDENTITY_LINKED: "external_identity_linked",
  EXTERNAL_IDENTITY_UNLINKED: "external_identity_unlinked",

  // Irreversible or outward-facing — the audit trail.
  WORKFLOW_DELETED: "workflow_deleted",
  ASSET_DELETED: "asset_deleted",
  SECRET_WRITTEN: "secret_written",
  SECRET_REVOKED: "secret_revoked",
  WORKFLOW_SHARED: "workflow_shared",
  WORKFLOW_UNSHARED: "workflow_unshared",
  APP_DEPLOYED: "app_deployed",
  APP_PUBLISHED: "app_published",
  APP_UNPUBLISHED: "app_unpublished",

  // Consent, policy and data-subject rights — Art. 7(1) demonstrability,
  // plus our own proof that a DSR request was received and answered.
  CONSENT_GIVEN: "consent_given",
  CONSENT_WITHDRAWN: "consent_withdrawn",
  TERMS_ACCEPTED: "terms_accepted",
  DATA_EXPORT_REQUESTED: "data_export_requested",
  DATA_ERASURE_REQUESTED: "data_erasure_requested",
  DATA_ERASURE_COMPLETED: "data_erasure_completed"
} as const;

export type UserEventType = (typeof UserEventType)[keyof typeof UserEventType];

const ALL_USER_EVENT_TYPES = Object.values(UserEventType);

/** True when `value` is one of the recorded event types. */
export function isUserEventType(value: unknown): value is UserEventType {
  return (
    typeof value === "string" &&
    (ALL_USER_EVENT_TYPES as readonly string[]).includes(value)
  );
}

// ── Metadata allowlist ───────────────────────────────────────────────

/** The only value shapes a metadata field may hold. */
export type UserEventMetadataValue = string | number | boolean;

export type UserEventMetadata = Record<string, UserEventMetadataValue>;

/**
 * A string longer than this is not a structured fact — it is prose, and prose
 * is how prompt text, model output and third-party PII leak into an audit
 * log. Over-long strings are dropped rather than truncated, so a caller
 * notices the field is missing instead of silently storing half a prompt.
 */
export const MAX_USER_EVENT_STRING_LENGTH = 200;

/**
 * The scalar keys each event type may carry, and nothing else.
 *
 * Every key here names a structured fact about the action, never its content:
 * which provider, which token id, which policy version. No key holds
 * user-authored text, a prompt, a graph, an asset body or a secret value —
 * adding one that does defeats the purpose of the table.
 */
export const USER_EVENT_METADATA_ALLOWLIST: Readonly<
  Record<UserEventType, readonly string[]>
> = {
  // Auth and credentials.
  sign_in: ["method", "provider"],
  sign_out: ["reason"],
  access_token_issued: ["token_id", "expires_at"],
  access_token_revoked: ["token_id", "reason"],
  external_identity_linked: ["provider"],
  external_identity_unlinked: ["provider"],

  // Irreversible or outward-facing.
  workflow_deleted: ["soft_delete"],
  asset_deleted: ["content_type", "soft_delete"],
  // `secret_name` is the credential's key name ("OPENAI_API_KEY"), never its
  // value — the value never leaves the secret store.
  secret_written: ["secret_name"],
  secret_revoked: ["secret_name"],
  workflow_shared: ["share_scope", "recipient_count"],
  workflow_unshared: ["share_scope"],
  app_deployed: ["application_id", "version", "target"],
  app_published: ["application_id", "version"],
  app_unpublished: ["application_id", "version"],

  // Consent, policy and DSR.
  consent_given: ["policy", "policy_version", "channel"],
  consent_withdrawn: ["policy", "policy_version", "channel"],
  terms_accepted: ["policy_version", "channel"],
  data_export_requested: ["request_id", "format"],
  data_erasure_requested: ["request_id"],
  data_erasure_completed: ["request_id", "rows_deleted"]
};

function isAllowedValue(value: unknown): value is UserEventMetadataValue {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    return value.length > 0 && value.length <= MAX_USER_EVENT_STRING_LENGTH;
  }
  return false;
}

/**
 * Reduce a caller's object to the allowlisted scalar fields for `eventType`.
 *
 * Returns `null` when nothing survives, so "no metadata" and "metadata that
 * was entirely rejected" are the same stored value. Exported because this is
 * the control worth asserting on directly in tests, not only through a write.
 */
export function sanitizeUserEventMetadata(
  eventType: UserEventType,
  metadata: Record<string, unknown> | null | undefined
): UserEventMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;

  const allowed = USER_EVENT_METADATA_ALLOWLIST[eventType] ?? [];
  const kept: UserEventMetadata = {};
  for (const key of allowed) {
    const value = metadata[key];
    if (isAllowedValue(value)) kept[key] = value;
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

/**
 * Subject columns hold ids, not prose. An over-long value is dropped for the
 * same reason an over-long metadata string is.
 */
function sanitizeSubject(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_USER_EVENT_STRING_LENGTH) {
    return null;
  }
  return value;
}

// ── Retention ────────────────────────────────────────────────────────

/**
 * How long an auth or audit-trail event is kept. Long enough to investigate
 * an account compromise or a disputed deletion, short enough that the log is
 * not an indefinite behavioral record.
 */
export const DEFAULT_USER_EVENT_RETENTION_DAYS = 180;

/**
 * Consent, policy and data-subject-rights events are never pruned.
 *
 * Art. 7(1) requires being able to demonstrate that consent was given, and
 * the DSR rows are our own evidence that an export or erasure request was
 * received and completed. Deleting them on a timer would delete the proof.
 */
export const NEVER_PRUNED_USER_EVENT_TYPES: readonly UserEventType[] = [
  UserEventType.CONSENT_GIVEN,
  UserEventType.CONSENT_WITHDRAWN,
  UserEventType.TERMS_ACCEPTED,
  UserEventType.DATA_EXPORT_REQUESTED,
  UserEventType.DATA_ERASURE_REQUESTED,
  UserEventType.DATA_ERASURE_COMPLETED
];

/** True when the retention sweep must leave this event type alone. */
export function isNeverPrunedUserEventType(eventType: UserEventType): boolean {
  return NEVER_PRUNED_USER_EVENT_TYPES.includes(eventType);
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface UserEventRow {
  id: string;
  user_id: string;
  event_type: UserEventType;
  subject_type: string | null;
  subject_id: string | null;
  metadata: UserEventMetadata | null;
  created_at: string;
}

export interface RecordUserEventInput {
  userId: string;
  eventType: UserEventType;
  subjectType?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Override the timestamp. Defaults to now; tests and backfills use it. */
  createdAt?: string;
}

export interface ListUserEventsOptions {
  limit?: number;
  eventTypes?: readonly UserEventType[];
  /** Inclusive lower bound on `created_at`, ISO-8601. */
  since?: string;
  /** Inclusive upper bound on `created_at`, ISO-8601. */
  until?: string;
}

const DEFAULT_LIST_LIMIT = 100;

function toRow(row: Record<string, unknown>): UserEventRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    event_type: row.event_type as UserEventType,
    subject_type: (row.subject_type as string | null) ?? null,
    subject_id: (row.subject_id as string | null) ?? null,
    metadata: (row.metadata as UserEventMetadata | null) ?? null,
    created_at: row.created_at as string
  };
}

// ── Write ────────────────────────────────────────────────────────────

/**
 * Append one audit event.
 *
 * Returns the stored row, or `null` when the write could not happen. It never
 * throws: this is called from inside sign-in, delete and revoke paths, and an
 * audit log that can fail a sign-out is worse than one that misses a row. The
 * failure is logged, which is where it gets noticed.
 */
export async function recordUserEvent(
  input: RecordUserEventInput
): Promise<UserEventRow | null> {
  if (!isUserEventType(input.eventType)) {
    log.warn("Refusing to record an unknown user event type", {
      eventType: String(input.eventType)
    });
    return null;
  }
  if (!input.userId) {
    log.warn("Refusing to record a user event with no user id", {
      eventType: input.eventType
    });
    return null;
  }

  const row: UserEventRow = {
    id: createTimeOrderedUuid(),
    user_id: input.userId,
    event_type: input.eventType,
    subject_type: sanitizeSubject(input.subjectType),
    subject_id: sanitizeSubject(input.subjectId),
    metadata: sanitizeUserEventMetadata(input.eventType, input.metadata),
    created_at: input.createdAt ?? new Date().toISOString()
  };

  try {
    await getDb().insert(userEvents).values(row);
    return row;
  } catch (error) {
    // Swallowed on purpose: the audit write is a side effect of the caller's
    // real work (a sign-in, a delete, a token revoke) and must not fail it.
    // Logging is the alert path — a burst of these means the table or the
    // connection is broken, not that the caller did something wrong.
    log.error("Failed to record user event", {
      eventType: row.event_type,
      error: String(error)
    });
    return null;
  }
}

// ── Read ─────────────────────────────────────────────────────────────

/**
 * Events for one user, newest first. Backs both the account activity view and
 * the data-export path, which is why the time range is a first-class filter.
 */
export async function listUserEvents(
  userId: string,
  opts: ListUserEventsOptions = {}
): Promise<UserEventRow[]> {
  const { limit = DEFAULT_LIST_LIMIT, eventTypes, since, until } = opts;

  const conditions = [eq(userEvents.user_id, userId)];
  if (eventTypes && eventTypes.length > 0) {
    conditions.push(inArray(userEvents.event_type, [...eventTypes]));
  }
  if (since) conditions.push(gte(userEvents.created_at, since));
  if (until) conditions.push(lte(userEvents.created_at, until));

  const rows = await getDb()
    .select()
    .from(userEvents)
    .where(and(...conditions))
    .orderBy(desc(userEvents.created_at), desc(userEvents.id))
    .limit(limit);

  return rows.map(toRow);
}

// ── Erasure and retention ────────────────────────────────────────────

/**
 * Delete every event for one user and report how many rows went.
 *
 * The erasure path calls this last, after the user's own data is gone: the
 * audit trail is scoped to that user, so once the account is erased there is
 * nothing left for it to be evidence about. The count is read before the
 * delete because the two dialects report affected rows differently.
 */
export async function deleteUserEventsForUser(userId: string): Promise<number> {
  const db = getDb();
  const existing = await db
    .select({ id: userEvents.id })
    .from(userEvents)
    .where(eq(userEvents.user_id, userId));

  if (existing.length === 0) return 0;

  await db.delete(userEvents).where(eq(userEvents.user_id, userId));
  return existing.length;
}

/**
 * Drop auth and audit-trail events older than `retentionDays`.
 *
 * Consent, policy and DSR events are excluded by type, not by age — see
 * {@link NEVER_PRUNED_USER_EVENT_TYPES}. Returns the number of rows removed.
 */
export async function pruneUserEvents(
  retentionDays: number = DEFAULT_USER_EVENT_RETENTION_DAYS
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error(`Invalid retention window: ${retentionDays}`);
  }

  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const prunable = and(
    lt(userEvents.created_at, cutoff),
    notInArray(userEvents.event_type, [...NEVER_PRUNED_USER_EVENT_TYPES])
  );

  const db = getDb();
  const doomed = await db
    .select({ id: userEvents.id })
    .from(userEvents)
    .where(prunable);

  if (doomed.length === 0) return 0;

  await db.delete(userEvents).where(prunable);
  return doomed.length;
}
