import { deleteRunTrace, eraseRunTraceParentContent, settleRunTrace } from "./run-trace.js";
import {
  and,
  desc,
  eq,
  ne,
  or,
  isNotNull,
  like,
  lt,
  inArray,
  count,
  isNull,
  sql,
  type AnyColumn
} from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { BROWSER_APP_RUNNER_INSTANCE } from "@nodetool-ai/protocol";
import {
  appInstanceResponse,
  appRunResponse,
  appRunSnapshot,
  type AppInstanceRecord,
  type AppRunRecord,
  type AppRunSnapshot
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import type { NewApplicationInvocation } from "./schema/application-budgets.js";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDatabase } from "./db.js";
import {
  redactCredentialText,
  redactErrorText,
  redactErrorTrace,
  type RedactionOptions
} from "./error-trace-redaction.js";
import { reserveInvocation, type Reservation } from "./application-budget.js";

import { AppRunError, AppInstanceConflictError } from "./app-run-errors.js";

export { AppRunError, AppInstanceConflictError } from "./app-run-errors.js";
export type { AppInstanceRecord, AppRunRecord, AppRunSnapshot };
export const APP_RUN_CONTENT_STRING_LIMIT = 20_000;
export const APP_RUN_CONTENT_BYTE_LIMIT = 1_000_000;
export const APP_SNAPSHOT_STRING_LIMIT = 250_000;

/** Execution snapshots are validated and cloned, never silently rewritten. */
export function validateAppRunSnapshot(value: AppRunSnapshot): AppRunSnapshot {
  try {
    const parsed = appRunSnapshot.parse(value);
    assertJsonSnapshot(parsed);
    const encoded = JSON.stringify(parsed, (_key, item: unknown) => {
      if (typeof item === "string" && item.length > APP_SNAPSHOT_STRING_LIMIT) {
        throw new AppRunError(
          "invalid_input",
          "App snapshot string exceeds execution limit"
        );
      }
      if (
        item instanceof ArrayBuffer ||
        ArrayBuffer.isView(item) ||
        isSerializedBuffer(item) ||
        typeof item === "bigint" ||
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        throw new AppRunError(
          "invalid_input",
          "App snapshot must contain JSON values without media bytes"
        );
      }
      return item;
    });
    if (Buffer.byteLength(encoded) > APP_RUN_CONTENT_BYTE_LIMIT) {
      throw new AppRunError(
        "invalid_input",
        "App snapshot exceeds storage limit"
      );
    }
    // The protocol validated this JSON snapshot before the immutable deep copy.
    return appRunSnapshot.parse(JSON.parse(encoded));
  } catch (error) {
    if (error instanceof AppRunError) {
      throw error;
    }
    throw new AppRunError("invalid_input", "App snapshot must be valid JSON");
  }
}

function assertJsonSnapshot(value: unknown): void {
  const pending: unknown[] = [value];
  const inspected = new Set<object>();
  while (pending.length > 0) {
    const next = pending.pop();
    if (
      typeof next === "bigint" ||
      typeof next === "function" ||
      typeof next === "symbol" ||
      (typeof next === "number" && !Number.isFinite(next))
    ) {
      throw new AppRunError(
        "invalid_input",
        "App snapshot must contain JSON values"
      );
    }
    if (typeof next !== "object" || next === null || inspected.has(next)) {
      continue;
    }
    if (
      next instanceof ArrayBuffer ||
      ArrayBuffer.isView(next) ||
      isSerializedBuffer(next) ||
      ("toJSON" in next && typeof next.toJSON === "function")
    ) {
      throw new AppRunError(
        "invalid_input",
        "App snapshot must contain plain JSON without media bytes"
      );
    }
    inspected.add(next);
    for (const child of Object.values(next)) {
      pending.push(child);
    }
  }
}

function isSerializedBuffer(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "Buffer" &&
    "data" in value &&
    Array.isArray(value.data)
  );
}

export type AppRunContent =
  | null
  | string
  | number
  | boolean
  | AppRunContent[]
  | { [key: string]: AppRunContent };
function isAppRunContent(value: unknown): value is AppRunContent {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (
      next === null ||
      typeof next === "string" ||
      typeof next === "boolean" ||
      (typeof next === "number" && Number.isFinite(next))
    ) {
      continue;
    }
    if (Array.isArray(next)) {
      for (const child of next) {
        pending.push(child);
      }
      continue;
    }
    if (typeof next === "object" && next !== null) {
      for (const child of Object.values(next)) {
        pending.push(child);
      }
      continue;
    }
    return false;
  }
  return true;
}

/** Reject non-JSON/media bytes and redact credentials before persisting snapshots. */
export function sanitizeAppRunContent(
  value: unknown,
  secretValues?: readonly string[]
): AppRunContent {
  return sanitizeAppContent(
    value,
    secretValues,
    APP_RUN_CONTENT_STRING_LIMIT,
    redactErrorText
  );
}

function sanitizeAppContent(
  value: unknown,
  secretValues: readonly string[] | undefined,
  stringLimit: number | null,
  redact: (text: string, options: { secretValues?: readonly string[] }) => string
): AppRunContent {
  const encoded = JSON.stringify(value, (key, item: unknown) => {
    if (
      /^(api[_-]?key|authorization|password|secret|token|access_token|refresh_token|cookie|credential)$/i.test(
        key
      )
    ) {
      return "[REDACTED:secret]";
    }
    if (
      item instanceof ArrayBuffer ||
      ArrayBuffer.isView(item) ||
      isSerializedBuffer(item)
    ) {
      return "[media omitted]";
    }
    if (typeof item === "string") {
      if (/^data:|^[A-Za-z0-9+/]{1000,}={0,2}$/.test(item)) {
        return "[media omitted]";
      }
      const redacted = redact(item, { secretValues });
      return stringLimit === null ? redacted : redacted.slice(0, stringLimit);
    }
    if (
      typeof item === "bigint" ||
      typeof item === "function" ||
      typeof item === "symbol"
    ) {
      throw new AppRunError("invalid_input", "Run content must be JSON");
    }
    return item;
  });
  if (
    encoded === undefined ||
    Buffer.byteLength(encoded) > APP_RUN_CONTENT_BYTE_LIMIT
  ) {
    throw new AppRunError(
      "invalid_input",
      "App run content exceeds storage limit"
    );
  }
  // JSON serialization preserves the caller's JSON-shaped value while sanitizing strings.
  const sanitized: unknown = JSON.parse(encoded);
  if (!isAppRunContent(sanitized)) {
    throw new AppRunError("invalid_input", "Run content must be JSON");
  }
  return sanitized;
}

function sanitizeAppRunVariables(
  value: Record<string, unknown>,
  secretValues?: readonly string[]
): Record<string, unknown> {
  const result = sanitizeAppRunContent(value, secretValues);
  if (!isJsonRecord(result)) {
    throw new AppRunError(
      "invalid_input",
      "Run variables must be JSON objects"
    );
  }
  return result;
}

/** Working state preserves strings while sharing redaction and the total byte bound. */
function sanitizeAppInstanceVariables(
  value: Record<string, unknown>,
  secretValues?: readonly string[]
): Record<string, unknown> {
  // Working state keeps paths, email addresses and ids. Only credentials go.
  const result = sanitizeAppContent(
    value,
    secretValues,
    null,
    redactCredentialText
  );
  if (!isJsonRecord(result)) {
    throw new AppRunError("invalid_input", "Instance variables must be JSON objects");
  }
  return result;
}

