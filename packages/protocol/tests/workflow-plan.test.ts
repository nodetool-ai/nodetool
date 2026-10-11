import { describe, expect, it } from "vitest";

import { workflowSetupPlan } from "../src/api-schemas/workflows.js";
import {
  PLAN_CODE_NODE_TYPE,
  checkWorkflowPlan,
  parseWorkflowPlan,
  refineWorkflowPlan,
  type PlannerMessage,
  planInputSample,
  planToPlacement,
  resolveWorkflowPlan,
  type PlanNodeLookup,
  type PlanNodeShape
} from "../src/workflow-plan.js";

const SHAPES: Record<string, PlanNodeShape> = {
  "nodetool.input.StringInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "str" }]
  },
  "nodetool.input.FloatInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "float" }]
  },
  "nodetool.input.ImageInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "image" }]
  },
  "nodetool.output.Output": {
    inputs: [{ name: "value", type: "any" }],
    outputs: []
  },
  "nodetool.text.Slice": {
    inputs: [
      { name: "text", type: "str", required: true },
      { name: "start", type: "int" }
    ],
    outputs: [{ name: "output", type: "str" }]
  },
  "nodetool.text.Concat": {
    inputs: [],
    outputs: [{ name: "output", type: "str" }],
    supportsDynamicInputs: true
  },
  "nodetool.llm.Generate": {
    inputs: [
      { name: "model", type: "language_model" },
      { name: "prompt", type: "str" }
    ],
    outputs: [{ name: "text", type: "str" }]
  },
  "nodetool.image.Blur": {
    inputs: [{ name: "image", type: "image" }],
    outputs: [{ name: "output", type: "image" }]
  },
  [PLAN_CODE_NODE_TYPE]: {
    inputs: [
      { name: "code", type: "str" },
      { name: "secrets", type: "list" }
    ],
    outputs: [],
    supportsDynamicInputs: true,
    supportsDynamicOutputs: true
  }
};

const CSV_BODY = [
  'import { parse } from "@nodetool-ai/sandbox-csv";',
  "const rows = await parse(inputs.input);",
  'await output("output", rows);'
].join("\n");

const lookup: PlanNodeLookup = (type) => SHAPES[type] ?? null;

const plan = (over: Partial<ReturnType<typeof workflowSetupPlan.parse>> = {}) =>
  workflowSetupPlan.parse({
    inputs: [{ name: "text", type: "string", sample: "hello" }],
    steps: [
      {
        id: "s1",
        title: "Trim it",
        summary: "cut the text down",
        node_type: "nodetool.text.Slice"
      }
    ],
    outputs: [{ name: "result", type: "string" }],
    ...over
  });

describe("parseWorkflowPlan", () => {
  it("fills in step ids the model is not asked for", () => {
    const parsed = parseWorkflowPlan({
      inputs: [],
      steps: [{ title: "A", summary: "a", node_type: "nodetool.text.Slice" }],
      outputs: []
    });
    expect(parsed?.steps[0].id).toBe("step-1");
  });

  it("reads a missing or non-string node_type as null rather than dropping the step", () => {
    const parsed = parseWorkflowPlan({
      inputs: [],
      steps: [{ title: "A", summary: "a" }, { title: "B", summary: "b", node_type: 7 }],
      outputs: []
    });
    expect(parsed?.steps.map((step) => step.node_type)).toEqual([null, null]);
  });

  it("makes a step that carries code a Code step, whatever type it named", () => {
    const parsed = parseWorkflowPlan({
      inputs: [],
      steps: [
        {
          title: "Parse the CSV",
          summary: "rows from text",
          node_type: "nodetool.json.ParseCSV",
          code: CSV_BODY
        }
      ],
      outputs: []
    });
    expect(parsed?.steps[0].node_type).toBe(PLAN_CODE_NODE_TYPE);
    expect(parsed?.steps[0].code).toBe(CSV_BODY);
  });

  it("reads a null model_role as no model rather than dropping the plan", () => {
    const parsed = parseWorkflowPlan({
      inputs: [],
      steps: [
        {
          title: "Parse",
          summary: "rows",
          node_type: PLAN_CODE_NODE_TYPE,
          model_role: null,
          code: CSV_BODY
        }
      ],
      outputs: []
    });
    expect(parsed?.steps[0].model_role).toBeUndefined();
    expect(parsed?.steps[0].code).toBe(CSV_BODY);
  });

  it("returns null for an answer that is not a plan", () => {
    expect(parseWorkflowPlan("no")).toBeNull();
    expect(parseWorkflowPlan(null)).toBeNull();
  });
});

