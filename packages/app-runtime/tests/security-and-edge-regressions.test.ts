import { describe, expect, it } from "vitest";
import {
  applyEvent,
  chatAppLayout,
  chatAppSnapshot,
  compileRecipeApplication,
  createInstanceState,
  evaluateCondition,
  formatDuration,
  formatTemplate,
  inspectRecipeManifest,
  isKnownWidget,
  isSketchDocumentLike,
  isTimelineSequenceLike,
  messageToEvents,
  operationActivity,
  operationError,
  operationNodeRuns,
  operationProgress,
  operationTranscript,
  parseApplicationBundle,
  parseApplicationDocument,
  readRef,
  resolveOperationParams,
  settledInvocation,
  validateRecipeBindings,
  widgetFields,
  type ApplicationDocument,
  type BindingScope,
  type BoundRecipeOperation,
  type FoldContext,
  type OperationBinding
} from "../src/index.js";

const emptyScope: BindingScope = {
  operations: [{ operationId: "main", inputs: [], outputs: [], nodeIds: [] }],
  variables: [
    { id: "x", name: "x", scope: "instance", persist: false },
    { id: "toString", name: "toString", scope: "instance", persist: false }
  ],
  defaultOperationId: "main"
};

describe("conditions: prototype lookup and filter bounds", () => {
  it("treats Object.prototype property names as unknown filters instead of calling or throwing", () => {
    const state = applyEvent(createInstanceState(), {
      type: "setVariable",
      variableId: "x",
      value: "hello"
    });
    expect(formatTemplate("{var:x|hasOwnProperty}", state, emptyScope)).toBe("");
    expect(formatTemplate("{var:x|toString}", state, emptyScope)).toBe("");
    expect(formatTemplate("{var:x|constructor}", state, emptyScope)).toBe("");
    expect(formatTemplate("{var:x|valueOf}", state, emptyScope)).toBe("");
  });

  it("does not throw RangeError on out-of-range or non-finite number filter digits", () => {
    const state = applyEvent(createInstanceState(), {
      type: "setVariable",
      variableId: "x",
      value: 3.14159
    });
    expect(formatTemplate("{var:x|number:101}", state, emptyScope)).toBe("3.14159");
    expect(formatTemplate("{var:x|number:-1}", state, emptyScope)).toBe("3.14159");
    expect(formatTemplate("{var:x|number:Infinity}", state, emptyScope)).toBe("3.14159");
  });

  it("does not read Object.prototype properties as unset variable values", () => {
    const state = createInstanceState();
    expect(readRef(state, { source: "variable", variableId: "toString" })).toBeUndefined();
    expect(
      evaluateCondition(state, {
        ref: { source: "variable", variableId: "toString" },
        op: "notEmpty"
      })
    ).toBe(false);
    expect(formatTemplate("{var:toString}", state, emptyScope)).toBe("");
  });
});

describe("widgets: prototype lookup in catalog helpers", () => {
  it("rejects Object.prototype property names in isKnownWidget and widgetFields", () => {
    expect(isKnownWidget("toString")).toBe(false);
    expect(isKnownWidget("constructor")).toBe(false);
    expect(isKnownWidget("__proto__")).toBe(false);
    expect(widgetFields("toString")).toEqual({});
    expect(widgetFields("constructor")).toEqual({});
  });
});

