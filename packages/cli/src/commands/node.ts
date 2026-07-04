/**
 * `nodetool node` — inspect and run individual nodes.
 *
 *   nodetool node run <type> --props '{"text":"hi"}'   # run one node, print outputs
 *
 * Heavy deps (registry + runtime) load lazily inside the action.
 */
import type { Command } from "commander";

interface NodeRunCliOptions {
  props?: string;
  // Commander stores `--no-secrets` as `secrets: false` (defaults to true).
  secrets?: boolean;
  json?: boolean;
}

export function registerNodeCommands(program: Command): void {
  const node = program
    .command("node")
    .description("Inspect and run individual nodes");

  node
    .command("run <node_type>")
    .description(
      "Run a single node with the given properties and print what it emits"
    )
    .option(
      "--props <json>",
      "JSON object of property values keyed by @prop name",
      "{}"
    )
    .option("--no-secrets", "Don't resolve secrets/assets (hermetic run)")
    .option("--json", "Print the full run result as JSON")
    .action(async (nodeType: string, opts: NodeRunCliOptions) => {
      try {
        const { runSingleNode } = await import("../node/run-node.js");

        let props: Record<string, unknown>;
        try {
          props = JSON.parse(opts.props ?? "{}") as Record<string, unknown>;
        } catch (e) {
          throw new Error(`--props is not valid JSON: ${String(e)}`);
        }

        // Only touch the DB / SQLite when secrets are actually needed, so a
        // hermetic `--no-secrets` run works without the native binding built.
        const useSecrets = opts.secrets !== false;
        let secretResolver:
          | ((key: string) => Promise<string | null>)
          | undefined;
        if (useSecrets) {
          const { initDb, getSecret } = await import("@nodetool-ai/models");
          const { initMasterKey } = await import("@nodetool-ai/security");
          const { getDefaultDbPath } = await import("@nodetool-ai/config");
          initDb(getDefaultDbPath());
          try {
            await initMasterKey();
          } catch {
            // Secret decryption is best-effort; only nodes needing secrets care.
          }
          secretResolver = (key) => getSecret(key);
        }

        const result = await runSingleNode(nodeType, {
          props,
          ...(secretResolver ? { secretResolver } : {})
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const mark = result.ok ? "✅" : "❌";
          console.log(
            `\n${mark} ${nodeType}${result.title ? ` (${result.title})` : ""} — ${result.durationMs}ms`
          );
          if (result.error) console.log(`\nError: ${result.error}`);
          if (result.chunks.length > 0) {
            console.log(
              `\nEmitted ${result.chunks.length} record(s):`
            );
            for (const chunk of result.chunks) {
              console.log(`  ${JSON.stringify(chunk).slice(0, 500)}`);
            }
          } else if (result.ok) {
            console.log("\n(no output emitted)");
          }
        }
        process.exit(result.ok ? 0 : 1);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}
