/**
 * Built-in cases for the end-to-end graph suite: plan a workflow, run it, judge
 * the outputs.
 *
 * A case is an objective (what the planner builds), inputs (what the run starts
 * with), and a goal (what the judge grades the outputs against). Expectations
 * on the run are deliberately thin — an output exists, it is non-empty, it does
 * or does not contain a literal — because the substantive question ("is this
 * actually a German translation of the input?") is the judge's, not a regex's.
 *
 * Every case that plans an LLM step needs configured model providers: the
 * planner picks a real model via `find_model`, and the run then calls it.
 */

import type { GraphE2eEvalCase } from "./graph-e2e-eval.js";

export const GRAPH_E2E_EVAL_CASES: readonly GraphE2eEvalCase[] = [
  {
    id: "concat",
    description: "Deterministic string mechanics — exact output, no judge",
    objective:
      "Concatenate the two input strings first and second, in that order, and output the result. This is pure string mechanics — no reasoning or generation involved.",
    goal: 'The output is exactly "Hello, world".',
    inputs: { first: "Hello, ", second: "world" },
    skipJudge: true,
    expectGraph: {
      requiredInputNames: ["first", "second"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      requireOutputNode: true
    },
    expect: {
      minOutputs: 1,
      requireNonEmptyOutputs: true,
      requiredOutputPatterns: ["^Hello, world$"]
    }
  },
  {
    id: "summarize",
    description: "One LLM step summarizes the input text",
    objective:
      "Take the input text and produce a one-paragraph summary of it with an LLM step. Output the summary under the name summary.",
    goal:
      "The summary output is a short prose summary, in English, of the input text — it must mention that NodeTool is a visual workflow platform for AI, and must not be a verbatim copy of the input.",
    inputs: {
      text: "NodeTool is a visual AI workflow platform. Users drag nodes onto a canvas, wire them together, and run the resulting graph. Nodes wrap LLMs, image models, file I/O, and plain code, so a workflow can mix generation with deterministic steps. Workflows run locally on a desktop app or on a server, and the same graph can be published as a mini app."
    },
    needsModelProviders: true,
    expectGraph: {
      requiredInputNames: ["text"],
      minAgentSteps: 1,
      requireConnected: true,
      requireOutputNode: true
    },
    expect: {
      requiredOutputNames: ["summary"],
      requireNonEmptyOutputs: true
    }
  },
  {
    id: "translate-chain",
    description: "Two chained LLM steps; both intermediate and final surfaced",
    objective:
      "Take the input text, summarize it in one sentence with an LLM step, then translate that summary to German with a second LLM step. Output the summary under the name summary and the translation under the name translation.",
    goal:
      "The translation output is German prose that says the same thing as the summary output, and the summary output is a one-sentence English summary of the input text. Both must be present and non-empty.",
    inputs: {
      text: "The harbour festival runs for three days. Boats are open to visitors on Saturday, there is live music each evening, and the fireworks close the festival on Sunday night."
    },
    needsModelProviders: true,
    expectGraph: {
      requiredInputNames: ["text"],
      minAgentSteps: 2,
      minOutputNodes: 2,
      requireConnected: true
    },
    expect: {
      requiredOutputNames: ["summary", "translation"],
      requireNonEmptyOutputs: true
    }
  },
  {
    id: "extract-fields",
    description: "Structured extraction from unstructured input text",
    objective:
      "Extract the person's full name, their city, and their job title from the input text with an LLM step. Output the name under the name person, the city under the name city, and the job title under the name role.",
    goal:
      'The three outputs carry the values from the input text: person is "Amara Osei", city is "Lisbon", role is her job title (marine biologist). Each output holds only that value, not the whole sentence.',
    inputs: {
      text: "Amara Osei, a marine biologist who moved to Lisbon last spring, will present her findings at the conference."
    },
    needsModelProviders: true,
    expectGraph: {
      requiredInputNames: ["text"],
      minAgentSteps: 1,
      minOutputNodes: 3,
      requireConnected: true
    },
    expect: {
      requiredOutputNames: ["person", "city", "role"],
      requireNonEmptyOutputs: true,
      requiredOutputPatterns: ["Amara Osei", "Lisbon"]
    }
  },
  {
    id: "branch-language",
    description: "Conditional routing — only the taken branch produces output",
    objective:
      'If the input language is exactly the string "de", translate the input text to German with an LLM step; otherwise translate it to French with an LLM step. Output the translation from each branch.',
    goal:
      'The run was given language "de", so the produced output must be a German translation of "Good morning, the meeting starts at nine." Any French output means the wrong branch ran.',
    inputs: { language: "de", text: "Good morning, the meeting starts at nine." },
    needsModelProviders: true,
    expectGraph: {
      requiredInputNames: ["language", "text"],
      requiredNodeTypePatterns: ["^nodetool\\.control\\.If$"],
      requiredSourceHandles: ["if_true", "if_false"],
      minAgentSteps: 2,
      requireConnected: true
    },
    expect: {
      minOutputs: 1,
      requireNonEmptyOutputs: true
    }
  },
  {
    id: "arithmetic",
    description: "Deterministic compute the graph must get exactly right",
    objective:
      "Compute the total of the input amount plus a tip of the input tip_percent percent of that amount, rounded to two decimal places, and output the total as a number under the name total. Use a deterministic computation step, not an LLM.",
    goal: "The total output is 101.4 (84.50 plus a 20% tip of 16.90).",
    inputs: { amount: 84.5, tip_percent: 20 },
    expectGraph: {
      requiredInputNames: ["amount", "tip_percent"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      requireOutputNode: true
    },
    expect: {
      requiredOutputNames: ["total"],
      requireNonEmptyOutputs: true,
      requiredOutputPatterns: ["101\\.4"]
    }
  }
];
