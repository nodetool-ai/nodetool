/**
 * Cross-surface triage: turns the server/browser run reports into a single
 * pass/fail verdict plus an ordered list of concrete issues an agent can act on.
 *
 * The per-surface triage itself lives in `@nodetool-ai/execution` so the HTTP
 * debug endpoint and the agent-facing `debug_workflow` tool reach the same
 * verdict for the same run; this module only composes the two surfaces.
 */
import {
  collectInterventionWarnings,
  collectRunIssues,
  describeErrors
} from "@nodetool-ai/execution/debug";
import type {
  BrowserRunReport,
  DebugVerdict,
  ServerRunReport
} from "./types.js";

export function buildVerdict(
  server: ServerRunReport | null,
  browser: BrowserRunReport | null
): DebugVerdict {
  const issues: string[] = [];

  if (server) {
    issues.push(
      ...collectRunIssues("Server", server.summary, {
        ok: server.ok,
        status: server.status,
        error: server.error
      })
    );
  }

  if (browser) {
    if (browser.unavailableReason) {
      issues.push(`Browser run unavailable: ${browser.unavailableReason}`);
    } else {
      if (!browser.ok) {
        issues.push(
          `Browser run ended ${browser.status}${browser.error ? `: ${browser.error}` : ""}`
        );
      }
      issues.push(...describeErrors("Browser node", browser.summary.errors));
      for (const err of browser.consoleErrors.slice(0, 5)) {
        issues.push(
          `Browser console error: ${err.replace(/\s+/g, " ").slice(0, 200)}`
        );
      }
    }
  }

  // A surface that genuinely ran and completed is the bar for "ok"; an
  // unavailable browser surface doesn't fail the verdict on its own.
  const serverOk = server ? server.ok : true;
  const browserRan = browser ? !browser.unavailableReason : true;
  const browserOk = browser && browserRan ? browser.ok : true;
  // At least one surface must have actually run. Zero surfaces means zero
  // evidence, which is not the same as a clean run.
  const ranSomewhere = Boolean(server) || (Boolean(browser) && browserRan);
  if (!ranSomewhere) {
    issues.unshift(
      "No surface ran — nothing was executed, so nothing was verified"
    );
  }
  const ok =
    ranSomewhere &&
    serverOk &&
    browserOk &&
    issues.filter((i) => !i.startsWith("Browser run unavailable")).length === 0;

  let headline: string;
  if (ok) {
    const surfaces = [
      server && "server",
      browser && !browser.unavailableReason && "browser"
    ]
      .filter(Boolean)
      .join(" + ");
    headline = `Workflow ran clean on ${surfaces}.`;
  } else {
    const first = issues[0] ?? "unknown failure";
    headline = `Workflow has issues — ${first}`;
  }

  // Supervisor decisions are warnings, never issues: a run the supervisor
  // rescued is still a run that completed, but a reader has to be told what
  // was skipped or repaired to get there.
  const warnings = server
    ? collectInterventionWarnings("Server", server.summary)
    : [];

  const verdict: DebugVerdict = {
    ok,
    headline: ok && warnings.length > 0 ? `${headline} (supervised)` : headline,
    issues
  };
  if (warnings.length > 0) {
    verdict.warnings = warnings;
  }
  return verdict;
}
