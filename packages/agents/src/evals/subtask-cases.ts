/**
 * Cases + instrumented tool library for the sub-agent execution eval.
 *
 * Where the tool-loop suites score a model driving a single flat tool surface,
 * this suite scores {@link RunSubtaskTool} — the primitive that lets an agent
 * decompose work by spawning a fresh child agent that inherits the parent's
 * toolset. Each case hands the parent an objective it is expected to delegate,
 * and the scoring checks that the *child* agent actually ran the inherited
 * tools (not the parent), plus depth, subtask count, and error propagation.
 *
 * The tools are {@link InstrumentedTool}s: real {@link Tool} subclasses that
 * record every invocation together with the sub-agent depth
 * ({@link SUBTASK_DEPTH_KEY}) at which it ran — 0 for a parent-level call, >= 1
 * for a call made inside a subtask. That single field is what lets the scorer
 * distinguish "the parent did it itself" from "the parent delegated and the
 * child did it".
 */

import type { ProcessingContext, JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import { SUBTASK_DEPTH_KEY } from "../tools/subtask-fields.js";

/** One recorded tool invocation, tagged with the depth it ran at. */
export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
  /** `SUBTASK_DEPTH_KEY` at call time: 0 = parent, >= 1 = inside a subtask. */
  depth: number;
  result: unknown;
  isError: boolean;
}

/** Shared, per-run recorder handed to every instrumented tool. */
export interface ToolRecorder {
  invocations: ToolInvocation[];
  /** Key/value scratch store the write/read tools mutate. */
  store: Map<string, string>;
}

export function createToolRecorder(): ToolRecorder {
  return { invocations: [], store: new Map() };
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: { store: Map<string, string>; depth: number }
) => unknown;

/**
 * A real {@link Tool} that records each call (with its subtask depth) into a
 * shared {@link ToolRecorder}. The same instance is shared between the parent
 * toolset and the inherited child toolset, so the depth read from `context`
 * tells us which agent made the call.
 */
class InstrumentedTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly jsonSchema: JsonSchema;
  private readonly recorder: ToolRecorder;
  private readonly handler: ToolHandler;

  constructor(
    name: string,
    description: string,
    schema: JsonSchema,
    recorder: ToolRecorder,
    handler: ToolHandler
  ) {
    super();
    this.name = name;
    this.description = description;
    this.jsonSchema = schema;
    this.recorder = recorder;
    this.handler = handler;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const depth = context.get<number>(SUBTASK_DEPTH_KEY) ?? 0;
    let result: unknown;
    let isError = false;
    try {
      result = this.handler(params, { store: this.recorder.store, depth });
    } catch (e) {
      isError = true;
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    if (
      result !== null &&
      typeof result === "object" &&
      "error" in (result as Record<string, unknown>)
    ) {
      isError = true;
    }
    this.recorder.invocations.push({
      name: this.name,
      args: params,
      depth,
      result,
      isError
    });
    return result;
  }
}

/**
 * The six instrumented tools every case shares. One per interaction shape a
 * sub-agent has to handle: compute, side-effecting write, dependent read,
 * canned retrieval, pure transform, and a tool that always errors (for the
 * error-propagation case).
 */
