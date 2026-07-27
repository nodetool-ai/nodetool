import { describe, expect, it } from "vitest";

import type { BindingScope } from "../src/bindings.js";
import {
  evaluateCondition,
  formatTemplate,
  parseCondition,
  readRef
} from "../src/conditions.js";
import { applyEvents, createInstanceState } from "../src/state.js";
import { eventToAction } from "../src/actions.js";

const scope: BindingScope = {
  defaultOperationId: "main",
  operations: [
    {
      operationId: "main",
      inputs: [{ nodeId: "n1", name: "count" }],
      outputs: [{ nodeId: "n9", name: "result" }],
      nodeIds: ["n1", "n9"]
    }
  ],
  variables: [{ id: "dark", name: "dark", scope: "instance", persist: false }]
};

const state = applyEvents(createInstanceState(), [
  { type: "setInput", key: "main:n1", value: 5 },
  { type: "setVariable", variableId: "dark", value: true },
  {
    type: "runStarted",
    invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
    outputKeys: []
  },
  {
    type: "outputValue",
    key: "main:n9",
    invocationId: "j1",
    value: "a long piece of streamed text",
    disposition: "replace"
  }
]);

describe("conditions", () => {
  it("compares Puck's string literals against typed values", () => {
    const gt = parseCondition({ binding: "count", op: "gt", value: "3" }, scope, "write");
    expect(gt && evaluateCondition(state, gt)).toBe(true);
    const lt = parseCondition({ binding: "count", op: "lt", value: "3" }, scope, "write");
    expect(lt && evaluateCondition(state, lt)).toBe(false);
    const eq = parseCondition({ binding: "dark", op: "eq", value: "true" }, scope);
    expect(eq && evaluateCondition(state, eq)).toBe(true);
  });

  it("treats missing, empty, and false values as empty", () => {
    const empty = parseCondition({ binding: "result", op: "empty" }, scope);
    expect(empty && evaluateCondition(state, empty)).toBe(false);
    const notEmpty = parseCondition({ binding: "result", op: "notEmpty" }, scope);
    expect(notEmpty && evaluateCondition(state, notEmpty)).toBe(true);
  });

  it("reads execution state", () => {
    expect(
      readRef(state, { source: "execution", operationId: "main", field: "running" })
    ).toBe(true);
  });

  it("returns null rather than hiding a widget on an unresolvable binding", () => {
    expect(parseCondition({ binding: "gone", op: "eq", value: "x" }, scope)).toBeNull();
    expect(parseCondition({}, scope)).toBeNull();
  });

  it("defaults an unknown operator to notEmpty", () => {
    const condition = parseCondition({ binding: "result", op: "matches" }, scope);
    expect(condition?.op).toBe("notEmpty");
  });
});

describe("format templates", () => {
  it("interpolates bindings and applies one filter", () => {
    expect(formatTemplate("{count} items", state, scope)).toBe("5 items");
    expect(formatTemplate("{count|number:2}", state, scope)).toBe("5.00");
    expect(formatTemplate("{result|truncate:6}", state, scope)).toBe("a long…");
    expect(formatTemplate("{result|upper}", state, scope)).toBe(
      "A LONG PIECE OF STREAMED TEXT"
    );
  });

  it("renders nothing for an unknown filter or binding", () => {
    expect(formatTemplate("[{result|bogus}]", state, scope)).toBe("[]");
    expect(formatTemplate("[{gone}]", state, scope)).toBe("[]");
  });

  it("leaves text with no tokens alone", () => {
    expect(formatTemplate("plain", state, scope)).toBe("plain");
  });
});

describe("event to action", () => {
  const ctx = {
    defaultOperationId: "main",
    resolveVariableId: (key: string | undefined) => (key === "dark" ? "dark" : null)
  };

  it("maps legacy setState/toggleState onto the variable actions", () => {
    expect(
      eventToAction({ trigger: "click", kind: "setState", key: "dark", value: "1" }, ctx)
    ).toEqual({ kind: "setVariable", variableId: "dark", value: "1" });
    expect(
      eventToAction({ trigger: "click", kind: "toggleState", key: "dark" }, ctx)
    ).toEqual({ kind: "toggleVariable", variableId: "dark" });
  });

  it("drops a variable action whose variable is gone", () => {
    expect(
      eventToAction({ trigger: "click", kind: "setState", key: "ghost" }, ctx)
    ).toBeNull();
  });

  it("targets the default operation when the event names none", () => {
    expect(eventToAction({ trigger: "click", kind: "run" }, ctx)).toEqual({
      kind: "run",
      operationId: "main",
      from: undefined
    });
    expect(
      eventToAction({ trigger: "click", kind: "run", operationId: "publish" }, ctx)
    ).toMatchObject({ operationId: "publish" });
  });

  it("requires a binding for resource actions", () => {
    expect(
      eventToAction({ trigger: "click", kind: "resourceCommand", command: "upload" }, ctx)
    ).toBeNull();
    expect(
      eventToAction(
        {
          trigger: "click",
          kind: "resourceCommand",
          resourceBindingId: "r1",
          command: "upload"
        },
        ctx
      )
    ).toEqual({ kind: "resourceCommand", resourceBindingId: "r1", command: "upload" });
  });
});

