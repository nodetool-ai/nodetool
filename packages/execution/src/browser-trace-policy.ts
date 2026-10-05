import { BROWSER_TRACE_CLOSE_WINDOW_MS } from "@nodetool-ai/protocol";
import type { RunTraceScope } from "@nodetool-ai/runtime";

interface PolicyEntry { scope: RunTraceScope; expiresAt: number }
interface BrowserTracePolicy { secretValues: ReadonlySet<string>; contentSuppressed: boolean }
const policies = new Map<string, PolicyEntry>();
const POLICY_LIMIT = 1_000;
const ACTIVE_POLICY_MS = 24 * 60 * 60_000;
const sweep = setInterval(() => {
  for (const [id, entry] of policies) {
    if (entry.expiresAt < Date.now()) { policies.delete(id); }
  }
}, 60_000);
sweep.unref();

/** Keep shared secret sets in memory only, including secrets resolved after registration. */
export function rememberBrowserTracePolicy(scope: RunTraceScope, terminal = false): void {
  const existing = policies.get(scope.traceId);
  policies.delete(scope.traceId);
  policies.set(scope.traceId, { scope, expiresAt: terminal ? Date.now() + BROWSER_TRACE_CLOSE_WINDOW_MS : existing?.expiresAt ?? Date.now() + ACTIVE_POLICY_MS });
  if (policies.size > POLICY_LIMIT) {
    const oldest = policies.keys().next().value;
    if (oldest) { policies.delete(oldest); }
  }
}

/** Another worker or a restarted host cannot recover run-only secrets, so content fails closed. */
export function browserTracePolicy(userId: string, traceId: string): BrowserTracePolicy {
  const entry = policies.get(traceId);
  if (!entry || entry.expiresAt < Date.now() || entry.scope.userId !== userId) {
    policies.delete(traceId);
    return { secretValues: new Set(), contentSuppressed: true };
  }
  return { secretValues: entry.scope.secretValues, contentSuppressed: entry.scope.policy.contentSuppressed };
}

export function expireBrowserTracePolicy(traceId: string): void {
  const entry = policies.get(traceId);
  if (entry) { entry.expiresAt = Date.now() + BROWSER_TRACE_CLOSE_WINDOW_MS; }
}