/**
 * The revision that last wrote each variable, kept in the stored variables
 * and removed from every response. A run conflicts only when a key it writes
 * changed after it started, so parallel runs that write different keys both
 * land.
 */
const KEY_REVISIONS = "__app_key_revisions";
const NESTED_STATE_KEYS = new Set(["__app_inputs", "__app_outputs"]);

/** Variable values by key, one level into the input and output maps. */
function flatValues(variables: Record<string, unknown>): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(variables)) {
    if (key === KEY_REVISIONS) {
      continue;
    }
    if (NESTED_STATE_KEYS.has(key) && isJsonRecord(value)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        values.set(`${key}/${inner}`, JSON.stringify(innerValue));
      }
    } else {
      values.set(key, JSON.stringify(value));
    }
  }
  return values;
}

function keyRevisions(variables: Record<string, unknown>): Record<string, number> {
  const stored = variables[KEY_REVISIONS];
  const result: Record<string, number> = {};
  if (isJsonRecord(stored)) {
    for (const [key, value] of Object.entries(stored)) {
      if (typeof value === "number") {
        result[key] = value;
      }
    }
  }
  return result;
}

/** `next` with the keys that differ from `previous` stamped with `revision`. */
function stampKeyRevisions(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  revision: number
): Record<string, unknown> {
  const before = flatValues(previous);
  const after = flatValues(next);
  const stamps = keyRevisions(previous);
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) !== after.get(key)) {
      stamps[key] = revision;
    }
  }
  return { ...withoutKeyRevisions(next), [KEY_REVISIONS]: stamps };
}

function withoutKeyRevisions(
  variables: Record<string, unknown>
): Record<string, unknown> {
  const { [KEY_REVISIONS]: _stamps, ...rest } = variables;
  return rest;
}

/** True when a key that `outputs` writes changed after `baseline`. */
function outputsAreStale(
  current: Record<string, unknown>,
  outputs: Record<string, unknown>,
  baseline: number
): boolean {
  const stamps = keyRevisions(current);
  return [...flatValues(outputs).keys()].some(
    (key) => (stamps[key] ?? 0) > baseline
  );
}

function toInstanceRecord(row: unknown): AppInstanceRecord {
  const record = appInstanceResponse.parse(row);
  return { ...record, variables: withoutKeyRevisions(record.variables) };
}

export interface CreateAppInstanceInput {
  userId: string;
  applicationId?: string | null;
  sourceId?: string;
  name?: string;
  version?: number | null;
  snapshot: AppRunSnapshot;
  variables?: Record<string, unknown>;
  secretValues?: readonly string[];
}

export async function createAppInstance(
  input: CreateAppInstanceInput,
  isDefault = false
): Promise<AppInstanceRecord> {
  if (!input.userId) {
    throw new AppRunError("invalid_input", "App instance owner is required");
  }
  const c = getDatabase();
  const applicationId = input.applicationId
    ? await resolveAppInstanceApplicationId(input.userId, input.applicationId)
    : null;
  const now = new Date().toISOString();
  const row = {
    id: createTimeOrderedUuid(),
    user_id: input.userId,
    application_id: applicationId,
    source_id: input.sourceId ?? applicationId ?? "",
    name: input.name ?? "Default",
    version: input.version ?? null,
    snapshot: validateAppRunSnapshot(input.snapshot),
    variables: sanitizeAppInstanceVariables(
      withoutKeyRevisions(input.variables ?? {}),
      input.secretValues
    ),
    revision: 0,
    is_default: isDefault ? 1 : 0,
    created_at: now,
    updated_at: now
  };
  if (!row.source_id || row.name.length > 200 || !row.name.trim()) {
    throw new AppRunError(
      "invalid_input",
      "App instance source and name are required"
    );
  }
  const rows =
    c.dialect === "sqlite"
      ? await c.db.insert(c.schema.appInstances).values(row).returning()
      : await c.db.insert(c.schema.appInstances).values(row).returning();
  return toInstanceRecord(rows[0]);
}

function scopedId(
  userId: string,
  id: string,
  table: { id: AnyColumn; user_id: AnyColumn }
) {
  if (!userId || !id) {
    throw new AppRunError(
      "invalid_input",
      "Owner and resource id are required"
    );
  }
  return and(
    eq(table.user_id, userId),
    /^[a-f0-9]{12}$/.test(id) ? like(table.id, `${id}%`) : eq(table.id, id)
  );
}

/** Resolve application ids only within the owner scope of the instance boundary. */
export async function resolveAppInstanceApplicationId(
  userId: string,
  id: string
): Promise<string> {
  const c = getDatabase();
  const condition = scopedId(userId, id, c.schema.applications);
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select({ id: c.schema.applications.id })
          .from(c.schema.applications)
          .where(condition)
          .limit(2)
      : await c.db
          .select({ id: c.schema.applications.id })
          .from(c.schema.applications)
          .where(condition)
          .limit(2);
  if (rows.length > 1) {
    throw new AppRunError("conflict", "Ambiguous application id");
  }
  if (!rows[0]) {
    throw new AppRunError("not_found", "Application not found");
  }
  return rows[0].id;
}

export async function getAppInstance(
  userId: string,
  id: string
): Promise<AppInstanceRecord | null> {
  const c = getDatabase();
  const condition = scopedId(userId, id, c.schema.appInstances);
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.appInstances)
          .where(condition)
          .limit(2)
      : await c.db
          .select()
          .from(c.schema.appInstances)
          .where(condition)
          .limit(2);
  if (rows.length > 1) {
    throw new AppRunError("conflict", "Ambiguous app instance id");
  }
  return rows[0] ? toInstanceRecord(rows[0]) : null;
}

export async function listAppInstances(
  userId: string,
  applicationId?: string | null,
  sourceId?: string,
  limit = 50
): Promise<AppInstanceRecord[]> {
  const resolvedApplicationId = applicationId
    ? await resolveAppInstanceApplicationId(userId, applicationId)
    : null;
  const c = getDatabase();
  const t = c.schema.appInstances;
  const condition = and(
    eq(t.user_id, userId),
    resolvedApplicationId
      ? eq(t.application_id, resolvedApplicationId)
      : undefined,
    sourceId ? eq(t.source_id, sourceId) : undefined
  );
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.appInstances)
          .where(condition)
          .orderBy(desc(c.schema.appInstances.updated_at))
          .limit(Math.min(100, Math.max(1, limit)))
      : await c.db
          .select()
          .from(c.schema.appInstances)
          .where(condition)
          .orderBy(desc(c.schema.appInstances.updated_at))
          .limit(Math.min(100, Math.max(1, limit)));
  return rows.map((row) => toInstanceRecord(row));
}

