/**
 * Worker instance registry accessors — CRUD + lifecycle over the
 * `worker_instances` table.
 *
 * A WorkerInstance is an ephemeral, billing-sensitive live handle to a
 * provisioned GPU worker. Instances are never declarative — nothing must ever
 * resurrect a torn-down pod. They transition through
 * `provisioning → running → attached → stopping → stopped` (with `error` as a
 * terminal failure state), and carry the `{ ws_url, token }` an instance adopts
 * when attaching plus the bookkeeping the cost guard needs.
 */

import { eq } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { workerInstances } from "./schema/workers.js";

export type WorkerStatus =
  | "provisioning"
  | "running"
  | "attached"
  | "stopping"
  | "stopped"
  | "error";

export interface WorkerInstance {
  id: string;
  profile_name: string;
  target: string;
  provider_ref: string;
  ws_url: string;
  token: string | null;
  status: string;
  attached_to: string | null;
  created_at: string;
  last_activity_at: string;
  estimated_cost_usd: number | null;
}

export interface CreateWorkerInstanceInput {
  profile_name: string;
  target: string;
  provider_ref: string;
  ws_url: string;
  token?: string | null;
  attached_to?: string | null;
  estimated_cost_usd?: number | null;
}

export type WorkerInstancePatch = Partial<
  Omit<WorkerInstance, "id" | "profile_name" | "target" | "created_at">
>;

export interface ListWorkerInstancesOptions {
  status?: WorkerStatus | string;
}

/** Persist a new instance in `provisioning` and return it. */
export async function createWorkerInstance(
  input: CreateWorkerInstanceInput
): Promise<WorkerInstance> {
  const now = new Date().toISOString();
  const instance: WorkerInstance = {
    id: createTimeOrderedUuid(),
    profile_name: input.profile_name,
    target: input.target,
    provider_ref: input.provider_ref,
    ws_url: input.ws_url,
    token: input.token ?? null,
    status: "provisioning",
    attached_to: input.attached_to ?? null,
    created_at: now,
    last_activity_at: now,
    estimated_cost_usd: input.estimated_cost_usd ?? null
  };

  const db = getDb();
  await db.insert(workerInstances).values(instance);
  return instance;
}

/** Return an instance by id, or null when none exists. */
export async function getWorkerInstance(
  id: string
): Promise<WorkerInstance | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workerInstances)
    .where(eq(workerInstances.id, id))
    .limit(1);
  return row ? toInstance(row) : null;
}

/** Return all instances, optionally filtered by status. */
export async function listWorkerInstances(
  options: ListWorkerInstancesOptions = {}
): Promise<WorkerInstance[]> {
  const db = getDb();
  const rows = options.status
    ? await db
        .select()
        .from(workerInstances)
        .where(eq(workerInstances.status, options.status))
    : await db.select().from(workerInstances);
  return rows.map(toInstance);
}

/** Mutate the instance with the given id. Throws when missing. */
export async function updateWorkerInstance(
  id: string,
  patch: WorkerInstancePatch
): Promise<WorkerInstance> {
  const existing = await getWorkerInstance(id);
  if (!existing) {
    throw new Error(`Worker instance not found: ${id}`);
  }

  const updated: WorkerInstance = { ...existing, ...patch };

  const db = getDb();
  await db
    .update(workerInstances)
    .set({
      provider_ref: updated.provider_ref,
      ws_url: updated.ws_url,
      token: updated.token,
      status: updated.status,
      attached_to: updated.attached_to,
      last_activity_at: updated.last_activity_at,
      estimated_cost_usd: updated.estimated_cost_usd
    })
    .where(eq(workerInstances.id, id));

  return updated;
}

/** Update only `last_activity_at` to now. Throws when missing. */
export async function touchWorkerInstance(
  id: string
): Promise<WorkerInstance> {
  const existing = await getWorkerInstance(id);
  if (!existing) {
    throw new Error(`Worker instance not found: ${id}`);
  }

  const last_activity_at = new Date().toISOString();
  const db = getDb();
  await db
    .update(workerInstances)
    .set({ last_activity_at })
    .where(eq(workerInstances.id, id));

  return { ...existing, last_activity_at };
}

/** Remove the instance with the given id. */
export async function deleteWorkerInstance(id: string): Promise<void> {
  const db = getDb();
  await db.delete(workerInstances).where(eq(workerInstances.id, id));
}

function toInstance(
  row: typeof workerInstances.$inferSelect
): WorkerInstance {
  return {
    id: row.id,
    profile_name: row.profile_name,
    target: row.target,
    provider_ref: row.provider_ref,
    ws_url: row.ws_url,
    token: row.token,
    status: row.status,
    attached_to: row.attached_to,
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    estimated_cost_usd: row.estimated_cost_usd
  };
}