describe("state: prototype lookup and __proto__ isolation", () => {
  it("drops outputValue and invocationAlias for unstarted Object.prototype invocation ids", () => {
    const base = createInstanceState();
    const afterOutput = applyEvent(base, {
      type: "outputValue",
      key: "main:out",
      invocationId: "toString",
      value: "spoofed",
      disposition: "replace"
    });
    expect(afterOutput).toBe(base);

    const afterAlias = applyEvent(base, {
      type: "invocationAlias",
      aliasId: "toString",
      invocationId: "constructor"
    });
    expect(afterAlias).toBe(base);
  });

  it("ignores invocation lifecycle events for unstarted Object.prototype invocation ids", () => {
    const base = createInstanceState();
    expect(
      applyEvent(base, {
        type: "invocationStatus",
        invocationId: "toString",
        status: "failed"
      })
    ).toBe(base);
    expect(
      applyEvent(base, {
        type: "invocationActivity",
        invocationId: "toString",
        label: "running"
      })
    ).toBe(base);
  });

  it("seeds and toggles variables named after Object.prototype properties", () => {
    const seeded = applyEvent(createInstanceState(), {
      type: "seedVariables",
      values: { toString: "seeded-value" }
    });
    expect(Object.prototype.hasOwnProperty.call(seeded.variables, "toString")).toBe(true);
    expect(seeded.variables.toString).toBe("seeded-value");

    const toggled = applyEvent(createInstanceState(), {
      type: "toggleVariable",
      variableId: "toString"
    });
    expect(toggled.variables.toString).toBe(true);
  });

  it("does not mutate outputs prototype when runStarted has __proto__ output key", () => {
    const next = applyEvent(createInstanceState(), {
      type: "runStarted",
      invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
      outputKeys: ["__proto__"]
    });
    expect(Object.getPrototypeOf(next.outputs)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(next.outputs, "__proto__")).toBe(true);
  });

  it("does not read inherited activeInvocation entries in operation selectors", () => {
    const state = createInstanceState();
    expect(operationProgress(state, "toString")).toBeUndefined();
    expect(operationError(state, "toString")).toBeUndefined();
    expect(operationActivity(state, "toString")).toBeUndefined();
    expect(operationNodeRuns(state, "toString")).toEqual({});
    expect(operationTranscript(state, "toString")).toEqual([]);
  });
});