/** Read the unique owner/source default independently of history pagination. */
export async function getDefaultAppInstance(
  userId: string,
  sourceId: string,
  applicationId?: string | null
): Promise<AppInstanceRecord | null> {
  const resolvedApplicationId = applicationId
    ? await resolveAppInstanceApplicationId(userId, applicationId)
    : null;
  const c = getDatabase();
  const t = c.schema.appInstances;
  const condition = and(
    eq(t.user_id, userId),
    eq(t.source_id, sourceId),
    eq(t.is_default, 1),
    resolvedApplicationId
      ? eq(t.application_id, resolvedApplicationId)
      : undefined
  );
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.appInstances)
          .where(condition)
          .limit(1)
      : await c.db
          .select()
          .from(c.schema.appInstances)
          .where(condition)
          .limit(1);
  return rows[0] ? toInstanceRecord(rows[0]) : null;
}

export async function ensureDefaultAppInstance(
  input: CreateAppInstanceInput
): Promise<AppInstanceRecord> {
  const applicationId = input.applicationId
    ? await resolveAppInstanceApplicationId(input.userId, input.applicationId)
    : null;
  const sourceId = input.sourceId ?? applicationId ?? "";
  const find = () =>
    getDefaultAppInstance(input.userId, sourceId, applicationId);
  const existing = await find();
  if (existing) {
    return existing;
  }
  try {
    return await createAppInstance({ ...input, applicationId, sourceId }, true);
  } catch (error) {
    const winner = await find();
    if (winner) {
      return winner;
    }
    throw error;
  }
}

export async function updateAppInstance(
  userId: string,
  id: string,
  input: {
    expectedRevision: number;
    name?: string;
    variables?: Record<string, unknown>;
    snapshot?: AppRunSnapshot;
    version?: number | null;
    secretValues?: readonly string[];
  }
): Promise<AppInstanceRecord> {
  const existing = await getAppInstance(userId, id);
  if (!existing) {
    throw new AppRunError("not_found", "App instance not found");
  }
  if (
    input.name !== undefined &&
    (!input.name.trim() || input.name.length > 200)
  ) {
    throw new AppRunError("invalid_input", "Invalid instance name");
  }
  if (input.snapshot) {
    const next = appRunSnapshot.parse(input.snapshot);
    const variables = new Set(next.document.variables.map((v) => v.id));
    for (const graph of Object.values(next.workflow_graphs)) {
      for (const node of graph.nodes) {
        if (node.type === "nodetool.variable.SetVariable" && isJsonRecord(node.properties) && typeof node.properties.name === "string") {
          variables.add(node.properties.name.trim());
        }
      }
    }
    if (
      Object.keys(existing.variables).some(
        (k) => !k.startsWith("__app_") && !variables.has(k)
      )
    ) {
      throw new AppRunError(
        "invalid_input",
        "New app version is incompatible with instance variables"
      );
    }
  }
  const patch: Partial<
    Pick<AppInstanceRecord, "name" | "variables" | "snapshot" | "version">
  > &
    Pick<AppInstanceRecord, "revision" | "updated_at"> = {
    revision: input.expectedRevision + 1,
    updated_at: new Date().toISOString()
  };
  if (input.name !== undefined) {
    patch.name = input.name;
  }
  const c = getDatabase();
  if (input.variables !== undefined) {
    const stored =
      c.dialect === "sqlite"
        ? await c.db
            .select({ variables: c.schema.appInstances.variables })
            .from(c.schema.appInstances)
            .where(eq(c.schema.appInstances.id, existing.id))
            .limit(1)
        : await c.db
            .select({ variables: c.schema.appInstances.variables })
            .from(c.schema.appInstances)
            .where(eq(c.schema.appInstances.id, existing.id))
            .limit(1);
    patch.variables = stampKeyRevisions(
      stored[0]?.variables ?? {},
      sanitizeAppInstanceVariables(
        withoutKeyRevisions(input.variables),
        input.secretValues
      ),
      patch.revision
    );
  }
  if (input.snapshot !== undefined) {
    patch.snapshot = validateAppRunSnapshot(input.snapshot);
  }
  if (input.version !== undefined) {
    patch.version = input.version;
  }
  const t = c.schema.appInstances;
  const condition = and(
    eq(t.id, existing.id),
    eq(t.user_id, userId),
    eq(t.revision, input.expectedRevision)
  );
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .update(c.schema.appInstances)
          .set(patch)
          .where(condition)
          .returning()
      : await c.db
          .update(c.schema.appInstances)
          .set(patch)
          .where(condition)
          .returning();
  if (!rows[0]) {
    throw new AppInstanceConflictError();
  }
  return toInstanceRecord(rows[0]);
}

