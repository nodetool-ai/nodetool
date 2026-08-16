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
 * The suites live in `@nodetool-ai/agents`: graph authoring
 * (`GRAPH_PLANNER_EVAL_CASES`, typed-DSL CodeAct) and the frontend tool-loop
 * (`TOOL_LOOP_EVAL_CASES`, multi-turn `ui_*` tool calling). Heavy deps are
 * imported lazily so command registration stays light.
 */
import type { Command } from "commander";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { parseNumericOption } from "../numeric-options.js";

interface EvalCliOptions {
  provider?: string;
  model?: string;
  cases?: string;
  list?: boolean;
  json?: boolean;
  out?: string;
  maxRetries?: string;
  maxIterations?: string;
  timeout?: string;
  minSuccess?: string;
  /** `provider/model` for the suites that judge their own output. */
  judgeModel?: string;
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
  /** Turn cap per case, for loop-style suites (tool-loop). */
  maxIterations?: number;
  /** Per-case execution timeout (ms), for suites that run what they plan. */
  timeoutMs?: number;
  /**
   * Judge provider/model for the suites that grade their own output
   * (`graph-e2e`, `app-build`), from `--judge-model`. Undefined leaves each
   * suite's own default in place.
   */
  judge?: { provider: BaseProvider; model: string };
  /**
   * Human-facing line (suite preamble). A no-op under `--json`, so stdout
   * carries exactly one JSON document.
   */
  log: (line: string) => void;
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

/**
 * Filter a suite's cases down to `--cases`, rejecting ids the suite doesn't
 * have. Undefined ids run the whole suite.
 */
function selectCases<T extends { id: string }>(
  all: readonly T[],
  caseIds: string[] | undefined
): readonly T[] {
  if (!caseIds) return all;
  const wanted = new Set(caseIds);
  const picked = all.filter((c) => wanted.has(c.id));
  const pickedIds = new Set(picked.map((c) => c.id));
  const missing = [...wanted].filter((id) => !pickedIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown case ids: ${missing.join(", ")} (see --list)`);
  }
  return picked;
}

/** Graph authoring suite — `authorGraph` over the typed DSL pack. */
const graphPlannerSuite: EvalSuite = {
  id: "graph-planner",
  description:
    "Run the graph authoring eval suite (authorGraph, typed DSL pack) against a provider/model and report metrics",
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

    const cases = selectCases(GRAPH_PLANNER_EVAL_CASES, deps.caseIds);

    deps.log(
      `Running ${cases.length} case(s) with ${deps.providerId}/${deps.model}` +
        (deps.providers && Object.keys(deps.providers).length > 0
          ? ` (find_model: ${Object.keys(deps.providers).join(", ")})`
          : " (no model providers — model-dependent cases skipped)")
    );

    const evalOptions: Parameters<typeof runGraphPlannerEval>[0] = {
      provider: deps.provider,
      model: deps.model,
      registry: deps.registry,
      providers: deps.providers,
      cases,
      onEvent: deps.onEvent
    };
    if (deps.maxIterations) {
      evalOptions.maxIterations = deps.maxIterations;
    }
    const report = await runGraphPlannerEval(evalOptions);

    return {
      report,
      formatted: formatEvalReport(report),
      successRate: report.summary.successRate
    };
  }
};

/**
 * End-to-end graph suite: plan a workflow, run it on the kernel, judge the
 * outputs against the case's goal.
 *
 * This is the one suite that executes what the planner produced, so it needs a
 * `GraphRunner` — built here over `ExecutionSession` — and it costs real
 * inference twice per case (the run, then the judge). Its success rate is the
 * end-to-end claim: planned AND ran AND achieved the goal.
 */
const graphE2eSuite: EvalSuite = {
  id: "graph-e2e",
  description:
    "Plan a workflow with the agent, execute it, and judge whether the outputs achieve the goal",
  async listCases() {
    const { GRAPH_E2E_EVAL_CASES } = await import("@nodetool-ai/agents");
    return GRAPH_E2E_EVAL_CASES.map((c) => ({
      id: c.id,
      description: c.description,
      needsModelProviders: c.needsModelProviders
    }));
  },
  async run(deps) {
    const { GRAPH_E2E_EVAL_CASES, runGraphE2eEval, formatGraphE2eReport } =
      await import("@nodetool-ai/agents");
    const { createEvalGraphRunner } = await import("../evals/graph-runner.js");

    const cases = selectCases(GRAPH_E2E_EVAL_CASES, deps.caseIds);

    deps.log(
      `Running ${cases.length} graph-e2e case(s) with ${deps.providerId}/${deps.model}` +
        (deps.providers && Object.keys(deps.providers).length > 0
          ? ` (find_model: ${Object.keys(deps.providers).join(", ")})`
          : " (no model providers — model-dependent cases skipped)")
    );

    const evalOptions: Parameters<typeof runGraphE2eEval>[0] = {
      provider: deps.provider,
      model: deps.model,
      registry: deps.registry,
      providers: deps.providers,
      runGraph: createEvalGraphRunner(),
      cases,
      timeoutMs: deps.timeoutMs,
      onEvent: deps.onEvent
    };
    // Without this the judge is the run's own provider/model grading itself.
    if (deps.judge) {
      evalOptions.judgeProvider = deps.judge.provider;
      evalOptions.judgeModel = deps.judge.model;
    }
    if (deps.maxIterations) {
      evalOptions.maxIterations = deps.maxIterations;
    }
    const report = await runGraphE2eEval(evalOptions);

    return {
      report,
      formatted: formatGraphE2eReport(report),
      successRate: report.summary.successRate
    };
  }
};

/**
 * Code node authoring suite (`CodePlanner` + `submit_code`).
 *
 * Its gate reads post-repair acceptance — a submission accepted at all within
 * the round cap — while the report also carries first-pass acceptance, which is
 * what the model managed without the tool's feedback.
 */
const codeGenSuite: EvalSuite = {
  id: "code-gen",
  description:
    "Run the Code node authoring eval suite (CodePlanner writes one typed Code node) against a provider/model, reporting first-pass and post-repair acceptance",
  async listCases() {
    const { CODE_GEN_EVAL_CASES } = await import("@nodetool-ai/agents");
    return CODE_GEN_EVAL_CASES.map((c) => ({
      id: c.id,
      description: c.description
    }));
  },
  async run(deps) {
    const { CODE_GEN_EVAL_CASES, runCodeGenEval, formatCodeGenReport } =
      await import("@nodetool-ai/agents");

    const cases = selectCases(CODE_GEN_EVAL_CASES, deps.caseIds);
    deps.log(
      `Running ${cases.length} code-gen case(s) with ${deps.providerId}/${deps.model}`
    );

    const report = await runCodeGenEval({
      provider: deps.provider,
      model: deps.model,
      cases,
      onEvent: deps.onEvent
    });

    return {
      report,
      formatted: formatCodeGenReport(report),
      successRate: report.summary.postRepairRate
    };
  }
};

/** Sub-agent execution suite (RunSubtaskTool + inherited toolset). */
const subtaskSuite: EvalSuite = {
  id: "subtask",
  description:
    "Run the sub-agent execution eval suite (run_subtask delegates to a child agent that runs the inherited tools) against a provider/model",
  async listCases() {
    const { SUBTASK_EVAL_CASES } = await import("@nodetool-ai/agents");
    return SUBTASK_EVAL_CASES.map((c) => ({
      id: c.id,
      description: c.description,
      needsModelProviders: c.needsModelProviders
    }));
  },
  async run(deps) {
    const { SUBTASK_EVAL_CASES, runSubtaskEval, formatSubtaskReport } =
      await import("@nodetool-ai/agents");

    const cases = selectCases(SUBTASK_EVAL_CASES, deps.caseIds);

    deps.log(
      `Running ${cases.length} subtask case(s) with ${deps.providerId}/${deps.model}` +
        (deps.providers && Object.keys(deps.providers).length > 0
          ? ""
          : " (no model providers — model-dependent cases skipped)")
    );

    const report = await runSubtaskEval({
      provider: deps.provider,
      model: deps.model,
      providers: deps.providers,
      cases,
      maxIterations: deps.maxIterations,
      onEvent: deps.onEvent
    });

    return {
      report,
      formatted: formatSubtaskReport(report),
      successRate: report.summary.successRate
    };
  }
};

/** CodeAct execution suite. */
const codeActSuite: EvalSuite = {
  id: "codeact",
  description:
    "Run the CodeAct execution eval suite (steps act by writing sandboxed JavaScript over the toolbelt — docs/codeact-design.md) against a provider/model",
  async listCases() {
    const {
      CODEACT_EVAL_CASES,
      CODEACT_API_EVAL_CASES,
      CODEACT_SANDBOX_PACK_EVAL_CASES
    } = await import("@nodetool-ai/agents");
    return [
      ...CODEACT_EVAL_CASES,
      ...CODEACT_API_EVAL_CASES,
      ...CODEACT_SANDBOX_PACK_EVAL_CASES
    ].map((c) => ({
      id: c.id,
      description: c.description
    }));
  },
  async run(deps) {
    const {
      CODEACT_EVAL_CASES,
      CODEACT_API_EVAL_CASES,
      CODEACT_SANDBOX_PACK_EVAL_CASES,
      runCodeActEval,
      formatCodeActReport
    } = await import("@nodetool-ai/agents");

    const cases = selectCases(
      [
        ...CODEACT_EVAL_CASES,
        ...CODEACT_API_EVAL_CASES,
        ...CODEACT_SANDBOX_PACK_EVAL_CASES
      ],
      deps.caseIds
    );
    deps.log(
      `Running ${cases.length} codeact case(s) with ${deps.providerId}/${deps.model}`
    );

    const report = await runCodeActEval({
      provider: deps.provider,
      model: deps.model,
      cases,
      maxIterations: deps.maxIterations,
      onEvent: deps.onEvent
    });

    return {
      report,
      formatted: formatCodeActReport(report),
      successRate: report.summary.successRate
    };
  }
};

/** TaskPlanner multi-task (plan mode) DAG-quality suite. */
const taskPlannerSuite: EvalSuite = {
  id: "task-planner",
  description:
    "Run the TaskPlanner (plan mode) eval suite — multi-task DAG quality: parallelism, decomposition size, tool routing — against a provider/model",
  async listCases() {
    const { TASK_PLANNER_EVAL_CASES } = await import("@nodetool-ai/agents");
    return TASK_PLANNER_EVAL_CASES.map((c) => ({
      id: c.id,
      description: c.description,
      needsModelProviders: c.needsModelProviders
    }));
  },
  async run(deps) {
    const {
      TASK_PLANNER_EVAL_CASES,
      runTaskPlannerEval,
      formatTaskPlanReport
    } = await import("@nodetool-ai/agents");

    const cases = selectCases(TASK_PLANNER_EVAL_CASES, deps.caseIds);
    deps.log(
      `Running ${cases.length} task-planner case(s) with ${deps.providerId}/${deps.model}`
    );

    const report = await runTaskPlannerEval({
      provider: deps.provider,
      model: deps.model,
      providers: deps.providers,
      cases,
      maxRetries: deps.maxRetries,
      onEvent: deps.onEvent
    });

    return {
      report,
      formatted: formatTaskPlanReport(report),
      successRate: report.summary.successRate
    };
  }
};

/**
 * Mini-app build suite: prompt in, verified `ApplicationBundle` out.
 *
 * The only suite that both plans workflows and runs them, so it needs the
 * kernel runner (`runOnServer`, the same one `nodetool app debug` uses) and a
 * real `ProcessingContext`. Its two deterministic cases author from a script
 * and never touch the provider, so `--cases greeting-card,draft-then-publish`
 * runs with no API keys at all — that is the Quality Gate's leg. The gate reads
 * green-within-budget; the report also carries the one-shot rate the PRD calls
 * the north star.
 */
const appBuildSuite: EvalSuite = {
  id: "app-build",
  description:
    "Run the mini-app build eval suite (nodetool app build end to end) against a provider/model, reporting one-shot and green-within-budget rates",
  async listCases() {
    const { APP_BUILD_EVAL_CASES } = await import("@nodetool-ai/agents");
    return APP_BUILD_EVAL_CASES.map((c) => ({
      id: c.id,
      description: c.description,
      needsModelProviders: c.needsModelProviders
    }));
  },
  async run(deps) {
    const [
      { APP_BUILD_EVAL_CASES, runAppBuildEval, formatAppBuildReport },
      { runOnServer },
      { getDefaultAssetsPath },
      { getSecret },
      { ProcessingContext, FileStorageAdapter }
    ] = await Promise.all([
      import("@nodetool-ai/agents"),
      import("../debug/server-runner.js"),
      import("@nodetool-ai/config"),
      import("@nodetool-ai/models"),
      import("@nodetool-ai/runtime")
    ]);

    const cases = selectCases(APP_BUILD_EVAL_CASES, deps.caseIds);
    deps.log(
      `Running ${cases.length} app-build case(s) with ${deps.providerId}/${deps.model}` +
        (deps.providers && Object.keys(deps.providers).length > 0
          ? ` (find_model: ${Object.keys(deps.providers).join(", ")})`
          : " (no model providers — prompt cases skipped)")
    );

    const evalOptions: Parameters<typeof runAppBuildEval>[0] = {
      provider: deps.provider,
      model: deps.model,
      registry: deps.registry,
      context: new ProcessingContext({
        jobId: `eval-app-build-${Date.now()}`,
        workflowId: null,
        userId: "1",
        secretResolver: getSecret,
        storage: new FileStorageAdapter(getDefaultAssetsPath())
      }),
      runOnServer,
      cases,
      onEvent: deps.onEvent
    };
    if (deps.providers) {
      evalOptions.providers = deps.providers;
    }
    // `--judge-model` overrides `buildApp`'s own judge default.
    if (deps.judge) {
      evalOptions.judge = {
        enabled: true,
        provider: deps.judge.provider,
        model: deps.judge.model
      };
    }
    if (deps.timeoutMs !== undefined) {
      evalOptions.timeoutMs = deps.timeoutMs;
    }
    const report = await runAppBuildEval(evalOptions);

    return {
      report,
      formatted: formatAppBuildReport(report),
      successRate: report.summary.greenWithinBudgetRate
    };
  }
};

/** Minimal shape of a tool-loop case, enough for `--list` + id filtering. */
interface ToolLoopCaseLike {
  id: string;
  description: string;
  needsModelProviders?: boolean;
}

/**
 * Build a tool-loop suite (multi-turn `ui_*` tool calling) from a named export
 * in `@nodetool-ai/agents`. The graph-editor suite and the five editor-surface
 * suites (script/sketch/timeline/storyboard/3D) all share the generic runner
 * and report shape — only the case array differs — so each is data, not code.
 */
function makeToolLoopSuite(
  id: string,
  description: string,
  casesExport: string
): EvalSuite {
  const pickCases = (
    mod: Record<string, unknown>
  ): readonly ToolLoopCaseLike[] => {
    const picked = mod[casesExport];
    if (!Array.isArray(picked)) {
      throw new Error(
        `Eval suite "${id}" expected an array export "${casesExport}" from ` +
          `@nodetool-ai/agents, but got ${picked === undefined ? "undefined" : typeof picked}.`
      );
    }
    return picked as readonly ToolLoopCaseLike[];
  };

  return {
    id,
    description,
    async listCases() {
      const mod = (await import("@nodetool-ai/agents")) as unknown as Record<
        string,
        unknown
      >;
      return pickCases(mod).map((c) => ({
        id: c.id,
        description: c.description,
        needsModelProviders: c.needsModelProviders
      }));
    },
    async run(deps) {
      const mod = await import("@nodetool-ai/agents");
      const { runToolLoopEval, formatToolLoopReport } = mod;
      const cases = selectCases(
        pickCases(mod as unknown as Record<string, unknown>),
        deps.caseIds
      );

      deps.log(
        `Running ${cases.length} ${id} case(s) with ${deps.providerId}/${deps.model}`
      );

      const report = await runToolLoopEval({
        provider: deps.provider,
        model: deps.model,
        // Cases are surface-specific in their final-state type; the runner is
        // generic and scores each case against its own predicates.
        cases: cases as unknown as Parameters<
          typeof runToolLoopEval
        >[0]["cases"],
        maxIterations: deps.maxIterations,
        onEvent: deps.onEvent
      });

      return {
        report,
        formatted: formatToolLoopReport(report),
        successRate: report.summary.successRate
      };
    }
  };
}

/** All evaluation suites exposed under `nodetool eval <suite>`. */
export const EVAL_SUITES: readonly EvalSuite[] = [
  graphPlannerSuite,
  graphE2eSuite,
  codeGenSuite,
  taskPlannerSuite,
  subtaskSuite,
  codeActSuite,
  appBuildSuite,
  makeToolLoopSuite(
    "tool-loop",
    "Run the frontend graph-editor tool-loop eval suite (ui_* graph tools) against a provider/model and report metrics",
    "TOOL_LOOP_EVAL_CASES"
  ),
  makeToolLoopSuite(
    "workflow-escalation",
    "Run the workflow-tool escalation eval suite (ui_* graph tools plus an ask_user channel to a scripted user) against a provider/model",
    "WORKFLOW_ESCALATION_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "script-tools",
    "Run the Script surface tool-loop eval suite (ui_script_* tools) against a provider/model",
    "SCRIPT_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "jsscript-tools",
    "Run the JS-script surface tool-loop eval suite (ui_jsscript_* tools, real sandbox execution) against a provider/model",
    "JS_SCRIPT_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "sketch-tools",
    "Run the Sketch/image-editor surface tool-loop eval suite (ui_sketch_* tools) against a provider/model",
    "SKETCH_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "timeline-tools",
    "Run the Timeline/video-editor surface tool-loop eval suite (ui_timeline_* tools) against a provider/model",
    "TIMELINE_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "storyboard-tools",
    "Run the Storyboard surface tool-loop eval suite (ui_storyboard_* tools) against a provider/model",
    "STORYBOARD_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "model3d-tools",
    "Run the 3D model-editor surface tool-loop eval suite (ui_3d_* tools) against a provider/model",
    "MODEL3D_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "app-tools",
    "Run the App Builder surface tool-loop eval suite (ui_app_* tools) against a provider/model",
    "APP_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "thread-memory-tools",
    "Run the thread-memory tool-loop eval suite (thread_memory_*/asset tools, real DB) against a provider/model",
    "THREAD_MEMORY_TOOL_LOOP_CASES"
  ),
  makeToolLoopSuite(
    "creative-pipeline",
    "Run the long-horizon creative eval: one commission carried through brief, ideation, sketch, storyboard, cut and review across the composed ui_sketch_*/ui_storyboard_*/ui_timeline_* surfaces",
    "CREATIVE_PIPELINE_TOOL_LOOP_CASES"
  )
];

/**
 * Shared runner for every suite: handles `--list`, builds the provider/
 * registry/find-model deps, runs the suite, and applies the common
 * `--out`/`--json`/`--min-success` handling.
 */
async function runSuite(suite: EvalSuite, opts: EvalCliOptions): Promise<void> {
  if (opts.list) {
    const cases = await suite.listCases();
    if (opts.json) {
      console.log(JSON.stringify(cases, null, 2));
      return;
    }
    for (const c of cases) {
      console.log(
        `${c.id.padEnd(24)} ${c.description}` +
          (c.needsModelProviders ? " (needs model providers)" : "")
      );
    }
    return;
  }

  if (!opts.provider || !opts.model) {
    const message = "--provider and --model are required (or use --list)";
    console.error(message);
    if (opts.json) console.log(JSON.stringify({ error: message }, null, 2));
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

    const judge = opts.judgeModel
      ? await resolveJudge(opts.judgeModel, createProviderStrict)
      : undefined;

    const runOptions: Parameters<typeof suite.run>[0] = {
      provider,
      providerId: opts.provider,
      model: opts.model,
      registry,
      providers,
      caseIds,
      maxRetries:
        opts.maxRetries !== undefined
          ? parseNumericOption(opts.maxRetries, "--max-retries", {
              integer: true,
              min: 0
            })
          : undefined,
      maxIterations:
        opts.maxIterations !== undefined
          ? parseNumericOption(opts.maxIterations, "--max-iterations", {
              integer: true,
              min: 1
            })
          : undefined,
      timeoutMs:
        opts.timeout !== undefined
          ? parseNumericOption(opts.timeout, "--timeout", {
              integer: true,
              min: 0
            })
          : undefined,
      log: (line) => {
        if (!opts.json) console.log(line);
      },
      onEvent: (line) => {
        if (!opts.json) console.log(line);
      }
    };
    if (judge) {
      runOptions.judge = judge;
    }
    const result = await suite.run(runOptions);

    if (opts.out) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        opts.out,
        JSON.stringify(result.report, null, 2),
        "utf-8"
      );
      if (!opts.json) console.log(`Report written to ${opts.out}`);
    }

    if (opts.json) {
      console.log(JSON.stringify(result.report, null, 2));
    } else {
      console.log("\n" + result.formatted);
    }

    if (opts.minSuccess !== undefined) {
      const threshold = parseNumericOption(opts.minSuccess, "--min-success", {
        min: 0,
        max: 1
      });
      if (result.successRate < threshold) {
        console.error(
          `Success rate ${result.successRate.toFixed(2)} below threshold ${threshold}`
        );
        process.exitCode = 1;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    // An agent reading `--json` gets parseable output on the failure path too.
    if (opts.json) console.log(JSON.stringify({ error: message }, null, 2));
    process.exitCode = 1;
  }
}

/**
 * Resolve `--judge-model` (`provider/model`) into a live provider. Model ids
 * carry slashes themselves, so the split is decided by the provider registry,
 * exactly as `--supervisor-model` does.
 */
async function resolveJudge(
  spec: string,
  createProvider: (id: string) => Promise<BaseProvider>
): Promise<{ provider: BaseProvider; model: string }> {
  const { listRegisteredProviderIds } = await import("@nodetool-ai/runtime");
  const registered = listRegisteredProviderIds();
  const cut = spec.indexOf("/");
  const head = cut === -1 ? spec : spec.slice(0, cut).toLowerCase();
  if (cut === -1 || !registered.includes(head)) {
    throw new Error(
      `--judge-model must be "<provider>/<model>" with a registered provider ` +
        `(got "${spec}"). Example: openai/gpt-5.4-mini.`
    );
  }
  return { provider: await createProvider(head), model: spec.slice(cut + 1) };
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
        "--max-iterations <n>",
        "Turn cap per case for loop-style suites (tool-loop; default 12)"
      )
      .option(
        "--timeout <ms>",
        "Per-case execution timeout for suites that run what they plan (graph-e2e; default 300000)"
      )
      .option(
        "--judge-model <provider/model>",
        "Model that judges outputs for the self-judging suites (graph-e2e, app-build). Default: the run's own provider/model, which grades its own work"
      )
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
