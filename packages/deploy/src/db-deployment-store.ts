/**
 * DB-backed replacement for the file-based DeploymentConfig + StateManager.
 *
 * Stores one row per deployment in `nodetool_deployments`, partitioned by
 * `user_id`. Treats every operation as user-scoped — there is no global
 * "view all deployments" path here, because each user owns their own set.
 *
 * The on-disk shape stored in `config_json` matches the existing Zod schema
 * `AnyDeployment` (sans `state`, which lives in its own column). This keeps
 * the deployers untouched — they continue to receive the same parsed config
 * objects whether the source is YAML or the database.
 */

import { Deployment } from "@nodetool-ai/models";
import {
  type AnyDeployment,
  type DeploymentConfig,
  type DefaultsConfig,
  DefaultsConfigSchema,
  parseDeploymentConfig
} from "./deployment-config.js";
import { z } from "zod";

const AnyDeploymentRecordSchema = z.discriminatedUnion("type", [
  // Imported from deployment-config; we just re-validate via parseDeploymentConfig
  // by wrapping into a single-deployment config.
  z.object({ type: z.literal("docker") }).passthrough(),
  z.object({ type: z.literal("runpod") }).passthrough(),
  z.object({ type: z.literal("gcp") }).passthrough(),
  z.object({ type: z.literal("fly") }).passthrough(),
  z.object({ type: z.literal("railway") }).passthrough(),
  z.object({ type: z.literal("huggingface") }).passthrough()
]);
export type AnyDeploymentRecord = z.infer<typeof AnyDeploymentRecordSchema>;

/**
 * Validate a single deployment dict against the discriminated union
 * `AnyDeployment` from `deployment-config.ts`. Reuses the existing
 * `parseDeploymentConfig` so we get exactly the same Zod-derived shape
 * (defaults, type narrowing) without exporting AnyDeploymentSchema.
 */
function validateDeployment(
  data: unknown,
  state: unknown
): AnyDeployment {
  const cfg = parseDeploymentConfig({
    deployments: { __tmp__: { ...(data as Record<string, unknown>), state } }
  });
  return cfg.deployments.__tmp__ as AnyDeployment;
}

function splitState(deployment: AnyDeployment): {
  config: Omit<AnyDeployment, "state">;
  state: AnyDeployment["state"];
} {
  const { state, ...config } = deployment;
  return { config: config as Omit<AnyDeployment, "state">, state };
}

export interface DbDeploymentStoreOptions {
  /** Owning user. All operations are scoped to this user_id. */
  userId: string;
  /**
   * Optional defaults block. Mirrors the YAML config's `defaults` section.
   * If omitted, defaults will be reconstructed from settings storage by the
   * caller — this store does not own defaults state.
   */
  defaults?: DefaultsConfig;
}

/**
 * Per-user, DB-backed view of a `DeploymentConfig`.
 *
 * Methods mirror the parts of the old file API that callers actually use:
 *  - `loadConfig()` — produce an in-memory `DeploymentConfig` from DB rows.
 *  - `upsertDeployment()` — insert or replace a deployment.
 *  - `removeDeployment()` — delete by name.
 *  - `readState()` / `writeState()` — same semantics as `StateManager`.
 *
 * No file locking is needed; the database handles concurrency.
 */
export class DbDeploymentStore {
  readonly userId: string;
  readonly defaults: DefaultsConfig;

  constructor(opts: DbDeploymentStoreOptions) {
    if (!opts.userId) {
      throw new Error("DbDeploymentStore requires a non-empty userId");
    }
    this.userId = opts.userId;
    this.defaults = opts.defaults ?? DefaultsConfigSchema.parse({});
  }

  /** Build a `DeploymentConfig` from DB rows for this user. */
  async loadConfig(): Promise<DeploymentConfig> {
    const rows = await Deployment.listForUser(this.userId);
    const deployments: Record<string, AnyDeployment> = {};
    for (const row of rows) {
      const config = JSON.parse(row.config_json);
      const state = JSON.parse(row.state_json || "{}");
      deployments[row.name] = validateDeployment(config, state);
    }
    return {
      version: "2.0",
      defaults: this.defaults,
      deployments
    };
  }

  /** Get a single deployment by name, or null. */
  async getDeployment(name: string): Promise<AnyDeployment | null> {
    const row = await Deployment.findByName(this.userId, name);
    if (!row) return null;
    const config = JSON.parse(row.config_json);
    const state = JSON.parse(row.state_json || "{}");
    return validateDeployment(config, state);
  }

  /** List the names of all deployments owned by this user. */
  async listNames(): Promise<string[]> {
    const rows = await Deployment.listForUser(this.userId);
    return rows.map((r) => r.name);
  }

  /** Insert or replace a deployment. Validates before writing. */
  async upsertDeployment(
    name: string,
    deployment: AnyDeployment
  ): Promise<AnyDeployment> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Invalid deployment name ${JSON.stringify(name)}`);
    }
    const validated = validateDeployment(deployment, deployment.state);
    const { config, state } = splitState(validated);
    await Deployment.upsert({
      user_id: this.userId,
      name,
      type: validated.type,
      enabled: validated.enabled,
      config_json: JSON.stringify(config),
      state_json: JSON.stringify(state ?? {})
    });
    return validated;
  }

  /** Delete a deployment by name. Returns true if it existed. */
  async removeDeployment(name: string): Promise<boolean> {
    return Deployment.remove(this.userId, name);
  }

  /** Wipe every deployment owned by this user (used on user deletion). */
  async removeAllForUser(): Promise<number> {
    return Deployment.removeAllForUser(this.userId);
  }

  // -------------------------------------------------------------------------
  // State manager surface — drop-in replacement for the parts callers use.
  // -------------------------------------------------------------------------

  async readState(name: string): Promise<Record<string, unknown> | null> {
    const row = await Deployment.findByName(this.userId, name);
    if (!row) return null;
    return JSON.parse(row.state_json || "{}") as Record<string, unknown>;
  }

  async writeState(
    name: string,
    stateUpdates: Record<string, unknown>,
    updateTimestamp = true
  ): Promise<void> {
    const row = await Deployment.findByName(this.userId, name);
    if (!row) {
      throw new Error(
        `Deployment ${JSON.stringify(name)} not found for user ${JSON.stringify(this.userId)}`
      );
    }
    const current = JSON.parse(row.state_json || "{}") as Record<string, unknown>;
    Object.assign(current, stateUpdates);
    if (updateTimestamp) {
      current.last_deployed = new Date().toISOString();
    }
    // Re-validate via the discriminated union so we catch bad state shapes
    // before persisting them.
    const config = JSON.parse(row.config_json);
    const validated = validateDeployment(config, current);
    await Deployment.writeState(
      this.userId,
      name,
      JSON.stringify(validated.state)
    );
  }

  async updateDeploymentStatus(
    name: string,
    status: string,
    updateTimestamp = true
  ): Promise<void> {
    await this.writeState(name, { status }, updateTimestamp);
  }

  async getAllStates(): Promise<Record<string, Record<string, unknown>>> {
    const rows = await Deployment.listForUser(this.userId);
    const states: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      states[row.name] = JSON.parse(row.state_json || "{}");
    }
    return states;
  }

  async getLastDeployed(name: string): Promise<Date | null> {
    const state = await this.readState(name);
    if (!state) return null;
    const last = state["last_deployed"];
    if (typeof last !== "string") return null;
    const d = new Date(last);
    return isNaN(d.getTime()) ? null : d;
  }
}
