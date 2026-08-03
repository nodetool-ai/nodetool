/**
 * One failure shape for the harness commands.
 *
 * An agent that invoked a command with `--json` parses stdout. When the command
 * crashes it used to get a stderr string and nothing to parse, so the failure
 * was indistinguishable from a broken pipe. The human message still goes to
 * stderr; `--json` additionally puts `{"error": …}` on stdout.
 */
export function printCommandError(err: unknown, json?: boolean): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (json) console.log(JSON.stringify({ error: message }, null, 2));
}
