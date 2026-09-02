/**
 * Built-in evaluation cases for TaskPlanner multi-task (plan mode) planning.
 *
 * Each case is an objective plus machine-checkable expectations on the
 * committed plan. `PlanBuilder` already guarantees the plan is structurally
 * sound, so the expectations here target judgment calls it cannot make:
 * how wide the plan opens, whether a genuine dependency is modelled as one,
 * whether decomposition stays proportional to the work, and which tool a step
 * routes to.
 */

export interface TaskPlannerEvalExpectations {
  minTasks?: number;
  maxTasks?: number;
  minSteps?: number;
  maxSteps?: number;
  /** Cap on the widest task — the prompt's step-granularity rule. */
  maxStepsPerTask?: number;
  /** Tasks with an empty `dependsOn`; the plan's parallel width. */
  minIndependentTasks?: number;
  /** Tasks with a non-empty `dependsOn`; proves the DAG is not flat. */
  minDependentTasks?: number;
  /** No task may depend on another — the work is genuinely independent. */
  requireFlat?: boolean;
  /** Tool names some step must route to (via `tools` or its instructions). */
  requiredTools?: string[];
  /** Tool names no step may route to. */
  forbiddenTools?: string[];
  /** Regex sources; each must match the concatenated step instructions. */
  requiredInstructionPatterns?: string[];
  /** Opt out of the universal "no synthesis task" check. */
  allowSynthesisTask?: boolean;
  /**
   * No step may instruct work the toolbelt cannot do. Checked against the
   * instruction text rather than the `tools` array, because a planner with no
   * tools writes "search the web for …" in prose instead of routing.
   */
  forbidToolWork?: boolean;
}

export interface TaskPlannerEvalCase {
  id: string;
  description: string;
  objective: string;
  inputs?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Case needs configured model providers — skipped when there are none. */
  needsModelProviders?: boolean;
  /**
   * The toolbelt this case plans against. `"all"` offers the declarative
   * library; `"none"` offers nothing, which is the shape an `AgentNode` with
   * no tools selected actually runs — the majority of real runs, and the one
   * the suite could not see before.
   */
  toolbelt?: "all" | "none";
  expect: TaskPlannerEvalExpectations;
}

import { PLANNER_TOOL_NAMES } from "./planner-tools.js";

export const TASK_PLANNER_EVAL_CASES: readonly TaskPlannerEvalCase[] = [
  {
    id: "parallel-research",
    description: "Three unrelated topics must become three concurrent tasks",
    objective:
      "Research three separate topics — retrieval-augmented generation, vector databases, and prompt caching. For each one, find recent sources and write down the key findings. The three topics are unrelated to each other.",
    outputSchema: {
      type: "object",
      properties: { findings: { type: "string" } },
      required: ["findings"]
    },
    expect: {
      minTasks: 3,
      minIndependentTasks: 3,
      requireFlat: true,
      requiredTools: ["web_search"],
      maxStepsPerTask: 3
    }
  },
  {
    id: "real-dependency",
    description:
      "A genuine data dependency must be modelled as one, not flattened",
    objective:
      "Download the page at the input url, then extract every section heading from the downloaded text, and separately count how many words the page contains. The extraction and the word count both need the downloaded page.",
    inputs: { url: "https://example.com/article" },
    expect: {
      minTasks: 3,
      minDependentTasks: 2,
      requiredTools: ["fetch_page"],
      requiredInstructionPatterns: ["heading"]
    }
  },
  {
    id: "no-over-decomposition",
    description: "A one-shot objective must not be split into a task graph",
    objective:
      "Write a single four-line poem about autumn rain. No research, no files, no images — just the poem.",
    expect: {
      maxTasks: 2,
      maxSteps: 2,
      forbiddenTools: ["web_search", "fetch_page", "generate_image"]
    }
  },
  {
    id: "deterministic-routing",
    description:
      "Arithmetic must be routed to run_python, not to a reasoning step",
    objective:
      "Compute the first 40 Fibonacci numbers and their sum exactly. This is deterministic computation — it must be executed as code, not reasoned out. Write the result to results.txt.",
    expect: {
      maxTasks: 3,
      requiredTools: ["run_python", "write_file"],
      forbiddenTools: ["web_search", "generate_image"]
    }
  },
  {
    id: "media-fanout",
    description: "One image per scene, planned as concurrent generation tasks",
    objective:
      "Generate one illustration for each of these three scenes: a lighthouse at dawn, a market at noon, a harbour at night. Each illustration is independent of the others.",
    needsModelProviders: true,
    expect: {
      minTasks: 3,
      minIndependentTasks: 3,
      requiredTools: ["generate_image"],
      requiredInstructionPatterns: ["lighthouse", "harbour"]
    }
  },
  {
    id: "no-tools-research",
    description:
      "With an empty toolbelt the plan must not instruct steps to search or fetch",
    objective:
      "Plan a research project on node-based AI workflow tools: what exists, how they differ architecturally, and where they fall short.",
    toolbelt: "none",
    expect: {
      minTasks: 3,
      minIndependentTasks: 3,
      forbidToolWork: true,
      forbiddenTools: [...PLANNER_TOOL_NAMES]
    }
  },
  {
    id: "gather-not-assemble",
    description:
      "Under an output schema the plan must gather facts and leave assembly to the calling loop",
    objective:
      "Produce a competitive brief on three note-taking apps: Obsidian, Notion, and Logseq. Gather pricing, platform support, and the standout feature for each.",
    outputSchema: {
      type: "object",
      properties: {
        apps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              pricing: { type: "string" },
              platforms: { type: "string" },
              standoutFeature: { type: "string" }
            },
            required: ["name", "pricing", "platforms", "standoutFeature"]
          }
        }
      },
      required: ["apps"]
    },
    expect: {
      minTasks: 3,
      minIndependentTasks: 3,
      requiredTools: ["web_search"],
      requiredInstructionPatterns: ["pricing"]
    }
  }
];