export async function duplicateAppInstance(
  userId: string,
  id: string,
  name?: string
): Promise<AppInstanceRecord> {
  const row = await getAppInstance(userId, id);
  if (!row) {
    throw new AppRunError("not_found", "App instance not found");
  }
  return createAppInstance({
    userId,
    applicationId: row.application_id,
    sourceId: row.source_id,
    name: name ?? `${row.name} copy`,
    version: row.version,
    snapshot: row.snapshot,
    variables: row.variables
  });
}
export async function deleteAppInstance(
  userId: string,
  id: string
): Promise<boolean> {
  const row = await getAppInstance(userId, id);
  if (!row) {
    return false;
  }
  await removeAppRuns(userId, row.id, undefined, undefined, row.id);
  return true;
}
export async function getAppRun(
  userId: string,
  id: string
): Promise<AppRunRecord | null> {
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(scopedId(userId, id, t), isNotNull(t.instance_id));
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(2)
      : await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(2);
  if (rows.length > 1) {
    throw new AppRunError("conflict", "Ambiguous app run id");
  }
  return rows[0] ? appRunResponse.parse(rows[0]) : null;
}
export async function listAppRuns(
  userId: string,
  instanceId: string,
  limit = 50
): Promise<AppRunRecord[]> {
  const instance = await getAppInstance(userId, instanceId);
  if (!instance) {
    throw new AppRunError("not_found", "App instance not found");
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(eq(t.user_id, userId), eq(t.instance_id, instance.id));
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .orderBy(desc(c.schema.applicationInvocations.created_at))
          .limit(Math.min(100, Math.max(1, limit)))
      : await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .orderBy(desc(c.schema.applicationInvocations.created_at))
          .limit(Math.min(100, Math.max(1, limit)));
  return rows.map((row) => appRunResponse.parse(row));
}

export interface ReserveAppRunInput {
  userId: string;
  instanceId: string;
  operationId: string;
  invocationId: string;
  origin: AppRunRecord["origin"];
  estimatedUsd?: number;
  requireFiniteBudget?: boolean;
  traceId?: string;
  rootSpanId?: string;
  inputs?: Record<string, unknown>;
  secretValues?: readonly string[];
}
export type AppRunReservation =
  | { allowed: true; run: AppRunRecord; created: boolean }
  | Extract<Reservation, { allowed: false }>;
export async function reserveAppRun(
  input: ReserveAppRunInput
): Promise<AppRunReservation> {
  const instance = await getAppInstance(input.userId, input.instanceId);
  if (!instance) {
    throw new AppRunError("not_found", "App instance not found");
  }
  if (
    !instance.snapshot.document.operations.some(
      (o) => o.id === input.operationId
    )
  ) {
    throw new AppRunError(
      "not_found",
      "Operation not found in instance snapshot"
    );
  }
  if (
    !input.invocationId ||
    !Number.isFinite(input.estimatedUsd ?? 0) ||
    (input.estimatedUsd ?? 0) < 0
  ) {
    throw new AppRunError("invalid_input", "Invalid app run reservation");
  }
  if (input.traceId && !/^[a-f0-9]{32}$/.test(input.traceId)) {
    throw new AppRunError("invalid_input", "Invalid trace id");
  }
  if (input.rootSpanId && !/^[a-f0-9]{16}$/.test(input.rootSpanId)) {
    throw new AppRunError("invalid_input", "Invalid span id");
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(
    eq(t.user_id, input.userId),
    eq(t.instance_id, instance.id),
    eq(t.operation_id, input.operationId),
    eq(t.invocation_id, input.invocationId)
  );
  const existing =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(1)
      : await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(1);
  if (existing[0]) {
    return {
      allowed: true,
      run: appRunResponse.parse(existing[0]),
      created: false
    };
  }
  const fields = {
    instance_id: instance.id,
    origin: input.origin,
    instance_revision: instance.revision,
    snapshot: input.origin === "public" ? null : instance.snapshot,
    inputs:
      input.origin === "public"
        ? null
        : sanitizeAppRunVariables(input.inputs ?? {}, input.secretValues),
    trace_id: input.traceId ?? randomBytes(16).toString("hex"),
    root_span_id: input.rootSpanId ?? null
  };
  if (instance.application_id) {
    const result = await reserveInvocation({
      applicationId: instance.application_id,
      userId: input.userId,
      version: instance.version,
      invocationId: input.invocationId,
      operationId: input.operationId,
      estimatedUsd: input.estimatedUsd,
      requireFiniteBudget: input.requireFiniteBudget,
      appRunFields: fields
    });
    if (!result.allowed) {
      return result;
    }
    const run = await getAppRun(input.userId, result.record.id);
    if (!run) {
      throw new AppRunError("not_found", "Reserved app run was not found");
    }
    return { allowed: true, run, created: result.created ?? true };
  }
  if (input.origin === "public" || input.requireFiniteBudget) {
    throw new AppRunError(
      "invalid_input",
      "Public runs require a saved budgeted application"
    );
  }
  const row = {
    id: createTimeOrderedUuid(),
    application_id: null,
    user_id: input.userId,
    version: instance.version,
    invocation_id: input.invocationId,
    operation_id: input.operationId,
    estimated_usd: input.estimatedUsd ?? 0,
    status: "running",
    created_at: new Date().toISOString(),
    ...fields
  };
  const rows = c.dialect === "sqlite"
    ? c.db.transaction((tx) => {
      const i = c.schema.appInstances;
      const current = tx.select({ revision: i.revision }).from(i)
        .where(and(eq(i.id, instance.id), eq(i.user_id, input.userId))).get();
      if (!current || current.revision !== instance.revision) { throw new AppInstanceConflictError(); }
      return tx.insert(c.schema.applicationInvocations).values(row).onConflictDoNothing().returning().all();
    })
    : await c.db.transaction(async (tx) => {
      const i = c.schema.appInstances;
      const [current] = await tx.select({ revision: i.revision }).from(i)
        .where(and(eq(i.id, instance.id), eq(i.user_id, input.userId))).for("update").limit(1);
      if (!current || current.revision !== instance.revision) { throw new AppInstanceConflictError(); }
      return tx.insert(c.schema.applicationInvocations).values(row).onConflictDoNothing().returning();
    });
  if (rows[0]) {
    return { allowed: true, run: appRunResponse.parse(rows[0]), created: true };
  }
  const winner =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(1)
      : await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(1);
  if (!winner[0]) {
    throw new AppRunError("conflict", "Invocation id already in use");
  }
  return {
    allowed: true,
    run: appRunResponse.parse(winner[0]),
    created: false
  };
}

export async function setAppRunInputs(
  userId: string,
  id: string,
  inputs: Record<string, unknown>,
  secretValues?: readonly string[]
): Promise<AppRunRecord> {
  const run = await getAppRun(userId, id);
  if (!run) {
    throw new AppRunError("not_found", "App run not found");
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const patch = {
    inputs:
      run.origin === "public" || run.content_expired !== 0
        ? null
        : sanitizeAppRunVariables(inputs, secretValues)
  };
  const condition = and(
    eq(t.id, run.id),
    eq(t.user_id, userId),
    eq(t.status, "running"),
    isNotNull(t.instance_id)
  );
  if (c.dialect === "sqlite") {
    await c.db
      .update(c.schema.applicationInvocations)
      .set({ inputs: sql`case when ${t.content_expired} = 1 then null else ${patch.inputs === null ? null : JSON.stringify(patch.inputs)} end` })
      .where(condition);
  } else {
    await c.db
      .update(c.schema.applicationInvocations)
      .set({ inputs: sql`case when ${t.content_expired} = 1 then null else ${patch.inputs === null ? null : JSON.stringify(patch.inputs)} end` })
      .where(condition);
  }
  const updated = await getAppRun(userId, run.id);
  if (!updated) {
    throw new AppRunError("not_found", "App run deleted");
  }
  return updated;
}
function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function mergeInstanceOutputs(
  current: Record<string, unknown>,
  outputs: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...current, ...outputs };
  for (const key of ["__app_outputs", "__app_inputs"]) {
    if (isJsonRecord(current[key]) && isJsonRecord(outputs[key])) {
      merged[key] = { ...current[key], ...outputs[key] };
    }
  }
  return merged;
}

export interface SettleAppRunInput {
  status: Exclude<AppRunRecord["status"], "running">;
  outputs?: Record<string, unknown>;
  documents?: Array<{ kind: string; id: string }>;
  error?: string | null;
  actualUsd?: number | null;
  knownLlmUsd?: number;
  expectedRevision?: number;
  secretValues?: readonly string[];
  updateInstance?: boolean;
  contentSuppressed?: boolean;
}
export async function settleAppRun(
  userId: string,
  id: string,
  input: SettleAppRunInput
): Promise<AppRunRecord> {
  const run = await getAppRun(userId, id);
  if (!run) {
    await settleDeletedAppRunBilling(userId, id, input);
    throw new AppRunError("not_found", "App run not found");
  }
  if (run.status !== "running") {
    return run;
  }
  if (
    input.actualUsd != null &&
    (!Number.isFinite(input.actualUsd) || input.actualUsd < 0)
  ) {
    throw new AppRunError("invalid_input", "Invalid app run cost");
  }
  if (
    input.knownLlmUsd !== undefined &&
    (!Number.isFinite(input.knownLlmUsd) || input.knownLlmUsd < 0)
  ) {
    throw new AppRunError("invalid_input", "Invalid measured LLM cost");
  }
  const options: RedactionOptions = { secretValues: input.secretValues };
  const historySuppressed = run.origin === "public" || run.content_expired !== 0 || input.contentSuppressed === true;
  const outputs =
    historySuppressed
      ? null
      : sanitizeAppRunVariables(input.outputs ?? {}, input.secretValues);
  const instanceOutputs =
    run.origin !== "public" && input.status === "completed" && input.updateInstance !== false
      ? sanitizeAppInstanceVariables(input.outputs ?? {}, input.secretValues)
      : null;
  const documents =
    historySuppressed
      ? null
      : appRunResponse.shape.documents.parse(
          sanitizeAppRunContent(input.documents ?? [], input.secretValues)
        );
  const patch: Partial<NewApplicationInvocation> & { settled_at: string } = {
    status: input.status,
    outputs,
    documents,
    inputs:
      historySuppressed
        ? null
        : run.inputs === null
          ? null
          : sanitizeAppRunVariables(run.inputs, input.secretValues),
    snapshot:
      historySuppressed
        ? null
        : run.snapshot === null
          ? null
          : appRunSnapshot.parse(
              sanitizeAppRunContent(run.snapshot, input.secretValues)
            ),
    error:
      input.error && run.origin === "public"
        ? "Error"
        : input.error
          ? redactErrorTrace(
              { source: "server", message: input.error },
              options
            ).message
          : null,
    settled_at: new Date().toISOString()
  };
  if (input.knownLlmUsd !== undefined) {
    patch.known_llm_usd = input.knownLlmUsd;
  }
  if (input.actualUsd != null) {
    patch.actual_usd = input.actualUsd;
  }
  const c = getDatabase();
  if (historySuppressed) {
    patch.content_expired = 1;
    patch.error = input.contentSuppressed && input.error ? "Error" : patch.error;
  }
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const t = c.schema.applicationInvocations;
      const matched = tx
        .update(t)
        .set({ ...patch,
          snapshot: sql`case when ${t.content_expired} = 1 then null else ${patch.snapshot === null || patch.snapshot === undefined ? null : JSON.stringify(patch.snapshot)} end`,
          inputs: sql`case when ${t.content_expired} = 1 then null else ${patch.inputs === null || patch.inputs === undefined ? null : JSON.stringify(patch.inputs)} end`,
          outputs: sql`case when ${t.content_expired} = 1 then null else ${patch.outputs === null || patch.outputs === undefined ? null : JSON.stringify(patch.outputs)} end`,
          documents: sql`case when ${t.content_expired} = 1 then null else ${patch.documents === null || patch.documents === undefined ? null : JSON.stringify(patch.documents)} end`
        })
        .where(
          and(
            eq(t.id, run.id),
            eq(t.user_id, userId),
            eq(t.status, "running"),
            isNotNull(t.instance_id)
          )
        )
        .returning({ id: t.id })
        .get();
      if (
        !matched ||
        run.origin === "public" ||
        input.updateInstance === false ||
        input.status !== "completed" ||
        !instanceOutputs
      ) {
        return;
      }
      const i = c.schema.appInstances;
      const baseline = input.expectedRevision ?? run.instance_revision;
      const current = tx
        .select()
        .from(i)
        .where(and(eq(i.id, run.instance_id), eq(i.user_id, userId)))
        .get();
      const changed =
        current &&
        !outputsAreStale(current.variables, instanceOutputs, baseline) &&
        tx
          .update(i)
          .set({
            variables: stampKeyRevisions(
              current.variables,
              sanitizeAppInstanceVariables(
                mergeInstanceOutputs(current.variables, instanceOutputs),
                input.secretValues
              ),
              current.revision + 1
            ),
            revision: current.revision + 1,
            updated_at: patch.settled_at
          })
          .where(
            and(
              eq(i.id, run.instance_id),
              eq(i.user_id, userId),
              eq(i.revision, current.revision),
              run.snapshot === null ? undefined : eq(i.snapshot, run.snapshot),
              run.version === null ? isNull(i.version) : eq(i.version, run.version)
            )
          )
          .returning({ id: i.id })
          .get();
      if (!changed) {
        tx.update(t).set({ state_conflict: 1 }).where(eq(t.id, run.id)).run();
      }
    });
  } else {
    await c.db.transaction(async (tx) => {
      const t = c.schema.applicationInvocations;
      const i = c.schema.appInstances;
      const current = await tx
        .select()
        .from(i)
        .where(and(eq(i.id, run.instance_id), eq(i.user_id, userId)))
        .for("update")
        .limit(1);
      const matched = await tx
        .update(t)
        .set({ ...patch,
          snapshot: sql`case when ${t.content_expired} = 1 then null else ${patch.snapshot === null || patch.snapshot === undefined ? null : JSON.stringify(patch.snapshot)} end`,
          inputs: sql`case when ${t.content_expired} = 1 then null else ${patch.inputs === null || patch.inputs === undefined ? null : JSON.stringify(patch.inputs)} end`,
          outputs: sql`case when ${t.content_expired} = 1 then null else ${patch.outputs === null || patch.outputs === undefined ? null : JSON.stringify(patch.outputs)} end`,
          documents: sql`case when ${t.content_expired} = 1 then null else ${patch.documents === null || patch.documents === undefined ? null : JSON.stringify(patch.documents)} end`
        })
        .where(
          and(
            eq(t.id, run.id),
            eq(t.user_id, userId),
            eq(t.status, "running"),
            isNotNull(t.instance_id)
          )
        )
        .returning({ id: t.id });
      if (
        !matched[0] ||
        run.origin === "public" ||
        input.updateInstance === false ||
        input.status !== "completed" ||
        !instanceOutputs
      ) {
        return;
      }
      const baseline = input.expectedRevision ?? run.instance_revision;
      const instance = current[0];
      if (!instance || outputsAreStale(instance.variables, instanceOutputs, baseline) || instance.version !== run.version || (run.snapshot !== null && JSON.stringify(instance.snapshot) !== JSON.stringify(run.snapshot))) {
        await tx.update(t).set({ state_conflict: 1 }).where(eq(t.id, run.id));
        return;
      }
      await tx
        .update(i)
        .set({
          variables: stampKeyRevisions(
            instance.variables,
            sanitizeAppInstanceVariables(
              mergeInstanceOutputs(instance.variables, instanceOutputs),
              input.secretValues
            ),
            instance.revision + 1
          ),
          revision: instance.revision + 1,
          updated_at: patch.settled_at
        })
        .where(
          and(
            eq(i.id, run.instance_id),
            eq(i.user_id, userId),
            eq(i.revision, instance.revision),
            run.snapshot === null ? undefined : eq(i.snapshot, run.snapshot),
            run.version === null ? isNull(i.version) : eq(i.version, run.version)
          )
        );
    });
  }
  const updated = await getAppRun(userId, run.id);
  if (!updated) {
    await settleDeletedAppRunBilling(userId, run.id, input);
    throw new AppRunError("not_found", "App run deleted");
  }
  if (input.contentSuppressed) { await eraseRunTraceParentContent(userId, { kind: "app_run", id: updated.id }); }
  await settleRunTrace(userId, updated.id, {
    status: input.status, error: updated.error ?? undefined, costUsd: updated.actual_usd, contentSuppressed: input.contentSuppressed, secretValues: input.secretValues
  });
  return updated;
}
export async function deleteAppRun(
  userId: string,
  id: string
): Promise<boolean> {
  const row = await getAppRun(userId, id);
  if (!row) {
    return false;
  }
  await removeAppRuns(userId, undefined, row.id);
  return true;
}

