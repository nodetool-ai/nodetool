/**
 * `nodetool node` — inspect and run individual nodes.
 *
 *   nodetool node run <type> --props '{"text":"hi"}'   # run one node, print outputs
 *
 * Heavy deps (registry + runtime) load lazily inside the action.
 */
import type { Command } from "commander";
import { asJson, printTable } from "./output.js";
import { printCommandError, commandMissingRuntime, commandMissingPack } from "../command-errors.js";
import { installMissingPacksAndReexec } from "./install-missing-packs.js";

interface NodeRunCliOptions {
  props?: string;
  // Commander stores `--no-secrets` as `secrets: false` (defaults to true).
  secrets?: boolean;
  json?: boolean;
  installMissing?: boolean;
}

export function registerNodeCommands(program: Command): void {
  const node = program
    .command("node")
    .description("Inspect and run individual nodes");

  node
    .command("list [query]")
    .description("List installed TypeScript node types (optionally filter by type or title)")
    .option("--json", "Print complete node metadata as JSON")
    .action(async (query: string | undefined, opts: { json?: boolean }) => {
      try {
        const { buildFullRegistry } = await import("../node-registry.js");
        const registry = await buildFullRegistry();
        const search = query?.toLowerCase() ?? "";
        const nodes = registry.listMetadata()
          .filter((meta) => registry.has(meta.node_type))
          .filter((meta) => `${meta.node_type} ${meta.title}`.toLowerCase().includes(search))
          .sort((a, b) => a.node_type.localeCompare(b.node_type));
        if (opts.json) {
          asJson(nodes);
        } else if (nodes.length === 0) {
          console.log('No installed node types match. Run "nodetool packs list" to inspect installed packs.');
        } else {
          printTable(nodes.map((meta) => ({ type: meta.node_type, title: meta.title })));
          console.log('Use "nodetool node info <type>" for properties and outputs.');
        }
      } catch (error) {
        process.exitCode = printCommandError(error, opts.json);
      }
    });

  node
    .command("info <node_type>")
    .description("Show an installed node's properties, defaults, inputs and outputs")
    .option("--json", "Print complete node metadata as JSON")
    .action(async (nodeType: string, opts: { json?: boolean }) => {
      try {
        const { buildFullRegistry } = await import("../node-registry.js");
        const registry = await buildFullRegistry();
        if (!registry.has(nodeType)) {
          throw new Error(`Node type "${nodeType}" is not installed. Use "nodetool node list" or "nodetool packs list".`);
        }
        asJson(registry.getMetadata(nodeType));
      } catch (error) {
        process.exitCode = printCommandError(error, opts.json);
      }
    });

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
    .option("--install-missing", "Authorize missing node pack installation, then re-execute once")
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
          const { initDb } = await import("@nodetool-ai/models");
          const { resolveLocalSecret } = await import("../local-secrets.js");
          const { initMasterKey } = await import("@nodetool-ai/security");
          const { getDefaultDbPath } = await import("@nodetool-ai/config");
          initDb(getDefaultDbPath());
          try {
            await initMasterKey();
          } catch {
            // Secret decryption is best-effort; only nodes needing secrets care.
          }
          secretResolver = resolveLocalSecret;
        }

        const runOptions: Parameters<typeof runSingleNode>[1] = { props };
        if (secretResolver) {
          runOptions.secretResolver = secretResolver;
        }
        const result = await runSingleNode(nodeType, runOptions);
        if (!result.ok && (commandMissingRuntime(result) || commandMissingPack(result))) {
          const exit = await installMissingPacksAndReexec(result, { command: "node-run", installMissing: opts.installMissing });
          if (exit !== null) { process.exit(exit); }
          process.exit(printCommandError(result, opts.json));
        }

        const { printRunJson, previewJson } = await import("../run-json.js");
        if (opts.json) {
          await printRunJson(result);
        } else {
          const mark = result.ok ? "✅" : "❌";
          console.log(
            `\n${mark} ${nodeType}${result.title ? ` (${result.title})` : ""} — ${result.durationMs}ms`
          );
          if (result.error) console.log(`\nError: ${result.error}`);
          if (result.chunks.length > 0) {
            console.log(`\nEmitted ${result.chunks.length} record(s):`);
            for (const chunk of result.chunks) {
              console.log(`  ${previewJson(chunk, 500)}`);
            }
          } else if (result.ok) {
            console.log("\n(no output emitted)");
          }
        }
        process.exit(result.ok ? 0 : 1);
      } catch (e) {
        const exit = await installMissingPacksAndReexec(e, { command: "node-run", installMissing: opts.installMissing });
        if (exit !== null) { process.exit(exit); }
        process.exit(printCommandError(e, opts.json));
      }
    });
}
