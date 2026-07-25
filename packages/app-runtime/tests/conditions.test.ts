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