const BILLING_TOMBSTONE = {
  instance_id: null,
  origin: null,
  snapshot: null,
  inputs: null,
  outputs: null,
  documents: null,
  instance_revision: null,
  trace_id: null,
  root_span_id: null,
  error: null,
  operation_id: "",
  content_expired: 1
};

/** Keep reservation accounting after history deletion, while removing copied user content. */
async function removeAppRuns(
  userId: string,
  instanceId?: string,
  runId?: string,
  recordCutoff?: string,
  deleteInstanceId?: string
): Promise<void> {
  if (instanceId || deleteInstanceId) {
    await eraseRunTraceParentContent(userId, { kind: "instance", id: instanceId ?? deleteInstanceId ?? "" });
  }
  if (runId) { await deleteRunTrace(userId, runId); }
  const traceConnection = getDatabase();
  const traceTable = traceConnection.schema.runTraces;
  const traceWhere = eq(traceTable.user_id, userId);
  const traceRows = traceConnection.dialect === "sqlite"
    ? await traceConnection.db.select().from(traceConnection.schema.runTraces).where(traceWhere)
    : await traceConnection.db.select().from(traceConnection.schema.runTraces).where(traceWhere);
  for (const trace of traceRows) {
    if (trace.kind !== "app") { continue; }
    if ((instanceId && trace.parents.some((parent) => parent.kind === "instance" && parent.id === instanceId)) ||
        (deleteInstanceId && trace.parents.some((parent) => parent.kind === "instance" && parent.id === deleteInstanceId)) ||
        (recordCutoff && trace.ended_at && trace.ended_at < recordCutoff)) {
      await deleteRunTrace(userId, trace.id);
    }
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(
    eq(t.user_id, userId),
    isNotNull(t.instance_id),
    instanceId ? eq(t.instance_id, instanceId) : undefined,
    runId ? eq(t.id, runId) : undefined,
    recordCutoff
      ? and(
          lt(t.settled_at, recordCutoff),
          inArray(t.status, ["completed", "failed", "cancelled"])
        )
      : undefined
  );
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const records = tx
        .select({ id: c.schema.applicationInvocations.id })
        .from(c.schema.applicationInvocations)
        .where(condition)
        .all();
      for (let offset = 0; offset < records.length; offset += 500) {
        const ids = records.slice(offset, offset + 500).map((r) => r.id);
        const a = c.schema.generationAttachments;
        const r = c.schema.applicationInvocations;
        tx.delete(a)
          .where(and(eq(a.target_type, "app_run"), inArray(a.target_id, ids)))
          .run();
        tx.update(r)
          .set(BILLING_TOMBSTONE)
          .where(and(inArray(r.id, ids), isNotNull(r.application_id)))
          .run();
        tx.delete(r)
          .where(and(inArray(r.id, ids), isNull(r.application_id)))
          .run();
      }
      if (deleteInstanceId) {
        tx.delete(c.schema.appInstances)
          .where(
            and(
              eq(c.schema.appInstances.id, deleteInstanceId),
              eq(c.schema.appInstances.user_id, userId)
            )
          )
          .run();
      }
    });
  } else {
    await c.db.transaction(async (tx) => {
      if (deleteInstanceId) {
        await tx
          .select({ id: c.schema.appInstances.id })
          .from(c.schema.appInstances)
          .where(
            and(
              eq(c.schema.appInstances.id, deleteInstanceId),
              eq(c.schema.appInstances.user_id, userId)
            )
          )
          .for("update");
      }
      const records = await tx
        .select({ id: c.schema.applicationInvocations.id })
        .from(c.schema.applicationInvocations)
        .where(condition)
        .for("update");
      for (let offset = 0; offset < records.length; offset += 500) {
        const ids = records.slice(offset, offset + 500).map((r) => r.id);
        const a = c.schema.generationAttachments;
        const r = c.schema.applicationInvocations;
        await tx
          .delete(a)
          .where(and(eq(a.target_type, "app_run"), inArray(a.target_id, ids)));
        await tx
          .update(r)
          .set(BILLING_TOMBSTONE)
          .where(and(inArray(r.id, ids), isNotNull(r.application_id)));
        await tx
          .delete(r)
          .where(and(inArray(r.id, ids), isNull(r.application_id)));
      }
      if (deleteInstanceId) {
        await tx
          .delete(c.schema.appInstances)
          .where(
            and(
              eq(c.schema.appInstances.id, deleteInstanceId),
              eq(c.schema.appInstances.user_id, userId)
            )
          );
      }
    });
  }
}

