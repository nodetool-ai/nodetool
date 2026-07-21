/**
 * `nodetool eval graph-planner` — run the GraphPlanner evaluation suite
 * against any registered provider and print/save a metrics report.
 *
 * The suite lives in `@nodetool-ai/agents` (`GRAPH_PLANNER_EVAL_CASES`); this
 * command wires up a provider from the runtime registry, the full TS node
 * registry, and (when available) configured model providers for `find_model`.
 * Heavy deps are imported lazily so command registration stays light.
 */
import type { Command } from "commander";

interface EvalCliOptions {
  provider?: string;
  model?: string;
  cases?: string;
  list?: boolean;
  json?: boolean;
  out?: string;
  maxRetries?: string;
  minSuccess?: string;
  /** commander negated flag: `--no-find-model` sets this to false. */
  findModel?: boolean;
}

export function registerEvalCommand(program: Command): void {
  const evalCmd = program
    .command("eval")
    .description("Evaluation suites for the agent system");

  evalCmd
    .command("graph-planner")
    .description(
      "Run the GraphPlanner (one-shot DSL) eval suite against a provider/model and report metrics"
    )
    .option(
      "-p, --provider <id>",
      "Provider id (anthropic, openai, claude_agent_sdk, ollama, ...)"
    )
    .option("-m, --model <id>", "Model id for the provider")
    .option(
      "--cases <ids>",
      "Comma-separated case ids to run (default: all; see --list)"
    )
    .option("--list", "List available cases and exit")
    .option("--json", "Print the full report as JSON")
    .option("--out <path>", "Write the JSON report to a file")
    .option("--max-retries <n>", "Planner attempts per case (default 3)")
    .option(
      "--min-success <rate>",
      "Exit non-zero when the success rate is below this threshold (0..1)"
    )
    .option(
      "--no-find-model",
      "Run without configured model providers (skips model-dependent cases)"
    )
    .action(async (opts: EvalCliOptions) => {
      const {
        GRAPH_PLANNER_EVAL_CASES,
        runGraphPlannerEval,
        formatEvalReport
      } = await import("@nodetool-ai/agents");

      if (opts.list) {
        for (const c of GRAPH_PLANNER_EVAL_CASES) {
          console.log(
            `${c.id.padEnd(24)} ${c.description}` +
              (c.needsModelProviders ? " (needs model providers)" : "")
          );
        }
        return;
      }

      if (!opts.provider || !opts.model) {
        console.error("--provider and --model are required (or use --list)");
        process.exitCode = 1;
        return;
      }

      let cases = GRAPH_PLANNER_EVAL_CASES;
      if (opts.cases) {
        const wanted = new Set(opts.cases.split(",").map((s) => s.trim()));
        cases = GRAPH_PLANNER_EVAL_CASES.filter((c) => wanted.has(c.id));
        const missing = [...wanted].filter(
          (id) => !cases.some((c) => c.id === id)
        );
        if (missing.length > 0) {
          console.error(
            `Unknown case ids: ${missing.join(", ")} (see --list)`
          );
          process.exitCode = 1;
          return;
        }
      }

      try {
        const [{ createProviderStrict, buildConfiguredProviders }, registryMod] =
          await Promise.all([
            import("../providers.js"),
            import("../node-registry.js")
          ]);

        const provider = await createProviderStrict(opts.provider);
        const registry = registryMod.buildFullRegistry();
        const providers =
          opts.findModel === false
            ? undefined
            : await buildConfiguredProviders();

        console.log(
          `Running ${cases.length} case(s) with ${opts.provider}/${opts.model}` +
            (providers && Object.keys(providers).length > 0
              ? ` (find_model: ${Object.keys(providers).join(", ")})`
              : " (no model providers — model-dependent cases skipped)")
        );

        const report = await runGraphPlannerEval({
          provider,
          model: opts.model,
          registry,
          providers,
          cases,
          maxRetries: opts.maxRetries ? Number(opts.maxRetries) : undefined,
          onEvent: (line) => {
            if (!opts.json) console.log(line);
          }
        });

        if (opts.out) {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(opts.out, JSON.stringify(report, null, 2), "utf-8");
          console.log(`Report written to ${opts.out}`);
        }

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log("\n" + formatEvalReport(report));
        }

        if (opts.minSuccess !== undefined) {
          const threshold = Number(opts.minSuccess);
          if (report.summary.successRate < threshold) {
            console.error(
              `Success rate ${report.summary.successRate.toFixed(2)} below threshold ${threshold}`
            );
            process.exitCode = 1;
          }
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  evalCmd
    .command("tool-loop")
    .description(
      "Run the frontend tool-loop eval suite (ui_* tools) against a provider/model and report metrics"
    )
    .option(
      "-p, --provider <id>",
      "Provider id (ollama, anthropic, openai, ...)"
    )
    .option("-m, --model <id>", "Model id for the provider")
    .option(
      "--cases <ids>",
      "Comma-separated case ids to run (default: all; see --list)"
    )
    .option("--list", "List available cases and exit")
    .option("--json", "Print the full report as JSON")
    .option("--out <path>", "Write the JSON report to a file")
    .option("--max-iterations <n>", "Turn cap per case (default 12)")
    .option(
      "--min-success <rate>",
      "Exit non-zero when the success rate is below this threshold (0..1)"
    )
    .action(async (opts: EvalCliOptions & { maxIterations?: string }) => {
      const {
        TOOL_LOOP_EVAL_CASES,
        runToolLoopEval,
        formatToolLoopReport
      } = await import("@nodetool-ai/agents");

      if (opts.list) {
        for (const c of TOOL_LOOP_EVAL_CASES) {
          console.log(
            `${c.id.padEnd(24)} ${c.description}` +
              (c.needsModelProviders ? " (needs model providers)" : "")
          );
        }
        return;
      }

      if (!opts.provider || !opts.model) {
        console.error("--provider and --model are required (or use --list)");
        process.exitCode = 1;
        return;
      }

      let cases = TOOL_LOOP_EVAL_CASES;
      if (opts.cases) {
        const wanted = new Set(opts.cases.split(",").map((s) => s.trim()));
        cases = TOOL_LOOP_EVAL_CASES.filter((c) => wanted.has(c.id));
        const missing = [...wanted].filter(
          (id) => !cases.some((c) => c.id === id)
        );
        if (missing.length > 0) {
          console.error(`Unknown case ids: ${missing.join(", ")} (see --list)`);
          process.exitCode = 1;
          return;
        }
      }

      try {
        const { createProviderStrict } = await import("../providers.js");
        const provider = await createProviderStrict(opts.provider);

        console.log(
          `Running ${cases.length} tool-loop case(s) with ${opts.provider}/${opts.model}`
        );

        const report = await runToolLoopEval({
          provider,
          model: opts.model,
          cases,
          maxIterations: opts.maxIterations
            ? Number(opts.maxIterations)
            : undefined,
          onEvent: (line) => {
            if (!opts.json) console.log(line);
          }
        });

        if (opts.out) {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(opts.out, JSON.stringify(report, null, 2), "utf-8");
          console.log(`Report written to ${opts.out}`);
        }

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log("\n" + formatToolLoopReport(report));
        }

        if (opts.minSuccess !== undefined) {
          const threshold = Number(opts.minSuccess);
          if (report.summary.successRate < threshold) {
            console.error(
              `Success rate ${report.summary.successRate.toFixed(2)} below threshold ${threshold}`
            );
            process.exitCode = 1;
          }
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
