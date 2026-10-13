/**
 * One failure shape for the harness commands.
 *
 * An agent that invoked a command with `--json` parses stdout. When the command
 * crashes it used to get a stderr string and nothing to parse, so the failure
 * was indistinguishable from a broken pipe. The human message still goes to
 * stderr; `--json` additionally puts `{"error": …}` on stdout.
 */
import { missingRuntimeDetailsOf, missingRuntimeDetailsSchema, missingRuntimeText, type MissingRuntimeDetails } from "@nodetool-ai/protocol";

export function commandMissingRuntime(value: unknown): MissingRuntimeDetails | null {
  const details = missingRuntimeDetailsOf(value);
  if (details) { return details; }
  if (!value || typeof value !== "object") { return null; }
  if ("missingRuntime" in value) {
    const parsed = missingRuntimeDetailsSchema.safeParse(value.missingRuntime);
    if (parsed.success) { return parsed.data; }
  }
  if ("server" in value && value.server && typeof value.server === "object" && "missingRuntime" in value.server) {
    const parsed = missingRuntimeDetailsSchema.safeParse(value.server.missingRuntime);
    if (parsed.success) { return parsed.data; }
  }
  return null;
}

/** Missing runtimes use the shared install-required exit code. */
export function commandFailureExitCode(error: unknown): 1 | 3 {
  return commandMissingRuntime(error) ? 3 : 1;
}

export function printCommandError(err: unknown, json?: boolean): 1 | 3 {
  const missing = commandMissingRuntime(err);
  const message = missing ? missingRuntimeText(missing) : err instanceof Error ? err.message : String(err);
  console.error(message);
  if (json) console.log(JSON.stringify(missing ? { error: "missing_runtime_package", ...missing } : { error: message }, null, 2));
  return commandFailureExitCode(err);
}
