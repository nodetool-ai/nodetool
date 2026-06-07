/**
 * Deployment model — DB-backed deployment configuration + state.
 *
 * Each row stores one deployment's full Zod-validated config (`config_json`)
 * and runtime state (`state_json`) separately so state updates don't have to
 * round-trip the entire config. Deployments are partitioned by `user_id`,
 * matching the convention used across `nodetool_workspaces`,
 * `nodetool_secrets`, and other user-owned resources.
 *
 * Concurrency: writes use optimistic compare-and-swap on the monotonic
 * `updated_at` token (the same proven pattern as
 * `ImageDocument.updateDocumentDataIfUnchanged`), NOT a content-derived etag.
 * A content hash has an ABA hole (identical content → identical hash) and the
 * config/state columns are written independently, so `updated_at` is the
 * single authoritative CAS token. The CAS predicate is scoped to the column
 * set actually being written: a state-only write and an independent config
 * edit therefore do not false-conflict on each other (each re-reads the
 * current `updated_at` inside a bounded retry loop and re-issues the swap).
 *
 * The `etag` column is still populated (md5 over config+state) so external
 * consumers that surface a weak validator keep working, but it is never used
 * as the CAS token.
 */

import { eq, and, asc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid, computeEtag } from "./base-model.js";
import { getDb } from "./db.js";
import { deployments } from "./schema/deployments.js";

export interface DeploymentRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  enabled: boolean;
  config_json: string;
  state_json: string;
  etag: string;
  created_at: string;
  updated_at: string;
}

/**
 * Thrown when an optimistic compare-and-swap fails because the row was
 * modified concurrently (or, for a fresh insert, because another insert won
 * the `(user_id, name)` race). Carries the owning `user_id` and the
 * deployment name so callers can produce a precise error without re-reading
 * the row.
 *
 * `Error.name` follows the standard convention (the class name) so logging,
 * serialization, and name-based instance checks behave as expected. The
 * deployment name the contract refers to is exposed under both
 * `deploymentName` and the convenience `userId` mirror.
 */
export class DeploymentConflictError extends Error {
  readonly user_id: string;
  readonly deploymentName: string;

  constructor(userId: string, deploymentName: string) {
    super(
      `Deployment ${JSON.stringify(deploymentName)} for user ${JSON.stringify(userId)} was modified concurrently`
    );
    this.name = "DeploymentConflictError";
    this.user_id = userId;
    this.deploymentName = deploymentName;
  }
}

/**
 * Monotonic next-token: a fresh ISO timestamp that is strictly greater than
 * `previous`. If the clock has not advanced past `previous` we bump by 1ms so
 * the CAS token always changes (mirrors `image-document.nextUpdatedAtAfter`).
 */
function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

function rowEtag(configJson: string, stateJson: string): string {
  return computeEtag({ config: configJson, state: stateJson });
}

/**
 * Detect a `(user_id, name)` UNIQUE-index violation across both dialects.
 * SQLite (better-sqlite3) surfaces `SQLITE_CONSTRAINT_UNIQUE` /
 * "UNIQUE constraint failed"; postgres surfaces SQLSTATE `23505`.
 */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "SQLITE_CONSTRAINT_UNIQUE" || e.code === "23505") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /unique constraint/i.test(msg) || /UNIQUE constraint failed/i.test(msg);
}

const MAX_CAS_RETRIES = 5;

