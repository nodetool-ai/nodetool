/**
 * Renders failed provider calls for the bug-report bundle.
 *
 * A provider failure reaches the screen as one line of prose — "429 rate
 * limited" — and a maintainer reading the issue then has to ask for the
 * provider, the model, the status, the request id and what was sent. The
 * `provider_call_failed` frame carries all of it; this turns it into the text
 * that travels with the report.
 */
import type { ProviderCallFailed } from "@nodetool-ai/protocol";
import { redactSecretsInText, redactDeep } from "./bugReportBundle";

const KIND_LABELS: Record<string, string> = {
  auth: "credentials rejected",
  payment: "out of credit",
  not_found: "model not available",
  rate_limit: "rate limited or out of quota",
  timeout: "timed out",
  server: "provider-side failure",
  network: "could not reach the provider",
  client: "request refused",
  unknown: "unclassified"
};

/** `openai/gpt-5.4-mini` — what a reporter and a maintainer both name it by. */
export function providerCallTarget(failure: ProviderCallFailed): string {
  return failure.model ? `${failure.provider}/${failure.model}` : failure.provider;
}

/** One line for a banner or an issue title. */
export function providerCallSummary(failure: ProviderCallFailed): string {
  const status = failure.status != null ? ` ${failure.status}` : "";
  const kind = KIND_LABELS[failure.kind] ?? failure.kind;
  return `${providerCallTarget(failure)}${status} — ${kind}`;
}

function line(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${label}: ${String(value)}`;
}

/** The full record of one call, as it appears in `provider-call.txt`. */
export function formatProviderCallFailure(failure: ProviderCallFailed): string {
  const header = [
    line("Provider", failure.provider),
    line("Model", failure.model),
    line("Operation", failure.operation),
    line("Failure", KIND_LABELS[failure.kind] ?? failure.kind),
    line("HTTP status", failure.status),
    line("Error class", failure.error_name),
    line("Provider request id", failure.request_id),
    line("Elapsed", failure.duration_ms != null ? `${failure.duration_ms} ms` : null),
    line("When", failure.timestamp),
    line("Workflow", failure.workflow_id),
    line("Job", failure.job_id)
  ].filter((entry): entry is string => entry !== null);

  const parts = [
    header.join("\n"),
    "",
    "--- Message ---",
    redactSecretsInText(failure.message)
  ];

  if (failure.request != null) {
    const source =
      failure.request_source === "wire"
        ? "the body sent to the provider"
        : "the arguments NodeTool passed";
    parts.push(
      "",
      `--- Request (${source}, redacted and truncated) ---`,
      JSON.stringify(redactDeep(failure.request), null, 2)
    );
  }

  return parts.join("\n");
}

/** Every failed call in the report, newest first, separated for reading. */
export function formatProviderCallFailures(
  failures: ProviderCallFailed[]
): string {
  return [...failures]
    .reverse()
    .map(
      (failure, index) =>
        `=== Failed provider call ${index + 1} of ${failures.length} ===\n${formatProviderCallFailure(failure)}`
    )
    .join("\n\n");
}
