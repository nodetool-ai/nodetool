/**
 * Built-in evaluation cases for the GraphPlanner one-shot DSL flow.
 *
 * Each case is an objective plus machine-checkable expectations on the
 * accepted graph. Expectations are deliberately structural (node-type
 * patterns, input wiring, handle usage) rather than exact-graph matches —
 * many graphs are valid answers, but all of them must wire the inputs, use
 * the right node families, and avoid provider-locked nodes.
 */

import type { GraphPlannerEvalCase } from "./graph-planner-eval.js";

export const GRAPH_PLANNER_EVAL_CASES: readonly GraphPlannerEvalCase[] = [
  {
    id: "summarize",
    description: "Single LLM step with one wired input and one output",
    objective:
      "Take the input text and produce a one-paragraph summary of it with an LLM step. Output the summary.",
    inputs: { text: "NodeTool is a visual AI workflow platform..." },
    expect: {
      requiredInputNames: ["text"],
      minAgentSteps: 1,
      requireOutputNode: true,
      minNodes: 3,
      maxNodes: 6
    }
  },
  {
    id: "chain-multi-output",
    description: "Two chained LLM steps, both results surfaced as outputs",
    objective:
      "Take the input text, summarize it in one paragraph with an LLM step, then translate that summary to German with a second LLM step. Output both the summary and the translation.",
    inputs: { text: "NodeTool is a visual AI workflow platform..." },
    expect: {
      requiredInputNames: ["text"],
      minAgentSteps: 2,
      minOutputNodes: 2,
      minNodes: 5,
      maxNodes: 9
    }
  },
  {
    id: "parallel-fanout",
    description: "Independent parallel branches, one LLM step per language",
    objective:
      "Write a haiku about the input topic in English, German, and French — one LLM step per language, running in parallel. Output all three haikus.",
    inputs: { topic: "autumn rain" },
    expect: {
      requiredInputNames: ["topic"],
      minAgentSteps: 3,
      minOutputNodes: 3,
      maxNodes: 12
    }
  },
  {
    id: "loop-authoring",
    description: "Repetition the DSL should express as a JS loop, not copy-paste",
    objective:
      "Generate one short limerick for each of these five animals: cat, dog, fox, owl, bear — one LLM step per animal. Output every limerick.",
    expect: {
      minAgentSteps: 5,
      minOutputNodes: 5,
      maxNodes: 16
    }
  },
  {
    id: "branch-both-paths",
    description: "Conditional with both If branches wired",
    objective:
      "If the input language is exactly the string \"de\", translate the input text to German with an LLM step; otherwise translate it to French with an LLM step. Output the translation from each branch.",
    inputs: { language: "de", text: "Good morning!" },
    expect: {
      requiredInputNames: ["language", "text"],
      requiredNodeTypePatterns: ["^nodetool\\.control\\.If$"],
      requiredSourceHandles: ["if_true", "if_false"],
      minAgentSteps: 2
    }
  },
  {
    id: "deterministic-over-llm",
    description: "Pure string mechanics must not be solved with an LLM step",
    objective:
      "Concatenate the two input strings first and second, in that order, and output the result. This is pure string mechanics — no reasoning or generation involved.",
    inputs: { first: "Hello, ", second: "world" },
    expect: {
      requiredInputNames: ["first", "second"],
      requiredNodeTypePatterns: ["^nodetool\\.text\\."],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\.AgentStep$"],
      requireOutputNode: true
    }
  },
  {
    id: "inputs-wiring",
    description: "Every runtime parameter must reach the graph via an input node",
    objective:
      "Plan a day-by-day travel itinerary with an LLM step, using the input city and the input number of days. Output the itinerary.",
    inputs: { city: "Lisbon", days: 3 },
    expect: {
      requiredInputNames: ["city", "days"],
      minAgentSteps: 1,
      requireOutputNode: true
    }
  },
  {
    id: "image-generation",
    description:
      "Generic AI image node with a real model picked via find_model, then a deterministic post-process",
    objective:
      "Generate an image from the input prompt, then posterize it down to 3 colors, and output the posterized image.",
    inputs: { prompt: "a red fox in snow" },
    needsModelProviders: true,
    expect: {
      requiredInputNames: ["prompt"],
      requiredNodeTypePatterns: [
        "^nodetool\\.image\\.TextToImage$",
        "^lib\\.image\\."
      ],
      requireOutputNode: true
    }
  }
];
