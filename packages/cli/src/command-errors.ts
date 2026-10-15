/**
 * One failure shape for the harness commands.
 *
 * An agent that invoked a command with `--json` parses stdout. When the command
 * crashes it used to get a stderr string and nothing to parse, so the failure
 * was indistinguishable from a broken pipe. The human message still goes to
 * stderr; `--json` additionally puts `{"error": …}` on stdout.
 */
import { z } from "zod";
import { missingRuntimeDetailsOf, missingRuntimeDetailsSchema, missingRuntimeText, type MissingRuntimeDetails } from "@nodetool-ai/protocol";

const commandFailureSchema = z.object({
  missingRuntime: missingRuntimeDetailsSchema.optional().catch(undefined),
  server: z.object({
    missingRuntime: missingRuntimeDetailsSchema.optional().catch(undefined)
  }).optional().catch(undefined)
});

export function commandMissingRuntime(value: unknown): MissingRuntimeDetails | null {
  const details = missingRuntimeDetailsOf(value);
  if (details) { return details; }
  const parsed = commandFailureSchema.safeParse(value);
  return parsed.success ? parsed.data.missingRuntime ?? parsed.data.server?.missingRuntime ?? null : null;
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