describe("resolveWorkflowPlan (D23)", () => {
  const known = (type: string) => type in SHAPES;

  it("marks a step whose node type the registry does not have", () => {
    const resolved = resolveWorkflowPlan(
      plan({
        steps: [
          {
            id: "s1",
            title: "Do it",
            summary: "x",
            node_type: "nodetool.made.Up"
          }
        ]
      }),
      { knownNodeType: known, providerConfigured: () => true }
    );
    expect(resolved.steps[0].unknownNodeType).toBe(true);
    expect(resolved.steps[0].block).toBe("unknown-node-type");
    expect(resolved.canContinue).toBe(false);
  });

  it("marks a step with no node type at all", () => {
    const resolved = resolveWorkflowPlan(
      plan({
        steps: [{ id: "s1", title: "Do it", summary: "x", node_type: null }]
      }),
      { knownNodeType: known, providerConfigured: () => true }
    );
    expect(resolved.steps[0].unknownNodeType).toBe(true);
    expect(resolved.canContinue).toBe(false);
  });

  it("marks a needed model role no configured provider covers", () => {
    const resolved = resolveWorkflowPlan(
      plan({
        steps: [
          {
            id: "s1",
            title: "Write it",
            summary: "x",
            node_type: "nodetool.llm.Generate",
            model_role: "language"
          }
        ]
      }),
      { knownNodeType: known, providerConfigured: () => false }
    );
    expect(resolved.steps[0].missingProvider).toBe("language");
    expect(resolved.steps[0].block).toBe("missing-provider");
    expect(resolved.missingRoles).toEqual(["language"]);
    expect(resolved.canContinue).toBe(false);
  });

  it("continues when every step names a known type and every role is configured", () => {
    const resolved = resolveWorkflowPlan(plan(), {
      knownNodeType: known,
      providerConfigured: () => true
    });
    expect(resolved.canContinue).toBe(true);
    expect(resolved.steps[0].block).toBeNull();
  });

  it("asks each distinct role once, however many steps use it", () => {
    const asked: string[] = [];
    resolveWorkflowPlan(
      plan({
        steps: Array.from({ length: 20 }, (_unused, index) => ({
          id: `s${index}`,
          title: "Write",
          summary: "x",
          node_type: "nodetool.llm.Generate",
          model_role: "language"
        }))
      }),
      {
        knownNodeType: known,
        providerConfigured: (role) => {
          asked.push(role);
          return true;
        }
      }
    );
    expect(asked).toEqual(["language"]);
  });
});

