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
      requireConnected: true,
      requiredInputNames: ["text"],
      minAgentSteps: 1,
      requireOutputNode: true,
      minNodes: 3,
      maxNodes: 6
    }
  },
  {
    id: "pdf-bullet-summary",
    description: "A PDF document input reaching an LLM step that answers in bullets",
    objective:
      "The input document is a PDF report. Summarize it as a list of bullet " +
      "points covering its key findings, and output the bullet points. The " +
      "workflow must read the PDF itself — the text is not supplied as a " +
      "parameter.",
    inputs: {
      document: { type: "document", uri: "asset://quarterly-report.pdf" }
    },
    expect: {
      requiredInputNames: ["document"],
      // The document must arrive as a document, not as a string the caller
      // was expected to have extracted. Either document input node passes.
      requiredNodeTypePatterns: ["^nodetool\\.input\\.Document"],
      // Any LLM step family — Agent, Summarizer — is a valid
      // answer; which one is the model's call, so none is pinned.
      requiredReachablePaths: [
        { from: "^nodetool\\.input\\.Document", to: "^nodetool\\.agents\\." }
      ],
      requiredPropertyTextPatterns: ["bullet"],
      requireConnected: true,
      requireOutputNode: true,
      minEdges: 2,
      maxNodes: 8
    }
  },
  {
    id: "chain-multi-output",
    description: "Two chained LLM steps, both results surfaced as outputs",
    objective:
      "Take the input text, summarize it in one paragraph with an LLM step, then translate that summary to German with a second LLM step. Output both the summary and the translation.",
    inputs: { text: "NodeTool is a visual AI workflow platform..." },
    expect: {
      requireConnected: true,
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
      requireConnected: true,
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
      requireConnected: true,
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
      minAgentSteps: 2,
      requireConnected: true
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
      // Either deterministic route passes. `nodetool.text.Concat` still ships,
      // and a `nodetool.code.Code` body is what the planner prompt now steers
      // string mechanics toward. The case is about not reaching for an LLM,
      // so pinning one of the two would fail the answer the prompt asks for.
      requiredNodeTypePatterns: ["^nodetool\\.(text|code)\\."],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
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
      requireConnected: true,
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
      requireConnected: true,
      requireOutputNode: true
    }
  },
  {
    id: "code-single-transform",
    description: "Parse-and-format work belongs in one Code node, not a chain",
    objective:
      'The input order_json is a JSON string of the form {"customer":"Ada","total":42.5,"currency":"EUR"}. Parse it and produce the single line "Ada owes 42.50 EUR" — the customer name, the word "owes", the total with exactly two decimals, and the currency. Do this in one Code node and name its output handle "line". Output that line.',
    inputs: {
      order_json: '{"customer":"Ada","total":42.5,"currency":"EUR"}'
    },
    expect: {
      requiredInputNames: ["order_json"],
      minCodeNodes: 1,
      maxCodeNodes: 1,
      requiredCodeOutputHandles: ["line"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      requireOutputNode: true,
      maxNodes: 4
    }
  },
  {
    id: "code-aggregation",
    description: "Arithmetic over structured input, both results on named handles",
    objective:
      'The input rows is a JSON string holding an array of objects, each with a numeric amount field. Compute the sum of amount and the average of amount in one Code node. Name the output handles "total" and "average". Output both numbers. This is arithmetic — no reasoning is involved.',
    inputs: { rows: '[{"amount":10},{"amount":20},{"amount":30}]' },
    expect: {
      requiredInputNames: ["rows"],
      minCodeNodes: 1,
      maxCodeNodes: 1,
      requiredCodeOutputHandles: ["total", "average"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      minOutputNodes: 2,
      maxNodes: 5
    }
  },
  {
    id: "code-no-packages",
    description: "String work needs no library — no pack specifier may be declared",
    objective:
      'Turn the input title into a URL slug with one Code node: lowercase it, replace every run of characters that are not letters or digits with a single hyphen, and strip leading and trailing hyphens. Name the output handle "slug" and output it. Plain JavaScript does all of this.',
    inputs: { title: "Hello, World! A First Post" },
    expect: {
      requiredInputNames: ["title"],
      minCodeNodes: 1,
      maxCodeNodes: 1,
      requiredCodeOutputHandles: ["slug"],
      forbidCodePackages: true,
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      requireOutputNode: true,
      maxNodes: 4
    }
  },
  {
    id: "code-csv-package",
    description: "A CSV body may declare the shipped CSV pack and nothing else",
    objective:
      'The input csv is a CSV document with a header row and a numeric amount column. Sum the amount column in one Code node, name the output handle "total", and output the total.',
    inputs: { csv: "name,amount\nAda,10\nGrace,20\n" },
    expect: {
      requiredInputNames: ["csv"],
      minCodeNodes: 1,
      maxCodeNodes: 1,
      requiredCodeOutputHandles: ["total"],
      // The body may parse the CSV by hand or with the shipped pack. Any other
      // specifier is a pack this machine does not install, which fails
      // validation at run time.
      allowedCodePackages: ["@nodetool-ai/sandbox-csv"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      requireOutputNode: true,
      maxNodes: 4
    }
  },
  {
    id: "agent-over-code",
    description: "Judgement about tone is an LLM step, never a Code body",
    objective:
      "Read the input complaint — a customer's message about a problem with an order — and write a short, empathetic reply that names the specific problem the customer describes and says what will be done about it. Output the reply. This needs judgement about tone and wording.",
    inputs: {
      complaint: "My order arrived two weeks late and the box was crushed."
    },
    expect: {
      requiredInputNames: ["complaint"],
      minAgentSteps: 1,
      forbiddenNodeTypePatterns: ["^nodetool\\.code\\."],
      requireConnected: true,
      requireOutputNode: true,
      maxNodes: 5
    }
  },
  {
    id: "code-feeds-agent",
    description: "Deterministic prep in a Code node, wired into an LLM step",
    objective:
      'The input log_json is a JSON string holding an array of log entries, each with a level and a message field. First, in one Code node, keep only the entries whose level is "error" and join their message values into one newline-separated string on an output handle named "errors". Then have an LLM step read that string and write a short paragraph explaining what went wrong. Output the paragraph.',
    inputs: {
      log_json:
        '[{"level":"info","message":"started"},{"level":"error","message":"disk full"}]'
    },
    expect: {
      requiredInputNames: ["log_json"],
      minCodeNodes: 1,
      maxCodeNodes: 1,
      requiredCodeOutputHandles: ["errors"],
      requireCodeOutputs: true,
      codeFeedsNodeTypePatterns: ["^nodetool\\.agents\\.Agent$"],
      minAgentSteps: 1,
      requireConnected: true,
      requireOutputNode: true,
      minEdges: 3
    }
  }
];