export class Deployment extends DBModel {
  static override table = deployments;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare type: string;
  declare enabled: boolean;
  declare config_json: string;
  declare state_json: string;
  declare etag: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.enabled ??= true;
    this.config_json ??= "{}";
    this.state_json ??= "{}";
    this.etag ??= "";
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
    this.etag = rowEtag(this.config_json, this.state_json);
  }

  /** Look up by (user_id, name). Returns null if not found. */
  static async findByName(
    userId: string,
    name: string
  ): Promise<Deployment | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(deployments)
      .where(and(eq(deployments.user_id, userId), eq(deployments.name, name)))
      .limit(1);
    return row ? new Deployment(row as Record<string, unknown>) : null;
  }

  /** List all deployments owned by a user, ordered by name. */
  static async listForUser(userId: string): Promise<Deployment[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.user_id, userId))
      .orderBy(asc(deployments.name));
    return rows.map((r: Record<string, unknown>) => new Deployment(r));
  }

  /**
   * Insert a new deployment or update an existing one (by user_id + name).
   *
   * Config writes are user-initiated, so a lost CAS surfaces as a
   * `DeploymentConflictError` to the caller (after a bounded retry to absorb
   * benign interleavings). The update CAS is scoped to the config-bearing
   * columns (`type`, `enabled`, `config_json`, `etag`, `updated_at`) and an
   * optional `state_json`, so it does NOT clobber a concurrent state-only
   * write that touched a disjoint column set.
   *
   * Caller is responsible for serializing `config`/`state` to JSON; this model
   * treats the JSON as opaque so we don't pull the full Zod schema into the
   * models package.
   */
  static async upsert(input: {
    user_id: string;
    name: string;
    type: string;
    enabled?: boolean;
    config_json: string;
    state_json?: string;
  }): Promise<Deployment> {
    const db = getDb();

    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const existing = await Deployment.findByName(input.user_id, input.name);

      if (existing) {
        const nextState =
          input.state_json !== undefined ? input.state_json : existing.state_json;
        const now = nextUpdatedAtAfter(existing.updated_at);
        const rows = await db
          .update(deployments)
          .set({
            type: input.type,
            enabled: input.enabled ?? existing.enabled,
            config_json: input.config_json,
            ...(input.state_json !== undefined
              ? { state_json: input.state_json }
              : {}),
            etag: rowEtag(input.config_json, nextState),
            updated_at: now
          })
          .where(
            and(
              eq(deployments.user_id, input.user_id),
              eq(deployments.name, input.name),
              eq(deployments.updated_at, existing.updated_at)
            )
          )
          .returning();

        const row = rows[0] as Record<string, unknown> | undefined;
        if (row) {
          return new Deployment(row);
        }
        // Lost the CAS — another writer touched the row. Re-read and retry.
        continue;
      }

      // No existing row: attempt a fresh insert. Two concurrent inserts have
      // different random ids, so the `(user_id, name)` UNIQUE index — not the
      // primary key — is what guards uniqueness. Map that violation to a
      // conflict and loop so the winner's row is picked up as an update.
      const now = new Date().toISOString();
      const stateJson = input.state_json ?? "{}";
      const newRow = {
        id: createTimeOrderedUuid(),
        user_id: input.user_id,
        name: input.name,
        type: input.type,
        enabled: input.enabled ?? true,
        config_json: input.config_json,
        state_json: stateJson,
        etag: rowEtag(input.config_json, stateJson),
        created_at: now,
        updated_at: now
      };
      try {
        await db.insert(deployments).values(newRow);
        return new Deployment(newRow);
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Another insert won the race; loop to take the update path.
          continue;
        }
        throw err;
      }
    }

    throw new DeploymentConflictError(input.user_id, input.name);
  }

  /**
   * Compare-and-swap on `state_json` only, gated on `expectedUpdatedAt`.
   *
   * Writes ONLY `state_json` (+ `etag` recomputed against the existing config
   * + the new `updated_at` token); it never reads or rewrites `config_json`,
   * so it cannot clobber a concurrent config edit. Returns the updated row, or
   * `null` if the CAS was lost (the row's `updated_at` had already moved on).
   *
   * This is the low-level primitive: callers that need read-merge-validate
   * should thread it through a bounded retry loop (see `writeState`) so the
   * merge re-runs against fresh state on every attempt rather than dropping a
   * concurrent disjoint state field.
   */
  static async writeStateIfUnchanged(
    userId: string,
    name: string,
    expectedUpdatedAt: string,
    stateJson: string,
    existingConfigJson: string
  ): Promise<Deployment | null> {
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(deployments)
      .set({
        state_json: stateJson,
        etag: rowEtag(existingConfigJson, stateJson),
        updated_at: now
      })
      .where(
        and(
          eq(deployments.user_id, userId),
          eq(deployments.name, name),
          eq(deployments.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? new Deployment(row) : null;
  }

  /**
   * Patch only the `state_json` column, replacing it wholesale with
   * `stateJson`, under a bounded compare-and-swap retry loop.
   *
   * Each attempt re-reads the current `updated_at` and re-issues a
   * state-only CAS, so an independent config edit running concurrently does
   * not cause a spurious failure — the loop simply re-reads and re-swaps.
   * Intra-`apply()` status writes therefore self-heal under contention and do
   * not surface a user-facing conflict; only sustained contention (exhausted
   * retries) throws `DeploymentConflictError`.
   *
   * For read-merge-validate semantics (merge new fields into the existing
   * state under the same CAS) use {@link mutateState} instead.
   */
  static async writeState(
    userId: string,
    name: string,
    stateJson: string
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const row = await Deployment.findByName(userId, name);
      if (!row) {
        throw new Error(
          `Deployment ${JSON.stringify(name)} not found for user ${JSON.stringify(userId)}`
        );
      }
      const updated = await Deployment.writeStateIfUnchanged(
        userId,
        name,
        row.updated_at,
        stateJson,
        row.config_json
      );
      if (updated) return;
      // Lost the CAS; re-read and retry.
    }
    throw new DeploymentConflictError(userId, name);
  }

  /**
   * Read → mutate → CAS-write the state blob under a bounded retry loop.
   *
   * The `mutator` receives the freshly-read state object and the loaded row on
   * EACH attempt and returns the new state object to persist; the read, the
   * mutation, and any validation the caller performs all happen INSIDE the
   * retry loop. Concurrent disjoint state fields (e.g. `apply()` sets `status`
   * while a `status()` poll sets `pod_id`) therefore re-merge on retry instead
   * of last-writer-wins-dropping. Returns the persisted state object.
   *
   * Throws `Error("…not found…")` if the deployment is missing, and
   * `DeploymentConflictError` only after `maxRetries` lost swaps.
   */
  static async mutateState(
    userId: string,
    name: string,
    mutator: (
      state: Record<string, unknown>,
      row: Deployment
    ) => Record<string, unknown> | Promise<Record<string, unknown>>,
    maxRetries = MAX_CAS_RETRIES
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const row = await Deployment.findByName(userId, name);
      if (!row) {
        throw new Error(
          `Deployment ${JSON.stringify(name)} not found for user ${JSON.stringify(userId)}`
        );
      }
      const state = JSON.parse(row.state_json || "{}") as Record<
        string,
        unknown
      >;
      const nextState = await mutator(state, row);
      const updated = await Deployment.writeStateIfUnchanged(
        userId,
        name,
        row.updated_at,
        JSON.stringify(nextState),
        row.config_json
      );
      if (updated) return nextState;
      // Lost the CAS; re-read, re-merge, retry.
    }
    throw new DeploymentConflictError(userId, name);
  }

  /** Remove a deployment (by user_id + name). Returns true if a row was removed. */
  static async remove(userId: string, name: string): Promise<boolean> {
    const row = await Deployment.findByName(userId, name);
    if (!row) return false;
    const db = getDb();
    await db
      .delete(deployments)
      .where(and(eq(deployments.user_id, userId), eq(deployments.name, name)));
    return true;
  }

  /** Bulk-remove all deployments for a user. Returns the number removed. */
  static async removeAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const rows = await Deployment.listForUser(userId);
    if (rows.length === 0) return 0;
    await db.delete(deployments).where(eq(deployments.user_id, userId));
    return rows.length;
  }
}
