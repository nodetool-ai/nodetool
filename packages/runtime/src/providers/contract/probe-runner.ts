/**
 * Runs the live half of the provider contract probes.
 *
 * One request per manifest entry, decoded by the production decoder the entry
 * names. The two ways a probe fails are reported apart: a **network failure**
 * means we never got a body to judge (DNS, timeout, 5xx, a non-JSON gateway
 * page), and a **schema failure** means the provider answered and the response
 * no longer decodes into what NodeTool needs. Only the second is a contract
 * break; treating them alike would turn every flaky night into a false alarm.
 *
 * Nothing here writes a cassette, and nothing retains a response body: what a
 * run keeps is the shape (see `summarizeShape`).
 */

import { redactText, summarizeShape } from "./redact.js";
import {
  PROBE_MANIFEST,
  type ProbeManifestEntry,
  type ProbeProvider
} from "./probe-manifest.js";

export type ProbeStatus =
  | "passed"
  | "schema-failure"
  | "network-failure"
  | "skipped";

export interface ProbeResult {
  id: string;
  provider: ProbeProvider;
  target: string;
  decoder: string;
  status: ProbeStatus;
  /** Redacted explanation for every non-passing status. */
  reason?: string;
  durationMs: number;
  requests: number;
  costUsd: number;
  /** Redacted shape of the decoded response, kept for passing probes too. */
  shape?: unknown;
}

export interface ProbeReport {
  startedAt: string;
  results: ProbeResult[];
  totals: {
    passed: number;
    schemaFailures: number;
    networkFailures: number;
    skipped: number;
    requests: number;
    costUsd: number;
  };
  perProvider: Record<string, { requests: number; costUsd: number }>;
}

export interface RunProbesOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  entries?: ProbeManifestEntry[];
  /** Wall-clock cap per request. */
  timeoutMs?: number;
  now?: () => number;
}

/** A body that never reached the decoder: the run has nothing to judge. */
class NetworkProbeError extends Error {}

async function readJsonBody(
  response: Response,
  entry: ProbeManifestEntry
): Promise<unknown> {
  const acceptsHttpError = entry.live?.acceptsHttpError ?? false;
  const text = await response.text();
  if (!response.ok && !acceptsHttpError) {
    throw new NetworkProbeError(
      `HTTP ${response.status}: ${redactText(text, 200)}`
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A gateway error page is a network-layer problem, not a contract change.
    throw new NetworkProbeError(
      `response body is not JSON (HTTP ${response.status}): ${redactText(text, 200)}`
    );
  }
}

export async function runProbes(
  options: RunProbesOptions = {}
): Promise<ProbeReport> {
  const env = options.env ?? {};
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const entries = options.entries ?? PROBE_MANIFEST;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const now = options.now ?? (() => Date.now());

  const results: ProbeResult[] = [];
  const perProvider: Record<string, { requests: number; costUsd: number }> = {};

  for (const entry of entries) {
    const spent = (perProvider[entry.provider] ??= { requests: 0, costUsd: 0 });
    const base = {
      id: entry.id,
      provider: entry.provider,
      target: entry.target,
      decoder: entry.decoder
    };
    const live = entry.live;
    if (!live) {
      results.push({
        ...base,
        status: "skipped",
        reason: `fixture only: ${entry.liveGap ?? "no live probe declared"}`,
        durationMs: 0,
        requests: 0,
        costUsd: 0
      });
      continue;
    }

    const credential = live.credential ? (env[live.credential] ?? "") : "";
    if (live.credential && !credential) {
      results.push({
        ...base,
        status: "skipped",
        reason: `${live.credential} is not set`,
        durationMs: 0,
        requests: 0,
        costUsd: 0
      });
      continue;
    }
    if (spent.requests + 1 > live.maxRequests) {
      results.push({
        ...base,
        status: "skipped",
        reason: `request budget for ${entry.provider} is spent (${live.maxRequests})`,
        durationMs: 0,
        requests: 0,
        costUsd: 0
      });
      continue;
    }
    if (spent.costUsd + live.estimatedCostUsd > live.maxCostUsd) {
      results.push({
        ...base,
        status: "skipped",
        reason: `cost budget for ${entry.provider} is spent (USD ${live.maxCostUsd})`,
        durationMs: 0,
        requests: 0,
        costUsd: 0
      });
      continue;
    }

    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: ProbeStatus = "passed";
    let reason: string | undefined;
    let shape: unknown;
    try {
      const { url, init } = live.request(env, credential);
      let body: unknown;
      try {
        const response = await fetchImpl(url, {
          ...init,
          signal: controller.signal
        });
        body = await readJsonBody(response, entry);
      } catch (err) {
        throw err instanceof NetworkProbeError
          ? err
          : new NetworkProbeError((err as Error).message);
      }
      shape = summarizeShape(body);
      entry.check(body);
    } catch (err) {
      status = err instanceof NetworkProbeError ? "network-failure" : "schema-failure";
      reason = redactText((err as Error).message);
    } finally {
      clearTimeout(timer);
    }

    spent.requests += 1;
    spent.costUsd += live.estimatedCostUsd;
    results.push({
      ...base,
      status,
      reason,
      durationMs: now() - startedAt,
      requests: 1,
      costUsd: live.estimatedCostUsd,
      shape
    });
  }

  const totals = {
    passed: results.filter((r) => r.status === "passed").length,
    schemaFailures: results.filter((r) => r.status === "schema-failure").length,
    networkFailures: results.filter((r) => r.status === "network-failure")
      .length,
    skipped: results.filter((r) => r.status === "skipped").length,
    requests: results.reduce((sum, r) => sum + r.requests, 0),
    costUsd: results.reduce((sum, r) => sum + r.costUsd, 0)
  };

  return {
    startedAt: new Date(now()).toISOString(),
    results,
    totals,
    perProvider
  };
}

/** One line per probe, for a CI log. */
export function formatProbeReport(report: ProbeReport): string {
  const icon: Record<ProbeStatus, string> = {
    passed: "✓",
    "schema-failure": "✗",
    "network-failure": "~",
    skipped: "·"
  };
  const lines = report.results.map(
    (r) =>
      `${icon[r.status]} ${r.id.padEnd(28)} ${r.status}` +
      (r.reason ? ` — ${r.reason}` : "")
  );
  lines.push(
    `\n${report.totals.passed} passed, ${report.totals.schemaFailures} schema failures, ` +
      `${report.totals.networkFailures} network failures, ${report.totals.skipped} skipped ` +
      `(${report.totals.requests} requests, ~USD ${report.totals.costUsd.toFixed(4)})`
  );
  return lines.join("\n");
}
