/**
 * Dreamina jobs that were submitted but never collected.
 *
 * Dreamina runs and bills a job whether or not anyone waits for it. When the
 * provider stops waiting (its timeout, a lost tab, a cancelled caller), the
 * job keeps running and its result would be lost, and the caller's retry
 * would pay for the same clip again. So each submit is recorded under a
 * fingerprint of its request, and a later identical request polls the
 * recorded job instead of submitting a new one. A record is dropped when its
 * job is collected or has definitely failed, and expires after a day, when
 * Dreamina's history may no longer hold it.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger, getNodetoolDataDir } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.providers.dreamina");

/** A record older than this is ignored and dropped. */
const MAX_AGE_MS = 24 * 60 * 60_000;

interface PendingJob {
  submitId: string;
  at: number;
}

/** Where the provider keeps its uncollected jobs. */
export interface DreaminaPendingStore {
  /** The submit id recorded for `key`, or null when none is recorded or it expired. */
  find(key: string): string | null;
  add(key: string, submitId: string): void;
  remove(key: string): void;
}

/** A store held in memory only. Tests use it to keep the user's data directory untouched. */
export function memoryPendingStore(): DreaminaPendingStore {
  const jobs = new Map<string, PendingJob>();
  return {
    find: (key) => {
      const job = jobs.get(key);
      if (!job || Date.now() - job.at > MAX_AGE_MS) return null;
      return job.submitId;
    },
    add: (key, submitId) => void jobs.set(key, { submitId, at: Date.now() }),
    remove: (key) => void jobs.delete(key)
  };
}

/**
 * A store in one JSON file, so a job survives a server restart. Each change
 * rewrites the file through a rename. A file that cannot be read counts as
 * empty: losing a record costs a duplicate job, never a wrong result.
 */
export function filePendingStore(path = join(getNodetoolDataDir(), "dreamina-pending.json")): DreaminaPendingStore {
  const read = (): Record<string, PendingJob> => {
    try {
      const jobs = JSON.parse(readFileSync(path, "utf8")) as Record<string, PendingJob>;
      const now = Date.now();
      return Object.fromEntries(Object.entries(jobs).filter(([, job]) => job && typeof job.submitId === "string" && now - job.at <= MAX_AGE_MS));
    } catch {
      return {};
    }
  };
  const write = (jobs: Record<string, PendingJob>): void => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(jobs));
      renameSync(temporary, path);
    } catch (error) {
      log.warn("Could not record the Dreamina job", { path, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return {
    find: (key) => read()[key]?.submitId ?? null,
    add: (key, submitId) => write({ ...read(), [key]: { submitId, at: Date.now() } }),
    remove: (key) => {
      const jobs = read();
      if (!(key in jobs)) return;
      delete jobs[key];
      write(jobs);
    }
  };
}

/**
 * The fingerprint of a request: every value that changes what Dreamina
 * renders. Binary inputs count by their content hash, so two calls with the
 * same frames match even though each uploads them again.
 */
export function pendingJobKey(fields: Record<string, unknown>, inputs: Array<Uint8Array | undefined>): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(fields));
  for (const input of inputs) {
    hash.update(input ? createHash("sha256").update(input).digest("hex") : "-");
  }
  return hash.digest("hex");
}