export function createInstrumentedTools(recorder: ToolRecorder): Tool[] {
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`not a number: ${String(v)}`);
    return n;
  };
  const str = (v: unknown): string => (typeof v === "string" ? v : String(v));

  const FACTS: Record<string, string> = {
    "capital of france": "Paris",
    "speed of light": "299792458 m/s",
    "largest planet": "Jupiter"
  };

  return [
    new InstrumentedTool(
      "calculate",
      "Evaluate a single arithmetic operation on two numbers.",
      {
        type: "object",
        properties: {
          a: { type: "number", description: "Left operand." },
          op: {
            type: "string",
            enum: ["add", "subtract", "multiply", "divide"],
            description: "Operation to apply."
          },
          b: { type: "number", description: "Right operand." }
        },
        required: ["a", "op", "b"],
        additionalProperties: false
      },
      recorder,
      (args) => {
        const a = num(args.a);
        const b = num(args.b);
        switch (str(args.op)) {
          case "add":
            return { result: a + b };
          case "subtract":
            return { result: a - b };
          case "multiply":
            return { result: a * b };
          case "divide":
            if (b === 0) return { error: "division by zero" };
            return { result: a / b };
          default:
            return { error: `unknown op: ${str(args.op)}` };
        }
      }
    ),
    new InstrumentedTool(
      "kv_write",
      "Store a string value under a key in the shared scratch store.",
      {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to write." },
          value: { type: "string", description: "Value to store." }
        },
        required: ["key", "value"],
        additionalProperties: false
      },
      recorder,
      (args, { store }) => {
        store.set(str(args.key), str(args.value));
        return { ok: true, key: str(args.key) };
      }
    ),
    new InstrumentedTool(
      "kv_read",
      "Read the value previously stored under a key.",
      {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to read." }
        },
        required: ["key"],
        additionalProperties: false
      },
      recorder,
      (args, { store }) => {
        const key = str(args.key);
        if (!store.has(key)) return { error: `no value for key: ${key}` };
        return { key, value: store.get(key) };
      }
    ),
    new InstrumentedTool(
      "lookup_fact",
      "Look up a canned fact by query. Known queries: capital of france, speed of light, largest planet.",
      {
        type: "object",
        properties: {
          query: { type: "string", description: "The fact to look up." }
        },
        required: ["query"],
        additionalProperties: false
      },
      recorder,
      (args) => {
        const q = str(args.query).toLowerCase().trim();
        if (q in FACTS) return { query: q, fact: FACTS[q] };
        return { error: `unknown fact: ${q}` };
      }
    ),
    new InstrumentedTool(
      "slugify",
      "Transform text into a lowercase, dash-separated slug.",
      {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to slugify." }
        },
        required: ["text"],
        additionalProperties: false
      },
      recorder,
      (args) => {
        const slug = str(args.text)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        return { slug };
      }
    ),
    new InstrumentedTool(
      "flaky_fail",
      "A tool that always fails. Call it when asked to test error handling.",
      {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why you are calling it." }
        },
        required: [],
        additionalProperties: false
      },
      recorder,
      () => ({ error: "flaky_fail always fails by design" })
    )
  ];
}

/** The tool names the instrumented library exposes. */
export const INSTRUMENTED_TOOL_NAMES = [
  "calculate",
  "kv_write",
  "kv_read",
  "lookup_fact",
  "slugify",
  "flaky_fail"
] as const;

/** Structural expectations for a sub-agent execution case. */
export interface SubtaskEvalExpectations {
  /** Tool names that must be called at least once at the parent level (depth 0). */
  requiredParentTools?: string[];
  /**
   * Tool names that must be called at least once *inside a subtask* (depth >=
   * 1) — the crux of the eval: proof the delegated child, not the parent, did
   * the work.
   */
  requiredChildTools?: string[];
  /** Tool names that must never be called at any depth. */
  forbiddenTools?: string[];
  /** Minimum number of subtasks the parent must spawn (run_subtask calls). */
  minSubtasks?: number;
  /** Maximum number of subtasks (efficiency ceiling). */
  maxSubtasks?: number;
  /** Minimum sub-agent depth that must be reached (>= 1 means it delegated). */
  minDepth?: number;
  /** When true, no spawned subtask may have failed. */
  noSubtaskErrors?: boolean;
  /** Keys the shared store must contain when the run ends. */
  requiredStoreKeys?: string[];
  /**
   * Substrings the parent's final answer must contain (case-insensitive) —
   * proof the delegated result flowed back into the parent's response.
   */
  answerContains?: string[];
}

export interface SubtaskEvalCase {
  id: string;
  description: string;
  /** The parent agent's objective (its step instructions). */
  objective: string;
  /** Optional system-prompt preamble for the parent step. */
  systemPrompt?: string;
  /** Case needs a real model provider to be solvable (all of them do). */
  needsModelProviders?: boolean;
  expect: SubtaskEvalExpectations;
}

