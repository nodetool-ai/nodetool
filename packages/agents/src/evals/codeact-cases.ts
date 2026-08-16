/**
 * CodeAct eval cases — objectives with instrumented tools where the
 * interesting metrics are action rounds and tool routing. The same cases run
 * through tool mode for the paper's comparison (Wang et al., arXiv:2402.01030)
 * on our own toolbelt, so every objective is solvable in either action space.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import { isObjectLike } from "../utils/type-guards.js";

export interface CodeActToolRecorder {
  invocations: Array<{ name: string; args: Record<string, unknown> }>;
}

export function createCodeActRecorder(): CodeActToolRecorder {
  return { invocations: [] };
}

export class RecordingTool<TResult> extends Tool {
  constructor(
    readonly name: string,
    readonly description: string,
    protected override readonly jsonSchema: Record<string, unknown>,
    private readonly recorder: CodeActToolRecorder,
    private readonly impl: (params: Record<string, unknown>) => TResult
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<TResult> {
    this.recorder.invocations.push({ name: this.name, args: params });
    return this.impl(params);
  }
}

const CITY_POPULATIONS: Record<string, number> = {
  berlin: 3_755_251,
  hamburg: 1_892_122,
  munich: 1_512_491,
  cologne: 1_084_831,
  frankfurt: 773_068
};

/**
 * The worker toolbelt: deterministic, offline, and instrumented. `flaky_fetch`
 * fails on its first call and succeeds afterwards, so recovery is observable.
 */
export function createCodeActTools(recorder: CodeActToolRecorder): Tool[] {
  let flakyCalls = 0;
  return [
    new RecordingTool(
      "calculate",
      "Evaluate an arithmetic expression with + - * / and parentheses.",
      {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"]
      },
      recorder,
      (params) => {
        const expr = String(params["expression"] ?? "");
        if (!/^[\d\s+\-*/().]+$/.test(expr)) {
          return { error: "invalid_expression", message: `not arithmetic: ${expr}` };
        }
        // Arithmetic-only input (guarded above), evaluated for the fixture.
        // eslint-disable-next-line no-new-func
        return { value: Number(new Function(`return (${expr});`)()) };
      }
    ),
    new RecordingTool(
      "lookup_population",
      "Look up the population of a German city.",
      {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"]
      },
      recorder,
      (params) => {
        const city = String(params["city"] ?? "").toLowerCase();
        const population = CITY_POPULATIONS[city];
        return population === undefined
          ? { error: "unknown_city", message: `no data for ${city}` }
          : { city, population }
      }
    ),
    new RecordingTool(
      "list_cities",
      "List the city names this dataset covers.",
      { type: "object", properties: {} },
      recorder,
      () => ({ cities: Object.keys(CITY_POPULATIONS) })
    ),
    new RecordingTool(
      "flaky_fetch",
      "Fetch the dataset revision. Fails transiently on the first call.",
      { type: "object", properties: {} },
      recorder,
      () => {
        flakyCalls++;
        return flakyCalls === 1
          ? { error: "transient", message: "temporarily unavailable, retry" }
          : { revision: "2026-08" };
      }
    )
  ];
}

export interface CodeActEvalExpectations {
  /** Tools that must have been invoked (through the bridge or directly). */
  requiredTools?: string[];
  forbiddenTools?: string[];
  /**
   * Tools the executor adds to the session rather than the case — the package
   * docs tool, the memory tools. The recorder only wraps a case's own toolbelt,
   * so these are observed on the event stream instead.
   */
  requiredSessionTools?: string[];
  /** Bounds on provider turns that carried a code action. */
  maxActions?: number;
  /** Bounds on bridged tool invocations. */
  minToolCalls?: number;
  maxToolCalls?: number;
  /** Predicate over the step's final result. */
  resultCheck?: (result: unknown) => boolean;
  resultCheckLabel?: string;
}

export interface CodeActEvalCase {
  id: string;
  description: string;
  objective: string;
  outputSchema?: Record<string, unknown>;
  expect: CodeActEvalExpectations;
  /**
   * Supply the case's own instrumented toolbelt. Defaults to the toy worker
   * belt ({@link createCodeActTools}); the nodetool-API cases hand back fakes
   * named like real belt tools so the `nodetool.*` object model lights up.
   */
  createTools?: (recorder: CodeActToolRecorder) => Tool[];
  /** Override the suite-level action-round cap for this case. */
  maxIterations?: number;
  /**
   * Sandbox packages this session allows an action to import. An action may
   * import these and nothing else; a case that declares none imports nothing,
   * which is the default every other case runs under.
   */
  sandboxPackages?: readonly string[];
  /**
   * `nodetool.*` namespaces this case exercises — the coverage test asserts
   * the API cases collectively cover every namespace the object model has.
   */
  namespaces?: readonly string[];
}

const SUM_SCHEMA = {
  type: "object",
  properties: { total: { type: "number" } },
  required: ["total"]
};

export const CODEACT_EVAL_CASES: readonly CodeActEvalCase[] = [
  {
    id: "chain-in-one-action",
    description: "Chain dependent tool calls inside a single action",
    objective:
      "Compute (17 * 23) + (441 / 21) using the calculate tool for each " +
      "sub-expression, then finish with {total: <the sum>}.",
    outputSchema: SUM_SCHEMA,
    expect: {
      requiredTools: ["calculate"],
      maxActions: 2,
      minToolCalls: 2,
      resultCheck: (r) =>
        isObjectLike(r) &&
        (r as { total?: unknown }).total === 412,
      resultCheckLabel: "total=412"
    }
  },
  {
    id: "loop-over-dataset",
    description: "Discover items, then loop over a tool per item",
    objective:
      "Use list_cities to get every city in the dataset, look up each " +
      "city's population, and finish with {total: <sum of all populations>}.",
    outputSchema: SUM_SCHEMA,
    expect: {
      requiredTools: ["list_cities", "lookup_population"],
      maxActions: 3,
      minToolCalls: 6,
      resultCheck: (r) =>
        isObjectLike(r) &&
        (r as { total?: unknown }).total === 9_017_763,
      resultCheckLabel: "total=9017763"
    }
  },
  {
    id: "recover-from-failure",
    description: "Catch a transient tool failure and retry",
    objective:
      "Fetch the dataset revision with flaky_fetch (it can fail " +
      "transiently — retry on failure) and finish with " +
      "{revision: <the revision string>}.",
    outputSchema: {
      type: "object",
      properties: { revision: { type: "string" } },
      required: ["revision"]
    },
    expect: {
      requiredTools: ["flaky_fetch"],
      minToolCalls: 2,
      maxActions: 3,
      resultCheck: (r) =>
        isObjectLike(r) &&
        (r as { revision?: unknown }).revision === "2026-08",
      resultCheckLabel: "revision=2026-08"
    }
  },
  {
    id: "reduce-before-returning",
    description: "Reduce data in the sandbox instead of echoing it back",
    objective:
      "Find the German city with the largest population in the dataset " +
      "(list_cities, then lookup_population) and finish with " +
      "{total: <that city's population>}. Do the comparison in code — do " +
      "not reason over raw dumps in your messages.",
    outputSchema: SUM_SCHEMA,
    expect: {
      requiredTools: ["list_cities", "lookup_population"],
      maxActions: 3,
      resultCheck: (r) =>
        isObjectLike(r) &&
        (r as { total?: unknown }).total === 3_755_251,
      resultCheckLabel: "total=3755251 (Berlin)"
    }
  }
];
