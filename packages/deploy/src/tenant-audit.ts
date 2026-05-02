/**
 * Append-only audit log for tenant deployment activity.
 *
 * Each tenant gets their own JSONL log under `<tenant.dir>/audit.jsonl` so
 * deletion of a tenant cleanly removes their history. Entries are written
 * atomically with `O_APPEND` and are never updated in place.
 *
 * The log records who did what, when, against which deployment, and the
 * resulting status (so a forensic reader can reconstruct the timeline of a
 * tenant's deployments without trusting in-memory state).
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface TenantAuditEntry {
  /** ISO 8601 timestamp. */
  ts: string;
  /** Tenant who owns the log. */
  tenant_id: string;
  /** Identifier of the actor performing the action (defaults to tenant_id). */
  actor: string;
  /** Dot-namespaced action (e.g. `deployment.apply`, `credential.set`). */
  action: string;
  /** Optional deployment name within the tenant's scope. */
  deployment?: string;
  /** Outcome — `ok` or `error`. */
  status: "ok" | "error";
  /** Optional error message when status is `error`. */
  error?: string;
  /** Free-form metadata (must be JSON-serializable). */
  meta?: Record<string, unknown>;
}

export interface AppendAuditInput {
  tenant_id: string;
  actor?: string;
  action: string;
  deployment?: string;
  status: "ok" | "error";
  error?: string;
  meta?: Record<string, unknown>;
}

/**
 * Write one audit entry. Creates the parent directory on demand. Caller passes
 * the resolved log path so the audit logger doesn't need to know the tenant
 * directory layout.
 */
export async function appendAuditEntry(
  logPath: string,
  input: AppendAuditInput
): Promise<TenantAuditEntry> {
  const entry: TenantAuditEntry = {
    ts: new Date().toISOString(),
    tenant_id: input.tenant_id,
    actor: input.actor ?? input.tenant_id,
    action: input.action,
    deployment: input.deployment,
    status: input.status,
    error: input.error,
    meta: input.meta
  };

  await fs.mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });

  // O_APPEND ensures the kernel guarantees atomic appends across writers up to
  // PIPE_BUF (4096 on Linux). Each line stays well under that.
  const line = JSON.stringify(entry) + "\n";
  const fh = await fs.open(logPath, "a", 0o600);
  try {
    await fh.write(line);
  } finally {
    await fh.close();
  }
  return entry;
}

/**
 * Read all audit entries for a tenant. Returns `[]` if the log does not yet
 * exist. Malformed lines are skipped (logged via the optional `onSkip` hook)
 * so a single bad write can't poison the entire history.
 */
export async function readAuditLog(
  logPath: string,
  onSkip?: (line: string, err: unknown) => void
): Promise<TenantAuditEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(logPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const lines = raw.split("\n");
  const out: TenantAuditEntry[] = [];
  for (const line of lines) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as TenantAuditEntry);
    } catch (err) {
      onSkip?.(line, err);
    }
  }
  return out;
}