describe("planToPlacement", () => {
  it("chains input → step → output and reports no issue", () => {
    const placed = planToPlacement(plan(), lookup);
    expect(placed.issues).toEqual([]);
    expect(placed.nodes.map((node) => node.type)).toEqual([
      "nodetool.input.StringInput",
      "nodetool.text.Slice",
      "nodetool.output.Output"
    ]);
    expect(placed.edges).toEqual([
      {
        source: "input_1",
        sourceHandle: "output",
        target: "step_1",
        targetHandle: "text"
      },
      {
        source: "step_1",
        sourceHandle: "output",
        target: "output_1",
        targetHandle: "value"
      }
    ]);
  });

  it("carries the plan step id on the node it placed (PRD § 11.5)", () => {
    const placed = planToPlacement(plan(), lookup);
    expect(placed.nodes.find((node) => node.id === "step_1")?.setupStepId).toBe(
      "s1"
    );
    // Input and output nodes come from no step and carry nothing.
    expect(placed.nodes[0].setupStepId).toBeUndefined();
  });

  it("puts the plan input's sample on the input node so the test run has a value", () => {
    const placed = planToPlacement(plan(), lookup);
    expect(placed.nodes[0].properties).toEqual({
      name: "text",
      value: "hello"
    });
  });

  it("converts a number input's string sample to a number for FloatInput", () => {
    const placed = planToPlacement(
      plan({ inputs: [{ name: "count", type: "number", sample: "3.5" }] }),
      lookup
    );
    expect(placed.nodes[0].type).toBe("nodetool.input.FloatInput");
    expect(placed.nodes[0].properties).toEqual({ name: "count", value: 3.5 });
  });

  it("drops a number sample that does not parse", () => {
    const placed = planToPlacement(
      plan({ inputs: [{ name: "count", type: "number", sample: "three" }] }),
      lookup
    );
    expect(placed.nodes[0].properties).toEqual({ name: "count" });
  });

  it("drops a sample on a media input, which takes an upload", () => {
    const placed = planToPlacement(
      plan({ inputs: [{ name: "photo", type: "image", sample: "photo.png" }] }),
      lookup
    );
    expect(placed.nodes[0].properties).toEqual({ name: "photo" });
  });

  it("never wires a chain into a model property", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Write",
            summary: "x",
            node_type: "nodetool.llm.Generate",
            model_role: "language"
          }
        ]
      }),
      lookup
    );
    expect(placed.edges[0].targetHandle).toBe("prompt");
  });

  it("declares a dynamic slot for a node with no static handle", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Join",
            summary: "x",
            node_type: "nodetool.text.Concat"
          }
        ]
      }),
      lookup
    );
    const step = placed.nodes.find((node) => node.id === "step_1");
    expect(step?.dynamicProperties).toEqual({ input_1: "" });
    expect(placed.edges[0].targetHandle).toBe("input_1");
    expect(placed.issues).toEqual([]);
  });

  it("places a Code step with its body, its named input and its named output", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Parse the CSV",
            summary: "rows from text",
            node_type: PLAN_CODE_NODE_TYPE,
            code: CSV_BODY
          }
        ]
      }),
      lookup
    );
    const step = placed.nodes.find((node) => node.id === "step_1");
    expect(step?.properties).toEqual({ code: CSV_BODY });
    expect(step?.dynamicProperties).toEqual({ input: "" });
    expect(step?.dynamicOutputs).toEqual({
      output: { type: "any", type_args: [], optional: false }
    });
    expect(placed.edges).toEqual([
      {
        source: "input_1",
        sourceHandle: "output",
        target: "step_1",
        targetHandle: "input"
      },
      {
        source: "step_1",
        sourceHandle: "output",
        target: "output_1",
        targetHandle: "value"
      }
    ]);
    expect(placed.issues).toEqual([]);
  });

  it("wires a Code step through the handles its body names", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Parse CSV",
            summary: "rows from text",
            node_type: PLAN_CODE_NODE_TYPE,
            code: "return { rows: inputs.text };",
            code_inputs: ["text"],
            code_outputs: ["rows"]
          }
        ]
      }),
      lookup
    );
    const step = placed.nodes.find((node) => node.id === "step_1");
    expect(step?.dynamicProperties).toEqual({ text: "" });
    expect(Object.keys(step?.dynamicOutputs ?? {})).toEqual(["rows"]);
    expect(placed.edges.map((edge) => [edge.sourceHandle, edge.targetHandle])).toEqual([
      ["output", "text"],
      ["rows", "value"]
    ]);
    expect(placed.issues).toEqual([]);
  });

  it("reports a Code step that carries no code", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Parse",
            summary: "x",
            node_type: PLAN_CODE_NODE_TYPE
          }
        ]
      }),
      lookup
    );
    expect(placed.issues).toEqual([
      'step 1 ("Parse") is a Code step with no code, so it outputs nothing.'
    ]);
  });

  it("reports a step the registry does not have instead of placing it", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          { id: "s1", title: "Ghost", summary: "x", node_type: "nodetool.made.Up" }
        ]
      }),
      lookup
    );
    expect(placed.nodes.some((node) => node.type === "nodetool.made.Up")).toBe(
      false
    );
    expect(placed.issues.join(" ")).toContain("the registry does not have");
  });

  it("reports an output with no step upstream — the graph that runs and produces nothing (R6)", () => {
    const placed = planToPlacement(plan({ steps: [] }), lookup);
    expect(placed.edges).toEqual([]);
    expect(placed.issues.join(" ")).toContain("produces nothing");
  });

  it("reports a step whose node takes nothing the upstream produces", () => {
    const placed = planToPlacement(
      plan({
        inputs: [{ name: "photo", type: "image" }],
        steps: [
          {
            id: "s1",
            title: "Trim",
            summary: "x",
            node_type: "nodetool.text.Slice"
          }
        ]
      }),
      lookup
    );
    expect(placed.issues.join(" ")).toContain("no input that takes image");
  });

  it("reports a plan with no output", () => {
    expect(planToPlacement(plan({ outputs: [] }), lookup).issues.join(" ")).toContain(
      "declares no output"
    );
  });

  it("feeds a second input into the first step's next free handle", () => {
    const placed = planToPlacement(
      plan({
        inputs: [
          { name: "text", type: "string" },
          { name: "start", type: "number" }
        ]
      }),
      lookup
    );
    // `start` is an int handle and the second input is a float node, so the
    // chain leaves it unconnected and says so rather than mis-wiring it.
    expect(placed.edges.filter((edge) => edge.target === "step_1")).toHaveLength(
      1
    );
    expect(placed.issues.join(" ")).toContain("reached no step");
  });

  it("stays linear on a long plan", () => {
    const steps = Array.from({ length: 2000 }, (_unused, index) => ({
      id: `s${index}`,
      title: "Blur",
      summary: "x",
      node_type: "nodetool.image.Blur"
    }));
    const started = Date.now();
    const placed = planToPlacement(
      plan({ inputs: [{ name: "photo", type: "image" }], steps }),
      lookup
    );
    // 2000 chain edges plus the one that feeds the output node.
    expect(placed.edges).toHaveLength(2001);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("planInputSample", () => {
  it("keeps text samples and converts typed ones", () => {
    expect(planInputSample({ name: "a", type: "string", sample: "x" })).toBe("x");
    expect(planInputSample({ name: "a", type: "number", sample: "  " })).toBeUndefined();
    expect(planInputSample({ name: "a", type: "integer", sample: "4" })).toBe(4);
    expect(planInputSample({ name: "a", type: "integer", sample: "4.2" })).toBeUndefined();
    expect(planInputSample({ name: "a", type: "audio", sample: "x" })).toBeUndefined();
  });
});

describe("checkWorkflowPlan", () => {
  it("passes a plan that builds", () => {
    expect(checkWorkflowPlan(plan(), { lookup })).toEqual([]);
  });

  it("reports an unknown node type and does not report the models chosen later", () => {
    const problems = checkWorkflowPlan(
      plan({
        steps: [
          {
            id: "s1",
            title: "Write",
            summary: "x",
            node_type: "nodetool.llm.Generate",
            model_role: "language"
          },
          { id: "s2", title: "Parse", summary: "x", node_type: "nodetool.json.ParseCSV" }
        ]
      }),
      { lookup }
    );
    expect(problems).toEqual([
      'step 2 ("Parse") names "nodetool.json.ParseCSV", which the registry does not have.'
    ]);
  });

  it("reports an input node planned as a step", () => {
    const problems = checkWorkflowPlan(
      plan({
        steps: [
          { id: "s1", title: "Text in", summary: "x", node_type: "nodetool.input.StringInput" },
          { id: "s2", title: "Trim", summary: "x", node_type: "nodetool.text.Slice" }
        ]
      }),
      { lookup }
    );
    expect(problems).toContain(
      'step 1 ("Text in") is the workflow input/output node "nodetool.input.StringInput"; declare it under inputs or outputs, not as a step.'
    );
  });

  it("reports a second input that lands on a step other than Code", () => {
    const problems = checkWorkflowPlan(
      plan({
        inputs: [
          { name: "text", type: "string" },
          { name: "suffix", type: "string" }
        ],
        steps: [
          { id: "s1", title: "Join", summary: "x", node_type: "nodetool.text.Concat" }
        ]
      }),
      { lookup }
    );
    expect(problems).toEqual([
      'input "suffix" lands on "input_2" of nodetool.text.Concat: only a Code step can take a second input, as inputs.input_2.'
    ]);
  });

  it("reports more outputs than the chain's one value", () => {
    const problems = checkWorkflowPlan(
      plan({
        outputs: [
          { name: "post", type: "string" },
          { name: "excerpt", type: "string" }
        ]
      }),
      { lookup }
    );
    expect(problems).toEqual([
      "the plan declares 2 outputs, but every output receives the last step's one value; declare one output."
    ]);
  });

  it("hands a Code step every input the build connects to it", () => {
    const seen: unknown[] = [];
    checkWorkflowPlan(
      plan({
        inputs: [
          { name: "csv", type: "string" },
          { name: "style", type: "string" }
        ],
        steps: [
          { id: "s1", title: "Prompts", summary: "x", node_type: PLAN_CODE_NODE_TYPE, code: CSV_BODY }
        ]
      }),
      { lookup, checkCode: (_code, handles) => { seen.push(handles); return []; } }
    );
    expect(seen).toEqual([{ inputs: ["input", "input_2"], output: "output" }]);
  });

  it("hands each Code body to the code check with the handles the build wires", () => {
    const seen: unknown[] = [];
    const problems = checkWorkflowPlan(
      plan({
        steps: [
          {
            id: "s1",
            title: "Prompts",
            summary: "x",
            node_type: PLAN_CODE_NODE_TYPE,
            code: CSV_BODY
          }
        ]
      }),
      {
        lookup,
        checkCode: (code, handles) => {
          seen.push({ code, handles });
          return ["it calls output() once per item"];
        }
      }
    );
    expect(seen).toEqual([
      { code: CSV_BODY, handles: { inputs: ["input"], output: "output" } }
    ]);
    expect(problems).toEqual([
      'step 1 ("Prompts") it calls output() once per item.'
    ]);
  });
});

describe("refineWorkflowPlan", () => {
  const draft = (code: string) => ({
    inputs: [{ name: "csv", type: "string", sample: "a\n1" }],
    steps: [
      { title: "Prompts", summary: "one per row", node_type: PLAN_CODE_NODE_TYPE, code }
    ],
    outputs: [{ name: "prompts", type: "string" }]
  });
  const LOOPED = 'for (const row of inputs.input) { await output("output", row); }';
  const FIXED = 'for (const row of inputs.input) { await emit("output", row); }';
  const check = (candidate: ReturnType<typeof workflowSetupPlan.parse>) =>
    candidate.steps[0].code === LOOPED ? ["output() in a loop"] : [];
  const START: PlannerMessage[] = [
    { role: "system", content: "plan" },
    { role: "user", content: "Task: prompts from a CSV" }
  ];

  it("sends the problems back and returns the plan that passes", async () => {
    const calls: PlannerMessage[][] = [];
    const answers = [draft(LOOPED), draft(FIXED)];
    const result = await refineWorkflowPlan({
      messages: START,
      generate: async (messages) => {
        calls.push([...messages]);
        return answers[calls.length - 1];
      },
      check
    });
    expect(result.rounds).toBe(2);
    expect(result.problems).toEqual([]);
    expect(result.plan?.steps[0].code).toBe(FIXED);
    const repair = calls[1];
    expect(repair).toHaveLength(4);
    expect(repair[2].role).toBe("assistant");
    expect(JSON.parse(repair[2].content).steps[0].code).toBe(LOOPED);
    expect(repair[3].content).toContain("- output() in a loop");
  });

  it("stops after the round limit with the best plan and what is still wrong", async () => {
    let calls = 0;
    const result = await refineWorkflowPlan({
      messages: START,
      generate: async () => {
        calls += 1;
        return draft(LOOPED);
      },
      check,
      maxRounds: 2
    });
    expect(calls).toBe(2);
    expect(result.plan?.steps[0].code).toBe(LOOPED);
    expect(result.problems).toEqual(["output() in a loop"]);
  });

  it("keeps the first plan when a repair call fails", async () => {
    let calls = 0;
    const result = await refineWorkflowPlan({
      messages: START,
      generate: async () => {
        calls += 1;
        if (calls === 1) {
          return draft(LOOPED);
        }
        throw new Error("429 rate limited");
      },
      check
    });
    expect(calls).toBe(2);
    expect(result.plan?.steps[0].code).toBe(LOOPED);
    expect(result.problems).toEqual(["output() in a loop"]);
    expect(result.rounds).toBe(1);
  });

  it("rejects when the first call fails, since there is no plan to keep", async () => {
    await expect(
      refineWorkflowPlan({
        messages: START,
        generate: async () => {
          throw new Error("401 bad key");
        },
        check
      })
    ).rejects.toThrow("401 bad key");
  });

  it("rejects an aborted repair call rather than handing back the old plan", async () => {
    let calls = 0;
    await expect(
      refineWorkflowPlan({
        messages: START,
        generate: async () => {
          calls += 1;
          if (calls === 1) {
            return draft(LOOPED);
          }
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        },
        check
      })
    ).rejects.toThrow("aborted");
  });

  it("reports each round before its call", async () => {
    const rounds: number[] = [];
    const answers = [draft(LOOPED), draft(FIXED)];
    let calls = 0;
    await refineWorkflowPlan({
      messages: START,
      generate: async () => answers[calls++],
      check,
      onRound: (round) => rounds.push(round)
    });
    expect(rounds).toEqual([1, 2]);
  });

  it("asks again when an answer is not a plan", async () => {
    const answers: Array<Record<string, unknown> | null> = [null, draft(FIXED)];
    let calls = 0;
    const result = await refineWorkflowPlan({
      messages: START,
      generate: async () => answers[calls++],
      check
    });
    expect(calls).toBe(2);
    expect(result.problems).toEqual([]);
  });
});