describe("added condition ops", () => {
  const listState = applyEvents(createInstanceState(), [
    { type: "setVariable", variableId: "dark", value: ["red", "blue"] }
  ]);

  it("mirrors gt/lt with inclusive bounds", () => {
    const gte = parseCondition({ binding: "count", op: "gte", value: "5" }, scope, "write");
    expect(gte && evaluateCondition(state, gte)).toBe(true);
    const lte = parseCondition({ binding: "count", op: "lte", value: "5" }, scope, "write");
    expect(lte && evaluateCondition(state, lte)).toBe(true);
    const tooHigh = parseCondition({ binding: "count", op: "lte", value: "4" }, scope, "write");
    expect(tooHigh && evaluateCondition(state, tooHigh)).toBe(false);
  });

  it("refuses a numeric comparison against a non-number", () => {
    const gte = parseCondition({ binding: "result", op: "gte", value: "1" }, scope);
    expect(gte && evaluateCondition(state, gte)).toBe(false);
  });

  it("matches a substring of a string value", () => {
    const yes = parseCondition({ binding: "result", op: "contains", value: "streamed" }, scope);
    expect(yes && evaluateCondition(state, yes)).toBe(true);
    const no = parseCondition({ binding: "result", op: "contains", value: "absent" }, scope);
    expect(no && evaluateCondition(state, no)).toBe(false);
  });

  it("matches a member of an array value", () => {
    const yes = parseCondition({ binding: "dark", op: "contains", value: "blue" }, scope);
    expect(yes && evaluateCondition(listState, yes)).toBe(true);
    const no = parseCondition({ binding: "dark", op: "contains", value: "green" }, scope);
    expect(no && evaluateCondition(listState, no)).toBe(false);
  });

  it("keeps the operators a closed vocabulary", () => {
    expect(parseCondition({ binding: "result", op: "gte" }, scope)?.op).toBe("gte");
    expect(parseCondition({ binding: "result", op: "regex" }, scope)?.op).toBe("notEmpty");
  });
});

describe("added format filters", () => {
  const listState = applyEvents(createInstanceState(), [
    { type: "setVariable", variableId: "dark", value: ["red", "blue"] }
  ]);

  it("lowercases", () => {
    expect(formatTemplate("{result|lower}", state, scope)).toBe(
      "a long piece of streamed text"
    );
  });

  it("joins an array, comma-separated by default", () => {
    expect(formatTemplate("{dark|join}", listState, scope)).toBe("red, blue");
    expect(formatTemplate("{dark|join:/}", listState, scope)).toBe("red/blue");
  });

  it("renders a non-array join as the value itself", () => {
    expect(formatTemplate("{result|join}", state, scope)).toBe(
      "a long piece of streamed text"
    );
  });
});

describe("activity binding", () => {
  const runningState = applyEvents(createInstanceState(), [
    {
      type: "runStarted",
      invocation: { id: "j1", operationId: "main", status: "running", startedAt: 1 },
      outputKeys: []
    },
    { type: "invocationActivity", invocationId: "j1", label: "web_search" }
  ]);

  it("resolves op:main/exec#activity and reads the label", () => {
    const condition = parseCondition(
      { binding: "op:main/exec#activity", op: "notEmpty" },
      scope
    );
    expect(condition?.ref).toEqual({
      source: "execution",
      operationId: "main",
      field: "activity"
    });
    expect(condition && evaluateCondition(runningState, condition)).toBe(true);
    expect(
      readRef(runningState, {
        source: "execution",
        operationId: "main",
        field: "activity"
      })
    ).toBe("web_search");
  });

  it("interpolates the activity label into a format template", () => {
    expect(
      formatTemplate("{op:main/exec#activity}", runningState, scope)
    ).toBe("web_search");
  });
});

describe("cancel by invocation", () => {
  it("passes an explicit invocation through", () => {
    expect(
      eventToAction(
        { trigger: "click", kind: "cancel", invocationId: "j7" },
        { defaultOperationId: "main", resolveVariableId: () => null }
      )
    ).toEqual({ kind: "cancel", operationId: "main", invocationId: "j7" });
  });

  it("omits it when the event names none, so the latest run is cancelled", () => {
    expect(
      eventToAction(
        { trigger: "click", kind: "cancel" },
        { defaultOperationId: "main", resolveVariableId: () => null }
      )
    ).toEqual({ kind: "cancel", operationId: "main" });
  });
});