describe("fold: prototype lookup, non-finite progress, and circular tool results", () => {
  const ctx: FoldContext = {
    resolveInvocation: (jobId) =>
      jobId === "j1"
        ? { id: "j1", operationId: "main", status: "running", startedAt: 1 }
        : null,
    outputKey: () => null
  };

  it("ignores job_update statuses matching Object.prototype property names", () => {
    expect(
      messageToEvents({ type: "job_update", job_id: "j1", status: "toString" }, ctx)
    ).toEqual([]);
    expect(
      messageToEvents({ type: "job_update", job_id: "j1", status: "constructor" }, ctx)
    ).toEqual([]);
  });

  it("does not propagate NaN or Infinity progress ratios", () => {
    expect(
      messageToEvents(
        { type: "node_progress", job_id: "j1", node_id: "n1", progress: Number.NaN, total: 10 },
        ctx
      )
    ).toEqual([{ type: "invocationProgress", invocationId: "j1", progress: undefined }]);

    expect(
      messageToEvents(
        { type: "node_progress", job_id: "j1", node_id: "n1", progress: Number.POSITIVE_INFINITY, total: 10 },
        ctx
      )
    ).toEqual([{ type: "invocationProgress", invocationId: "j1", progress: undefined }]);

    expect(
      messageToEvents(
        { type: "node_progress", job_id: "j1", node_id: "n1", progress: 5, total: Number.POSITIVE_INFINITY },
        ctx
      )
    ).toEqual([{ type: "invocationProgress", invocationId: "j1", progress: undefined }]);
  });

  it("handles circular objects in tool_result_update without throwing", () => {
    const circular: Record<string, unknown> = { ok: true };
    circular.self = circular;
    const events = messageToEvents(
      {
        type: "tool_result_update",
        job_id: "j1",
        tool_call_id: "c1",
        name: "search",
        result: circular
      },
      ctx
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("invocationTranscript");
  });
});

describe("document and bundle: NaN schemaVersion, __proto__ mappings, Infinity style, and prototype output lookup", () => {
  it("rejects NaN schemaVersion in parseApplicationDocument, parseApplicationBundle, and inspectRecipeManifest", () => {
    expect(
      parseApplicationDocument({
        schemaVersion: Number.NaN,
        ui: { root: {}, content: [] },
        operations: [],
        resources: [],
        variables: []
      })
    ).toBeNull();

    expect(
      parseApplicationBundle({
        schemaVersion: Number.NaN,
        name: "Bad",
        app: {
          schemaVersion: 4,
          ui: { root: {}, content: [] },
          operations: [],
          resources: [],
          variables: []
        },
        workflows: []
      })
    ).toBeNull();

    expect(
      inspectRecipeManifest({
        schemaVersion: Number.NaN,
        slug: "bad",
        inputs: [],
        operations: [],
        outputs: []
      })
    ).toEqual({ status: "malformed" });
  });

  it("does not mutate operation.inputs prototype when parsed JSON contains __proto__ key", () => {
    const raw = JSON.parse(
      '{"schemaVersion":4,"ui":{"root":{},"content":[]},"operations":[{"id":"main","workflowId":"wf1","inputs":{"__proto__":{"from":"widget"}},"outputs":{}}],"resources":[],"variables":[]}'
    );
    const doc = parseApplicationDocument(raw);
    expect(doc).not.toBeNull();
    const inputs = doc!.operations[0].inputs;
    expect(Object.getPrototypeOf(inputs)).toBe(Object.prototype);
    expect((inputs as Record<string, unknown>).from).toBeUndefined();
  });

  it("rejects unresolved op output bindings named after Object.prototype properties", () => {
    const doc: Pick<ApplicationDocument, "recipe" | "variables" | "operations"> = {
      variables: [],
      operations: [
        {
          id: "plan",
          name: "Plan",
          workflowId: "wf1",
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ],
      recipe: {
        schemaVersion: 1,
        slug: "demo",
        inputs: [],
        operations: [{ id: "plan", bindingId: "plan", intent: "plan" }],
        outputs: [{ id: "out", kind: "value", binding: "op:plan/out:toString" }]
      }
    };
    expect(validateRecipeBindings(doc)).toEqual([
      "Recipe output out has unresolved readable binding op:plan/out:toString."
    ]);
  });

  it("rejects Infinity for strokeWidth and typography.size in recipe shots", () => {
    const baseManifest = {
      schemaVersion: 1,
      slug: "demo",
      inputs: [{ id: "headline", label: "Headline", kind: "text", required: true }],
      operations: [],
      outputs: [],
      creativeStrategy: {
        shots: [
          {
            id: "s1",
            title: "Shot 1",
            durationSeconds: 3,
            elements: [
              {
                id: "e1",
                kind: "text",
                role: "headline",
                inputId: "headline",
                typography: { size: Number.POSITIVE_INFINITY }
              }
            ]
          }
        ]
      }
    };
    expect(inspectRecipeManifest(baseManifest)).toEqual({ status: "malformed" });

    const badStroke = structuredClone(baseManifest);
    badStroke.creativeStrategy.shots[0].elements = [
      {
        id: "e2",
        kind: "shape",
        role: "decorative",
        style: { fill: "#ffffff", strokeWidth: Number.POSITIVE_INFINITY }
      } as never
    ];
    expect(inspectRecipeManifest(badStroke)).toEqual({ status: "malformed" });
  });
});

describe("recipe-compiler: prototype lookup validation bypasses", () => {
  const baseOp = (): BoundRecipeOperation => ({
    contract: {
      id: "plan",
      version: 1,
      inputs: { prompt: { type: "str", required: true } },
      outputs: { result: { type: "str", required: true } },
      spend: "none",
      sideEffects: [],
      preservation: [],
      mediaStrategies: ["still_motion_graphics"],
      idempotency: "read_only",
      staleness: "none"
    },
    binding: {
      id: "plan",
      name: "Plan",
      workflowId: "wf1",
      workflowVersion: 1,
      inputs: { prompt: { from: "variable", variableId: "prompt" } },
      outputs: { result: { to: "variable", variableId: "result" } },
      policy: "replace"
    }
  });

  it("rejects undeclared input/output ports named after Object.prototype properties", () => {
    const op = baseOp();
    op.binding.inputs.toString = { from: "constant", value: "x" };
    op.binding.outputs.constructor = { to: "variable", variableId: "extra" };

    const compiled = compileRecipeApplication(
      {
        schemaVersion: 1,
        slug: "proto-test",
        inputs: [{ id: "prompt", label: "Prompt", kind: "text", required: true }],
        operations: [{ id: "plan", bindingId: "plan", intent: "plan" }],
        outputs: [{ id: "result", kind: "value" }]
      },
      { operations: [op] }
    );
    expect(compiled.status).toBe("error");
    if (compiled.status === "error") {
      expect(compiled.diagnostics.some((d) => d.path === "recipe.operations[0].inputs.toString")).toBe(true);
      expect(compiled.diagnostics.some((d) => d.path === "recipe.operations[0].outputs.constructor")).toBe(true);
    }
  });

  it("rejects unbound required variable named toString when defaults is empty object", () => {
    const op = baseOp();
    op.binding.inputs.prompt = { from: "variable", variableId: "toString" };

    const compiled = compileRecipeApplication(
      {
        schemaVersion: 1,
        slug: "proto-default",
        inputs: [],
        defaults: {},
        operations: [{ id: "plan", bindingId: "plan", intent: "plan" }],
        outputs: [{ id: "result", kind: "value" }]
      },
      { operations: [op] }
    );
    expect(compiled.status).toBe("error");
    if (compiled.status === "error") {
      expect(
        compiled.diagnostics.some((d) =>
          d.message.includes("Required variable toString has no Recipe input, default or operation output producer.")
        )
      ).toBe(true);
    }
  });
});

describe("operations: prototype lookup and __proto__ param key", () => {
  it("does not inject Object.prototype functions for unset variables or mutate params prototype", () => {
    const operation: OperationBinding = {
      id: "main",
      name: "Run",
      workflowId: "wf1",
      inputs: {
        n1: { from: "variable", variableId: "toString" },
        n2: { from: "constant", value: { leaked: true } }
      },
      outputs: {},
      policy: "replace"
    };
    const params = resolveOperationParams({
      operation,
      state: createInstanceState(),
      inputNodeIds: ["n1", "n2"],
      inputName: (id) => (id === "n1" ? "text" : "__proto__")
    });
    expect(params.text).toBeUndefined();
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect((params as Record<string, unknown>).leaked).toBeUndefined();
  });
});

describe("chat-app: prototype lookup in snapshot and settledInvocation", () => {
  it("reports unset required variable named toString as missing and null", () => {
    const doc: ApplicationDocument = {
      schemaVersion: 5,
      ui: {
        root: {},
        content: [
          {
            type: "Stepper",
            props: {
              id: "steps",
              binding: "var:step",
              steps: [{ value: "s1", title: "Step 1" }]
            }
          },
          {
            type: "TextInput",
            props: {
              id: "f1",
              label: "Label",
              binding: "var:toString",
              visibleWhen: { binding: "var:step", op: "eq", value: "s1" }
            }
          }
        ]
      },
      operations: [
        {
          id: "toString",
          name: "Run",
          workflowId: "wf1",
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ],
      resources: [],
      variables: [
        { id: "step", name: "step", scope: "instance", persist: false },
        { id: "toString", name: "toString", scope: "instance", persist: false }
      ],
      presentation: "chat",
      recipe: {
        schemaVersion: 1,
        slug: "chat-proto",
        inputs: [{ id: "toString", label: "Label", kind: "text", required: true }],
        operations: [{ id: "op", bindingId: "toString", intent: "run" }],
        outputs: []
      }
    };
    const layout = chatAppLayout(doc)!;
    const snap = chatAppSnapshot(doc, layout, createInstanceState());
    expect(snap.variables.toString).toBeNull();
    expect(snap.missing_required).toEqual(["toString (Label) on step s1"]);
    expect(snap.operations[0].status).toBe("idle");
    expect(settledInvocation(createInstanceState(), "toString", undefined)).toBeNull();
  });
});

describe("documents: non-finite duration and dimensions", () => {
  it("formats NaN and Infinity durations safely as 0:00 and rejects non-finite dimensions", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(isTimelineSequenceLike({ durationMs: Number.NaN, tracks: [], clips: [] })).toBe(false);
    expect(isSketchDocumentLike({ canvas: { width: Number.NaN, height: 10 }, layers: [] })).toBe(false);
  });
});
