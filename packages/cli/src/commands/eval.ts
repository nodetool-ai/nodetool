/**
 * `nodetool eval <suite>` — run a registered evaluation suite against any
 * provider and print/save a metrics report.
 *
 * Suites are data, not code: each entry in `EVAL_SUITES` describes one suite
 * (its subcommand name, how to list its cases, and how to run it). The shared
 * runner wires up a provider from the runtime registry, the full TS node
 * registry, and (when available) configured model providers for `find_model`,
 * then hands them to the suite. Adding a suite means pushing an `EvalSuite`
 * entry — not another hand-wired command block.
 *
 * The GraphPlanner suite lives in `@nodetool-ai/agents`
 * (`GRAPH_PLANNER_EVAL_CASES`). Heavy deps are imported lazily so command
 * registration stays light.
 */
import type { Command } from "commander";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

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

/** Metadata for one eval case, shown by `--list`. */
interface EvalCaseMeta {
  id: string;
  description: string;
  /** Case needs configured model providers (`find_model`) to be solvable. */
  needsModelProviders?: boolean;
}

/** Runtime deps handed to a suite's `run`, built once by the shared runner. */
interface EvalRunDeps {
  /** Provider constructed from `--provider`. */
  provider: BaseProvider;
  /** The raw `--provider` id (for display). */
  providerId: string;
  model: string;
  registry: NodeRegistry;
  /** Configured providers for `find_model`; undefined when `--no-find-model`. */
  providers?: Record<string, BaseProvider>;
  /** Case ids to run; undefined runs the whole suite. */
  caseIds?: string[];
  maxRetries?: number;
  /** Progress callback (one line per event, for CLI display). */
  onEvent: (line: string) => void;
}

/** Outcome of a suite run, consumed by the shared runner. */
interface EvalRunResult {
  /** Opaque report object; written verbatim when `--out`/`--json` are set. */
  report: unknown;
  /** Human-readable report for the default (non-JSON) output. */
  formatted: string;
  /** Overall success rate (0..1) for the `--min-success` gate. */
  successRate: number;
}

/**
 * A registered evaluation suite. Adding a suite is data — push an entry to
 * `EVAL_SUITES` — not another hand-wired command block.
 */
interface EvalSuite {
  /** Subcommand name, e.g. `graph-planner` (`nodetool eval graph-planner`). */
  id: string;
  description: string;
  /** Case metadata for `--list`. */
  listCases(): Promise<EvalCaseMeta[]>;
  /** Run the suite against the built deps. */
  run(deps: EvalRunDeps): Promise<EvalRunResult>;
}

/** GraphPlanner one-shot DSL suite (`@nodetool-ai/agents`). */
const graphPlannerSuite: EvalSuite = {
  id: "graph-planner",
  description:
    "Run the GraphPlanner (one-shot DSL) eval suite against a provider/model and report metrics",
  async listCases() {
    const { GRAPH_PLANNER_EVAL_CASES } = await import("@nodetool-ai/agents");
    return GRAPH_PLANNER_EVAL_CASES.map((c) => ({
      id: c.id,
      description: c.description,
      needsModelProviders: c.needsModelProviders
    }));
  },
  async run(deps) {
    const { GRAPH_PLANNER_EVAL_CASES, runGraphPlannerEval, formatEvalReport } =
      await import("@nodetool-ai/agents");

    let cases = GRAPH_PLANNER_EVAL_CASES;
    if (deps.caseIds) {
      const wanted = new Set(deps.caseIds);
      cases = GRAPH_PLANNER_EVAL_CASES.filter((c) => wanted.has(c.id));
      const missing = [...wanted].filter(
        (id) => !cases.some((c) => c.id === id)
      );
      if (missing.length > 0) {
        throw new Error(`Unknown case ids: ${missing.join(", ")} (see --list)`);
      }
    }

    console.log(
      `Running ${cases.length} case(s) with ${deps.providerId}/${deps.model}` +
        (deps.providers && Object.keys(deps.providers).length > 0
          ? ` (find_model: ${Object.keys(deps.providers).join(", ")})`
          : " (no model providers — model-dependent cases skipped)")
    );

    const report = await runGraphPlannerEval({
      provider: deps.provider,
      model: deps.model,
      registry: deps.registry,
      providers: deps.providers,
      cases,
      maxRetries: deps.maxRetries,
      onEvent: deps.onEvent
    });

    return {
      report,
      formatted: formatEvalReport(report),
      successRate: report.summary.successRate
    };
  }
};

/** All evaluation suites exposed under `nodetool eval <suite>`. */
export const EVAL_SUITES: readonly EvalSuite[] = [graphPlannerSuite];

/**
 * Shared runner for every suite: handles `--list`, builds the provider/
 * registry/find-model deps, runs the suite, and applies the common
 * `--out`/`--json`/`--min-success` handling.
 */
async function runSuite(suite: EvalSuite, opts: EvalCliOptions): Promise<void> {
  if (opts.list) {
    for (const c of await suite.listCases()) {
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

  try {
    const [{ createProviderStrict, buildConfiguredProviders }, registryMod] =
      await Promise.all([
        import("../providers.js"),
        import("../node-registry.js")
      ]);

    const provider = await createProviderStrict(opts.provider);
    const registry = registryMod.buildFullRegistry();
    const providers =
      opts.findModel === false ? undefined : await buildConfiguredProviders();

    const caseIds = opts.cases
      ? opts.cases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const result = await suite.run({
      provider,
      providerId: opts.provider,
      model: opts.model,
      registry,
      providers,
      caseIds,
      maxRetries: opts.maxRetries ? Number(opts.maxRetries) : undefined,
      onEvent: (line) => {
        if (!opts.json) console.log(line);
      }
    });

    if (opts.out) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        opts.out,
        JSON.stringify(result.report, null, 2),
        "utf-8"
      );
      console.log(`Report written to ${opts.out}`);
    }

    if (opts.json) {
      console.log(JSON.stringify(result.report, null, 2));
    } else {
      console.log("\n" + result.formatted);
    }

    if (opts.minSuccess !== undefined) {
      const threshold = Number(opts.minSuccess);
      if (result.successRate < threshold) {
        console.error(
          `Success rate ${result.successRate.toFixed(2)} below threshold ${threshold}`
        );
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export function registerEvalCommand(program: Command): void {
  const evalCmd = program
    .command("eval")
    .description("Evaluation suites for the agent system");

  for (const suite of EVAL_SUITES) {
    evalCmd
      .command(suite.id)
      .description(suite.description)
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
      .action((opts: EvalCliOptions) => runSuite(suite, opts));
  }
}