const DELEGATION_PREAMBLE = [
  "You are an orchestrator. You do NOT do work yourself — you delegate every",
  "concrete task to a focused sub-agent by calling the `run_subtask` tool with",
  "a self-contained `prompt`. The sub-agent inherits your tools and will run",
  "them. When a subtask returns, use its result to answer. Do not call the",
  "worker tools (calculate, kv_write, kv_read, lookup_fact, slugify) directly —",
  "always go through `run_subtask`."
].join(" ");

/**
 * The sub-agent execution suite. Every case forces delegation and then checks
 * that the child agent exercised the inherited tools.
 */
export const SUBTASK_EVAL_CASES: readonly SubtaskEvalCase[] = [
  {
    id: "delegate-compute",
    description: "Delegate an arithmetic task; child must use `calculate`",
    objective:
      "Compute 47 multiplied by 89 and report the exact numeric result.",
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: ["calculate"],
      minSubtasks: 1,
      minDepth: 1,
      noSubtaskErrors: true,
      answerContains: ["4183"]
    }
  },
  {
    id: "delegate-read-write",
    description: "Delegate a write-then-read task; child must use kv_write + kv_read",
    objective:
      "Store the value \"emerald\" under the key \"gem\", then read it back and report the value you read.",
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: ["kv_write", "kv_read"],
      minSubtasks: 1,
      minDepth: 1,
      noSubtaskErrors: true,
      requiredStoreKeys: ["gem"],
      answerContains: ["emerald"]
    }
  },
  {
    id: "delegate-lookup",
    description: "Delegate a retrieval task; child must use `lookup_fact`",
    objective:
      "Find out the capital of France using the fact lookup tool and report it.",
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: ["lookup_fact"],
      minSubtasks: 1,
      minDepth: 1,
      noSubtaskErrors: true,
      answerContains: ["paris"]
    }
  },
  {
    id: "delegate-transform",
    description: "Delegate a text transform; child must use `slugify`",
    objective:
      "Turn the title \"Hello World Example\" into a URL slug and report the slug.",
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: ["slugify"],
      minSubtasks: 1,
      minDepth: 1,
      noSubtaskErrors: true,
      answerContains: ["hello-world-example"]
    }
  },
  {
    id: "parallel-subtasks",
    description: "Two independent tasks; parent should spawn multiple subtasks",
    objective: [
      "Do two independent things and report both answers:",
      "(1) compute 12 plus 30, and",
      "(2) look up the largest planet.",
      "Delegate each as its own separate subtask."
    ].join(" "),
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: ["calculate", "lookup_fact"],
      minSubtasks: 2,
      minDepth: 1,
      noSubtaskErrors: true,
      answerContains: ["42", "jupiter"]
    }
  },
  {
    id: "error-propagation",
    description: "Child hits a failing tool; the error must surface, not be hidden",
    objective:
      "Call the flaky_fail tool once inside a subtask to test error handling, then report in your answer whether the tool succeeded or failed.",
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: ["flaky_fail"],
      minSubtasks: 1,
      minDepth: 1,
      answerContains: ["fail"]
    }
  },
  {
    id: "all-tools",
    description: "One objective that exercises every inherited tool via subtasks",
    objective: [
      "Complete all of the following, delegating the work to subtasks:",
      "1. compute 8 multiplied by 8,",
      "2. store the result under the key \"square\" and read it back,",
      "3. look up the speed of light,",
      "4. slugify the phrase \"Final Report\".",
      "Report every result."
    ].join(" "),
    systemPrompt: DELEGATION_PREAMBLE,
    expect: {
      requiredParentTools: ["run_subtask"],
      requiredChildTools: [
        "calculate",
        "kv_write",
        "kv_read",
        "lookup_fact",
        "slugify"
      ],
      minSubtasks: 1,
      minDepth: 1,
      noSubtaskErrors: true,
      requiredStoreKeys: ["square"],
      answerContains: ["64", "final-report"]
    }
  }
];
