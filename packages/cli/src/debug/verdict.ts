/**
 * Cross-surface triage: turns the server/browser run reports into a single
 * pass/fail verdict plus an ordered list of concrete issues an agent can act on.
 */
import type {
  BrowserRunReport,
  DebugVerdict,
  ServerRunReport
} from "./types.js";

function describeErrors(
  prefix: string,
  errors: ReadonlyArray<{ nodeId: string | null; nodeType?: string | null; message: string }>,
  limit = 5
): string[] {
  return errors.slice(0, limit).map((e) => {
    const where = e.nodeType ?? e.nodeId ?? "workflow";
    return `${prefix} ${where}: ${e.message.replace(/\s+/g, " ").slice(0, 200)}`;
  });
}

export function buildVerdict(
  server: ServerRunReport | null,
  browser: BrowserRunReport | null
): DebugVerdict {
  const issues: string[] = [];

  if (server) {
    if (!server.ok) {
      issues.push(`Server run ended ${server.status}${server.error ? `: ${server.error}` : ""}`);
    }
    issues.push(...describeErrors("Server node", server.summary.errors));
    for (const call of server.summary.llmCalls) {
      if (call.error) issues.push(`Server LLM ${call.provider}/${call.model}: ${call.error}`);
    }
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
        issues.push(`Browser console error: ${err.replace(/\s+/g, " ").slice(0, 200)}`);
      }
    }
  }

  // A surface that genuinely ran and completed is the bar for "ok"; an
  // unavailable browser surface doesn't fail the verdict on its own.
  const serverOk = server ? server.ok : true;
  const browserRan = browser ? !browser.unavailableReason : true;
  const browserOk = browser && browserRan ? browser.ok : true;
  const ok = serverOk && browserOk && issues.filter((i) => !i.startsWith("Browser run unavailable")).length === 0;

  let headline: string;
  if (ok) {
    const surfaces = [server && "server", browser && !browser.unavailableReason && "browser"]
      .filter(Boolean)
      .join(" + ");
    headline = `Workflow ran clean on ${surfaces || "no surface"}.`;
  } else {
    const first = issues[0] ?? "unknown failure";
    headline = `Workflow has issues — ${first}`;
  }

  return { ok, headline, issues };
}
