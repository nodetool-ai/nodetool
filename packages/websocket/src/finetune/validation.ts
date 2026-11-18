/**
 * The validation split: tasks no training record may come from.
 *
 * Two kinds of task are held out. Generated tasks are drawn from their own
 * seed under the `val/` prefix, so they are new problems from the same
 * families. One in three eval-suite tasks (jobs and tool-loop cases) is
 * held out by a hash of its id, so whole tasks the generator cannot produce
 * are measured too. A training task that asks for the same thing as a held-out
 * one, by id or by request text, is dropped from sampling and from export.
 */
import type { ErasedJob } from "@nodetool-ai/agents";
import { generateTasks, type ErasedFamily } from "./task-families.js";

export const VALIDATION_SEED = 2;
export const VALIDATION_PER_FAMILY = 5;

/** Request text compared without case or spacing differences. */
export function normalizeObjective(objective: string): string {
  return objective.toLowerCase().replace(/\s+/g, " ").trim();
}

/** FNV-1a: a stable hash, so the same ids are held out on every machine. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Whether an eval-suite task belongs to the validation split. */
export function isHeldOut(taskId: string): boolean {
  return fnv1a(taskId) % 3 === 0;
}

export interface Split {
  train: ErasedJob[];
  validation: ErasedJob[];
}

/**
 * Split eval-suite tasks and generated families into training and
 * validation tasks. `trainPerFamily` generated training tasks are drawn per
 * family; any whose request matches a validation request is dropped.
 */
export function splitTasks(
  suiteTasks: readonly ErasedJob[],
  families: readonly ErasedFamily[],
  trainPerFamily: number
): Split {
  const validation = [
    ...suiteTasks.filter((job) => isHeldOut(job.id)),
    ...generateTasks(families, VALIDATION_PER_FAMILY, VALIDATION_SEED, "val")
  ];
  const held = new Set(validation.map((job) => normalizeObjective(job.objective)));
  const train = [
    ...suiteTasks.filter((job) => !isHeldOut(job.id)),
    ...generateTasks(families, trainPerFamily)
  ].filter((job) => !held.has(normalizeObjective(job.objective)));
  return { train, validation };
}

/** One validation task as the frozen manifest lists it. */
export interface ValidationEntry {
  id: string;
  objective: string;
}

export function validationManifest(validation: readonly ErasedJob[]): ValidationEntry[] {
  return validation.map((job) => ({ id: job.id, objective: job.objective }));
}

/**
 * The ways a frozen manifest and the tasks the code now generates differ:
 * ids missing from either side and ids whose request changed. Empty when the
 * split is unchanged.
 */
export function manifestDrift(frozen: readonly ValidationEntry[], current: readonly ValidationEntry[]): string[] {
  const before = new Map(frozen.map((e) => [e.id, e.objective]));
  const after = new Map(current.map((e) => [e.id, e.objective]));
  const drift: string[] = [];
  for (const [id, objective] of before) {
    if (!after.has(id)) drift.push(`missing ${id}`);
    else if (after.get(id) !== objective) drift.push(`changed ${id}`);
  }
  for (const id of after.keys()) if (!before.has(id)) drift.push(`added ${id}`);
  return drift;
}
