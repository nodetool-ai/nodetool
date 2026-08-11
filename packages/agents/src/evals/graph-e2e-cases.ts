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
 *
 * A `nodetool.code.Code` step is the opposite: it is fully deterministic, so a
 * Code case pins every output value (`expectedOutputs`), skips the judge, and
 * needs no model provider for its run. The planner still needs one — it is the
 * model that writes the graph.
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
    id: "code-parse-json",
    description: "Code node parses a JSON input and reads two fields out",
    objective:
      'The input payload is a JSON string. Parse it with one nodetool.code.Code node and surface two values: create an output node named "order_id" carrying the order id, and an output node named "city" carrying the customer city. This is plain data work — no LLM step, and no Python.',
    goal: 'order_id is exactly "A-4417" and city is exactly "Porto".',
    inputs: {
      payload:
        '{"order":{"id":"A-4417","items":3},"customer":{"name":"Rui Alves","city":"Porto"}}'
    },
    skipJudge: true,
    expectGraph: {
      requiredInputNames: ["payload"],
      requiredNodeTypePatterns: ["^nodetool\\.code\\.Code$"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      minOutputNodes: 2,
      requireConnected: true
    },
    expect: {
      requiredOutputNames: ["order_id", "city"],
      expectedOutputs: { order_id: "A-4417", city: "Porto" }
    }
  },
  {
    id: "code-aggregate",
    description: "Code node aggregates a structured input into exact numbers",
    objective:
      'The input line_items is a JSON string holding an array of objects, each with sku, qty and unit_price. With one nodetool.code.Code node, compute the order total (the sum of qty times unit_price over every item, rounded to two decimal places) and the number of distinct line items. Create an output node named "total" for the total and one named "item_count" for the count. This is arithmetic — no LLM step, and no Python.',
    goal: "total is 44.85 and item_count is 3.",
    inputs: {
      line_items:
        '[{"sku":"PN-1","qty":3,"unit_price":4.25},{"sku":"PN-2","qty":1,"unit_price":12.6},{"sku":"PN-3","qty":2,"unit_price":9.75}]'
    },
    skipJudge: true,
    expectGraph: {
      requiredInputNames: ["line_items"],
      requiredNodeTypePatterns: ["^nodetool\\.code\\.Code$"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      minOutputNodes: 2,
      requireConnected: true
    },
    expect: {
      requiredOutputNames: ["total", "item_count"],
      expectedOutputs: { total: 44.85, item_count: 3 }
    }
  },
  {
    id: "code-format",
    description: "Code node formats a list input into one pinned string",
    // The wording pins every character the output must carry, because that is
    // what the case scores. A formatting rule stated loosely ("tidy the
    // names") has no single right answer, and nothing deterministic to check.
    objective:
      'The input names is a list of strings. With one nodetool.code.Code node, put each name in title case (first letter of every word upper case, the rest lower case), sort the formatted names alphabetically, and build one line: the number of names, then " attendees: ", then the names joined by "; ". For three names Ann Lee, Bo Fry and Cy Ray the line reads "3 attendees: Ann Lee; Bo Fry; Cy Ray". Create one output node named "roster" carrying that line. This is string work — no LLM step, and no Python.',
    goal: 'roster is exactly "3 attendees: June Okafor; Omar Haddad; Priya Sharma".',
    inputs: { names: ["priya sharma", "OMAR HADDAD", "june okafor"] },
    skipJudge: true,
    expectGraph: {
      requiredInputNames: ["names"],
      requiredNodeTypePatterns: ["^nodetool\\.code\\.Code$"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requireConnected: true,
      requireOutputNode: true
    },
    expect: {
      requiredOutputNames: ["roster"],
      expectedOutputs: {
        roster: "3 attendees: June Okafor; Omar Haddad; Priya Sharma"
      }
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
    // "Output the name under the name person" reads as a riddle and the
    // planner resolved it by naming the output `name`. Name the three output
    // nodes explicitly instead — the case is about extraction, not about
    // parsing the instruction.
    objective:
      'Extract three fields from the input text with an LLM step: the person\'s full name, their city, and their job title. Create exactly three output nodes, named "person", "city", and "role" — "person" carries the full name, "city" the city, "role" the job title.',
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
    // Python nodes need a worker the eval host may not have, and the planner
    // reached for one on some runs — so the constraint is stated, the way a
    // user who knows their environment would state it.
    objective:
      'Compute the total of the input amount plus a tip of the input tip_percent percent of that amount, rounded to two decimal places, and output it from an output node named "total". Use a deterministic computation step, not an LLM. No Python interpreter is available — the computation must run in JavaScript.',
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
  },
  {
    id: "agent-constraint-reasoning",
    description: "One Agent step reasons over constraints to a single answer",
    objective:
      'Take the input constraints text and work out, with one nodetool.agents.Agent step, the one weekday the team can meet. Create an output node named "answer" carrying just the weekday, and an output node named "reasoning" carrying the short explanation that rules the other days out.',
    goal:
      'The answer output names Wednesday and nothing else. The reasoning output explains why each other weekday is ruled out: Dana is away Monday and Tuesday, the room is taken on Thursday, and Elias never meets on a Friday.',
    inputs: {
      constraints:
        "The team meets exactly once next week, on a weekday from Monday to Friday. Dana must attend and is away on Monday and Tuesday. The meeting room is already booked all day Thursday. Elias must attend and never meets on a Friday."
    },
    needsModelProviders: true,
    expectGraph: {
      requiredInputNames: ["constraints"],
      requiredNodeTypePatterns: ["^nodetool\\.agents\\.Agent$"],
      minAgentSteps: 1,
      minOutputNodes: 2,
      requireConnected: true
    },
    expect: {
      requiredOutputNames: ["answer", "reasoning"],
      requireNonEmptyOutputs: true,
      requiredOutputPatterns: ["Wednesday"]
    }
  },
  {
    id: "code-then-agent",
    description: "Deterministic Code prep feeds an Agent step; prep is pinned",
    objective:
      'The input reviews is a JSON string holding an array of objects, each with author, rating and text. Do two steps. First, with one nodetool.code.Code node, keep only the reviews whose rating is 2 or lower, in the order they appear, and build one block of text: one line per kept review, each line the position among the kept reviews starting at 1, then ". ", then the author, then ": ", then the review text, with the lines joined by a single newline. For two kept reviews by Ann and Bo the block reads "1. Ann: Too loud.\\n2. Bo: It leaks." Second, pass that block to one nodetool.agents.Agent step that writes a single paragraph summarizing what the unhappy customers complain about. Create an output node named "complaints" carrying the block from the Code node, and an output node named "summary" carrying the paragraph.',
    goal:
      'The complaints output is the two low-rated reviews, numbered 1 and 2, and the summary output is one paragraph of prose that names both problems — the cracked lid and the unit that stopped charging. The summary must be prose, not a copy of the numbered block.',
    inputs: {
      reviews:
        '[{"author":"Rui","rating":5,"text":"Fast and tidy."},{"author":"Mina","rating":2,"text":"The lid arrived cracked."},{"author":"Tomas","rating":4,"text":"Good value."},{"author":"Aya","rating":1,"text":"It stopped charging after a week."}]'
    },
    needsModelProviders: true,
    expectGraph: {
      requiredInputNames: ["reviews"],
      requiredNodeTypePatterns: [
        "^nodetool\\.code\\.Code$",
        "^nodetool\\.agents\\.Agent$"
      ],
      minAgentSteps: 1,
      minOutputNodes: 2,
      requireConnected: true
    },
    expect: {
      requiredOutputNames: ["complaints", "summary"],
      requireNonEmptyOutputs: true,
      // The Code half is deterministic, so it is pinned; the paragraph the
      // Agent writes is the judge's half.
      expectedOutputs: {
        complaints:
          "1. Mina: The lid arrived cracked.\n2. Aya: It stopped charging after a week."
      }
    }
  }
];