/** Lock the parent before attaching, so deletion cannot resurrect references. */
export async function attachGenerationToAppRun(
  userId: string,
  runId: string,
  generationId: string,
  outputId: string
): Promise<{ id: string } | null> {
  const run = await getAppRun(userId, runId);
  if (!run) {
    return null;
  }
  const c = getDatabase();
  const now = new Date().toISOString();
  const row = {
    id: createTimeOrderedUuid(),
    generation_id: generationId,
    output_id: outputId,
    target_type: "app_run",
    target_id: run.id,
    status: "attached",
    created_at: now,
    updated_at: now
  };
  if (c.dialect === "sqlite") {
    return c.db.transaction((tx) => {
      const t = c.schema.applicationInvocations;
      const p = c.schema.predictions;
      const o = c.schema.generationOutputs;
      const a = c.schema.generationAttachments;
      if (
        !tx
          .select({ id: t.id })
          .from(t)
          .where(
            and(
              eq(t.id, run.id),
              eq(t.user_id, userId),
              isNotNull(t.instance_id)
            )
          )
          .get()
      ) {
        return null;
      }
      if (
        !tx
          .select({ id: p.id })
          .from(p)
          .where(and(eq(p.id, generationId), eq(p.user_id, userId)))
          .get()
      ) {
        throw new AppRunError("not_found", "Generation not found");
      }
      if (
        !tx
          .select({ id: o.id })
          .from(o)
          .where(and(eq(o.id, outputId), eq(o.generation_id, generationId)))
          .get()
      ) {
        throw new AppRunError(
          "invalid_input",
          "Output does not belong to generation"
        );
      }
      tx.insert(a).values(row).onConflictDoNothing().run();
      return (
        tx
          .select({ id: a.id })
          .from(a)
          .where(
            and(
              eq(a.generation_id, generationId),
              eq(a.output_id, outputId),
              eq(a.target_type, "app_run"),
              eq(a.target_id, run.id)
            )
          )
          .get() ?? null
      );
    });
  }
  return c.db.transaction(async (tx) => {
    const t = c.schema.applicationInvocations;
    const p = c.schema.predictions;
    const o = c.schema.generationOutputs;
    const a = c.schema.generationAttachments;
    const parent = await tx
      .select({ id: t.id })
      .from(t)
      .where(
        and(eq(t.id, run.id), eq(t.user_id, userId), isNotNull(t.instance_id))
      )
      .for("update")
      .limit(1);
    if (!parent[0]) {
      return null;
    }
    const generation = await tx
      .select({ id: p.id })
      .from(p)
      .where(and(eq(p.id, generationId), eq(p.user_id, userId)))
      .limit(1);
    if (!generation[0]) {
      throw new AppRunError("not_found", "Generation not found");
    }
    const output = await tx
      .select({ id: o.id })
      .from(o)
      .where(and(eq(o.id, outputId), eq(o.generation_id, generationId)))
      .limit(1);
    if (!output[0]) {
      throw new AppRunError(
        "invalid_input",
        "Output does not belong to generation"
      );
    }
    await tx
      .insert(a)
      .values({ ...row, selected: false })
      .onConflictDoNothing();
    const rows = await tx
      .select({ id: a.id })
      .from(a)
      .where(
        and(
          eq(a.generation_id, generationId),
          eq(a.output_id, outputId),
          eq(a.target_type, "app_run"),
          eq(a.target_id, run.id)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function appRunRetentionCandidates(
  userId: string,
  contentCutoff: string,
  recordCutoff: string
): Promise<{ expiredContent: number; terminalRuns: number }> {
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const contentCondition = and(
    eq(t.user_id, userId),
    isNotNull(t.instance_id),
    eq(t.content_expired, 0),
    lt(t.created_at, contentCutoff)
  );
  const recordCondition = and(
    eq(t.user_id, userId),
    isNotNull(t.instance_id),
    lt(t.settled_at, recordCutoff),
    inArray(t.status, ["completed", "failed", "cancelled"])
  );
  const content =
    c.dialect === "sqlite"
      ? await c.db
          .select({ n: count() })
          .from(c.schema.applicationInvocations)
          .where(contentCondition)
      : await c.db
          .select({ n: count() })
          .from(c.schema.applicationInvocations)
          .where(contentCondition);
  const records =
    c.dialect === "sqlite"
      ? await c.db
          .select({ n: count() })
          .from(c.schema.applicationInvocations)
          .where(recordCondition)
      : await c.db
          .select({ n: count() })
          .from(c.schema.applicationInvocations)
          .where(recordCondition);
  return {
    expiredContent: Number(content[0]?.n ?? 0),
    terminalRuns: Number(records[0]?.n ?? 0)
  };
}
export async function pruneAppRuns(
  userId: string,
  contentCutoff: string,
  recordCutoff: string
): Promise<void> {
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const contentCondition = and(
    eq(t.user_id, userId),
    isNotNull(t.instance_id),
    eq(t.content_expired, 0),
    lt(t.created_at, contentCutoff)
  );
  const patch = {
    snapshot: null,
    inputs: null,
    outputs: null,
    documents: null,
    content_expired: 1
  };
  if (c.dialect === "sqlite") {
    await c.db
      .update(c.schema.applicationInvocations)
      .set(patch)
      .where(contentCondition);
  } else {
    await c.db
      .update(c.schema.applicationInvocations)
      .set(patch)
      .where(contentCondition);
  }
  await removeAppRuns(userId, undefined, undefined, recordCutoff);
}

export async function findAppRunByInvocation(
  userId: string,
  invocationId: string
): Promise<AppRunRecord | null> {
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(
    eq(t.user_id, userId),
    eq(t.invocation_id, invocationId),
    isNotNull(t.instance_id)
  );
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(2)
      : await c.db
          .select()
          .from(c.schema.applicationInvocations)
          .where(condition)
          .limit(2);
  if (rows.length > 1) {
    throw new AppRunError("conflict", "Ambiguous invocation id");
  }
  return rows[0] ? appRunResponse.parse(rows[0]) : null;
}

/** Only one host may execute a reserved run, including concurrent transport retries. */
export async function claimAppRun(
  userId: string,
  id: string,
  runnerInstance: string | null = null
): Promise<boolean> {
  const run = await getAppRun(userId, id);
  if (!run) {
    return false;
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(
    eq(t.id, run.id),
    eq(t.user_id, userId),
    eq(t.status, "running"),
    isNull(t.execution_started_at),
    isNotNull(t.instance_id)
  );
  const patch = {
    execution_started_at: new Date().toISOString(),
    runner_instance: runnerInstance
  };
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .update(c.schema.applicationInvocations)
          .set(patch)
          .where(condition)
          .returning({ id: c.schema.applicationInvocations.id })
      : await c.db
          .update(c.schema.applicationInvocations)
          .set(patch)
          .where(condition)
          .returning({ id: c.schema.applicationInvocations.id });
  return rows.length === 1;
}

/** Internal terminal accounting for a saved run whose history was deleted. */
export async function settleDeletedAppRunBilling(
  userId: string,
  id: string,
  input: Pick<SettleAppRunInput, "status" | "actualUsd" | "knownLlmUsd">
): Promise<boolean> {
  for (const cost of [input.actualUsd, input.knownLlmUsd]) {
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      throw new AppRunError("invalid_input", "Invalid app run cost");
    }
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const condition = and(
    eq(t.id, id),
    eq(t.user_id, userId),
    isNull(t.instance_id),
    isNotNull(t.application_id),
    eq(t.content_expired, 1),
    eq(t.status, "running")
  );
  const patch: Partial<NewApplicationInvocation> = {
    status: input.status,
    settled_at: new Date().toISOString()
  };
  if (input.actualUsd != null) {
    patch.actual_usd = input.actualUsd;
  }
  if (input.knownLlmUsd !== undefined) {
    patch.known_llm_usd = input.knownLlmUsd;
  }
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .update(c.schema.applicationInvocations)
          .set(patch)
          .where(condition)
          .returning({ id: c.schema.applicationInvocations.id })
      : await c.db
          .update(c.schema.applicationInvocations)
          .set(patch)
          .where(condition)
          .returning({ id: c.schema.applicationInvocations.id });
  if (rows.length === 0) {
    return false;
  }
  await reconcileAppRunCost(userId, id);
  return true;
}

/** Reconcile complete child accounting without releasing an unresolved reservation. */
export async function reconcileAppRunCost(
  userId: string,
  id: string,
  additionalKnownCost?: number
): Promise<AppRunRecord | null> {
  const run = await getAppRun(userId, id);
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const resolvedId = run?.id ?? id;
  const scope = and(
    eq(t.user_id, userId),
    eq(t.id, resolvedId),
    run
      ? undefined
      : and(
          isNull(t.instance_id),
          isNotNull(t.application_id),
          eq(t.content_expired, 1)
        )
  );
  const current =
    c.dialect === "sqlite"
      ? await c.db
          .select({ known: c.schema.applicationInvocations.known_llm_usd })
          .from(c.schema.applicationInvocations)
          .where(scope)
          .limit(1)
      : await c.db
          .select({ known: c.schema.applicationInvocations.known_llm_usd })
          .from(c.schema.applicationInvocations)
          .where(scope)
          .limit(1);
  if (!current[0]) {
    return null;
  }
  const knownCost = additionalKnownCost ?? current[0].known;
  if (knownCost === undefined || knownCost === null) {
    return run;
  }
  if (!Number.isFinite(knownCost) || knownCost < 0) {
    throw new AppRunError("invalid_input", "Invalid run cost");
  }
  const p = c.schema.predictions;
  const attribution =
    c.dialect === "sqlite"
      ? sql`json_extract(${p.metadata}, '$.app_run_id') = ${resolvedId}`
      : sql`(${p.metadata}::jsonb ->> 'app_run_id') = ${resolvedId}`;
  const condition = and(eq(p.user_id, userId), attribution);
  const rows =
    c.dialect === "sqlite"
      ? await c.db.select().from(c.schema.predictions).where(condition)
      : await c.db.select().from(c.schema.predictions).where(condition);
  if (
    rows.some(
      (row) =>
        row.reconciled_at === null ||
        row.cost === null ||
        !Number.isFinite(row.cost) ||
        row.cost < 0 ||
        !["completed", "failed", "cancelled"].includes(row.status)
    )
  ) {
    return run;
  }
  const actual = rows.reduce((cost, row) => cost + (row.cost ?? 0), knownCost);
  if (c.dialect === "sqlite") {
    await c.db
      .update(c.schema.applicationInvocations)
      .set({ actual_usd: actual, known_llm_usd: knownCost })
      .where(scope);
  } else {
    await c.db
      .update(c.schema.applicationInvocations)
      .set({ actual_usd: actual, known_llm_usd: knownCost })
      .where(scope);
  }
  if (run && run.status !== "running") { await settleRunTrace(userId, resolvedId, { status: run.status, costUsd: actual }); }
  return getAppRun(userId, resolvedId);
}

/** Re-price a browser reservation under the same lock used by saved-app admission. */
export async function updateAppRunEstimate(
  userId: string,
  id: string,
  estimatedUsd: number,
  requireFiniteBudget = false
): Promise<void> {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new AppRunError("invalid_input", "Invalid app run estimate");
  }
  const run = await getAppRun(userId, id);
  if (!run) {
    throw new AppRunError("not_found", "App run not found");
  }
  const c = getDatabase();
  const decision = (
    budget:
      | {
          period: string;
          max_usd: number | null;
          max_invocations: number | null;
        }
      | undefined,
    spent: number,
    invocations: number
  ) => {
    if (
      requireFiniteBudget &&
      (!budget ||
        !(
          (budget.max_usd !== null && Number.isFinite(budget.max_usd)) ||
          (budget.max_invocations !== null &&
            Number.isFinite(budget.max_invocations))
        ))
    ) {
      throw new AppRunError(
        "budget_exceeded",
        "Public runs require a finite application budget"
      );
    }
    if (
      budget &&
      ((budget.max_usd !== null && spent + estimatedUsd > budget.max_usd) ||
        (budget.max_invocations !== null &&
          invocations + 1 > budget.max_invocations))
    ) {
      throw new AppRunError(
        "budget_exceeded",
        "App run estimate exceeds the application budget"
      );
    }
  };
  const since = (period: string): string | null => {
    if (period === "total") {
      return null;
    }
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    if (period === "month") {
      now.setUTCDate(1);
    }
    return now.toISOString();
  };
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const b = c.schema.applicationBudgets;
      const t = c.schema.applicationInvocations;
      const budget = run.application_id
        ? tx
            .select()
            .from(b)
            .where(eq(b.application_id, run.application_id))
            .get()
        : undefined;
      const current = tx
        .select()
        .from(t)
        .where(and(eq(t.id, run.id), eq(t.user_id, userId)))
        .get();
      if (
        !current ||
        current.instance_id === null ||
        current.status !== "running" ||
        current.execution_started_at !== null
      ) {
        throw new AppRunError(
          "conflict",
          "App run execution already started or ended"
        );
      }
      const cutoff = since(budget?.period ?? "total");
      const totals = run.application_id
        ? tx
            .select({
              spent: sql<number>`sum(coalesce(${t.actual_usd},${t.estimated_usd}))`,
              n: count()
            })
            .from(t)
            .where(
              and(
                eq(t.application_id, run.application_id),
                sql`${t.id} <> ${run.id}`,
                cutoff ? sql`${t.created_at} >= ${cutoff}` : undefined
              )
            )
            .get()
        : undefined;
      decision(budget, Number(totals?.spent ?? 0), Number(totals?.n ?? 0));
      tx.update(t)
        .set({ estimated_usd: estimatedUsd })
        .where(and(eq(t.id, run.id), eq(t.user_id, userId)))
        .run();
    });
  } else {
    await c.db.transaction(async (tx) => {
      const b = c.schema.applicationBudgets;
      const t = c.schema.applicationInvocations;
      const budgets = run.application_id
        ? await tx
            .select()
            .from(b)
            .where(eq(b.application_id, run.application_id))
            .for("update")
            .limit(1)
        : [];
      const budget = budgets[0];
      const currents = await tx
        .select()
        .from(t)
        .where(and(eq(t.id, run.id), eq(t.user_id, userId)))
        .for("update")
        .limit(1);
      const current = currents[0];
      if (
        !current ||
        current.instance_id === null ||
        current.status !== "running" ||
        current.execution_started_at !== null
      ) {
        throw new AppRunError(
          "conflict",
          "App run execution already started or ended"
        );
      }
      const cutoff = since(budget?.period ?? "total");
      const totals = run.application_id
        ? await tx
            .select({
              spent: sql<number>`sum(coalesce(${t.actual_usd},${t.estimated_usd}))`,
              n: count()
            })
            .from(t)
            .where(
              and(
                eq(t.application_id, run.application_id),
                sql`${t.id} <> ${run.id}`,
                cutoff ? sql`${t.created_at} >= ${cutoff}` : undefined
              )
            )
        : [];
      decision(
        budget,
        Number(totals[0]?.spent ?? 0),
        Number(totals[0]?.n ?? 0)
      );
      await tx
        .update(t)
        .set({ estimated_usd: estimatedUsd })
        .where(and(eq(t.id, run.id), eq(t.user_id, userId)));
    });
  }
}

/** Shared databases reconcile only execution claimed by this server instance. */
export async function sweepInterruptedAppRuns(
  processStartIso: string,
  runnerInstance: string | null
): Promise<number> {
  if (!Number.isFinite(Date.parse(processStartIso))) {
    throw new AppRunError("invalid_input", "Invalid process start time");
  }
  const c = getDatabase();
  const t = c.schema.applicationInvocations;
  const interrupted = and(
    eq(t.status, "running"),
    runnerInstance !== null
      ? and(
          eq(t.runner_instance, runnerInstance),
          lt(t.execution_started_at, processStartIso)
        )
      : and(lt(t.created_at, processStartIso), or(isNull(t.runner_instance), ne(t.runner_instance, BROWSER_APP_RUNNER_INSTANCE)))
  );
  const condition = and(isNotNull(t.instance_id), interrupted);
  const patch = {
    status: "failed",
    error: "Execution interrupted by server restart",
    settled_at: new Date().toISOString()
  };
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .update(c.schema.applicationInvocations)
          .set(patch)
          .where(condition)
          .returning({ id: c.schema.applicationInvocations.id })
      : await c.db
          .update(c.schema.applicationInvocations)
          .set(patch)
          .where(condition)
          .returning({ id: c.schema.applicationInvocations.id });
  const deletedCondition = and(
    isNull(t.instance_id),
    isNotNull(t.application_id),
    eq(t.content_expired, 1),
    interrupted
  );
  const billingPatch = { status: "failed", settled_at: patch.settled_at };
  const deletedRows =
    c.dialect === "sqlite"
      ? await c.db
          .update(c.schema.applicationInvocations)
          .set(billingPatch)
          .where(deletedCondition)
          .returning({ id: c.schema.applicationInvocations.id })
      : await c.db
          .update(c.schema.applicationInvocations)
          .set(billingPatch)
          .where(deletedCondition)
          .returning({ id: c.schema.applicationInvocations.id });
  return rows.length + deletedRows.length;
}
