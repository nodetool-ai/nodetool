/**
 * Worker profile accessors — CRUD over the `worker_profiles` table.
 *
 * A WorkerProfile is a declarative, reusable preset describing how to provision
 * a GPU worker (target, image, GPU/vCPU spec, token policy, cost limits). The
 * `spec` column stores provider-shaped JSON and is (de)serialized automatically
 * by the Drizzle `jsonText` custom type.
 */

import { eq } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { workerProfiles } from "./schema/workers.js";

export type WorkerTarget = "runpod" | "vast";
export type TokenPolicy = "generate" | "fixed";

export interface WorkerProfile {
  id: string;
  name: string;
  target: string;
  image: string;
  spec: Record<string, unknown>;
  token_policy: string;
  idle_timeout_minutes: number | null;
  max_lifetime_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkerProfileInput {
  name: string;
  target: WorkerTarget | string;
  image: string;
  spec?: Record<string, unknown>;
  token_policy: TokenPolicy | string;
  idle_timeout_minutes?: number | null;
  max_lifetime_minutes?: number | null;
}

export type WorkerProfilePatch = Partial<
  Omit<WorkerProfile, "id" | "name" | "created_at" | "updated_at">
>;

/** Persist a new profile and return it. Throws on a duplicate name. */
export async function createWorkerProfile(
  input: CreateWorkerProfileInput
): Promise<WorkerProfile> {
  const existing = await getWorkerProfile(input.name);
  if (existing) {
    throw new Error(`Worker profile already exists: ${input.name}`);
  }

  const now = new Date().toISOString();
  const profile: WorkerProfile = {
    id: createTimeOrderedUuid(),
    name: input.name,
    target: input.target,
    image: input.image,
    spec: input.spec ?? {},
    token_policy: input.token_policy,
    idle_timeout_minutes: input.idle_timeout_minutes ?? null,
    max_lifetime_minutes: input.max_lifetime_minutes ?? null,
    created_at: now,
    updated_at: now
  };

  const db = getDb();
  await db.insert(workerProfiles).values(profile);
  return profile;
}

/** Return a profile by name, or null when none exists. */
export async function getWorkerProfile(
  name: string
): Promise<WorkerProfile | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.name, name))
    .limit(1);
  return row ? toProfile(row) : null;
}

/** Return all profiles. */
export async function listWorkerProfiles(): Promise<WorkerProfile[]> {
  const db = getDb();
  const rows = await db.select().from(workerProfiles);
  return rows.map(toProfile);
}

/** Mutate the named profile and bump `updated_at`. Throws when missing. */
export async function updateWorkerProfile(
  name: string,
  patch: WorkerProfilePatch
): Promise<WorkerProfile> {
  const existing = await getWorkerProfile(name);
  if (!existing) {
    throw new Error(`Worker profile not found: ${name}`);
  }

  const updated: WorkerProfile = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString()
  };

  const db = getDb();
  await db
    .update(workerProfiles)
    .set({
      target: updated.target,
      image: updated.image,
      spec: updated.spec,
      token_policy: updated.token_policy,
      idle_timeout_minutes: updated.idle_timeout_minutes,
      max_lifetime_minutes: updated.max_lifetime_minutes,
      updated_at: updated.updated_at
    })
    .where(eq(workerProfiles.name, name));

  return updated;
}

/** Remove the named profile. */
export async function deleteWorkerProfile(name: string): Promise<void> {
  const db = getDb();
  await db.delete(workerProfiles).where(eq(workerProfiles.name, name));
}

function toProfile(row: typeof workerProfiles.$inferSelect): WorkerProfile {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    image: row.image,
    spec: row.spec,
    token_policy: row.token_policy,
    idle_timeout_minutes: row.idle_timeout_minutes,
    max_lifetime_minutes: row.max_lifetime_minutes,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
