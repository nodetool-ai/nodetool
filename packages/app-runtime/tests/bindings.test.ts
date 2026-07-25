import { describe, expect, it } from "vitest";

import {
  encodeBinding,
  migrateBindings,
  parseBinding,
  resolveBinding,
  stateKey,
  type BindingScope
} from "../src/bindings.js";

const scope: BindingScope = {
  defaultOperationId: "main",
  operations: [
    {
      operationId: "main",
      inputs: [{ nodeId: "n1", name: "prompt" }],
      outputs: [{ nodeId: "n9", name: "result" }],
      nodeIds: ["n1", "n5", "n9"],
      variableNames: ["legacyChannel"]
    }
  ],
  variables: [
    { id: "var-dark", name: "dark", scope: "instance", persist: false }
  ]
};

describe("binding tokens", () => {
  it("round-trips every ref kind", () => {
    const refs = [
      { kind: "input", operationId: "main", nodeId: "n1" },
      { kind: "output", operationId: "op2", nodeId: "n9" },
      { kind: "nodeProperty", operationId: "main", nodeId: "n5", property: "strength" },
      { kind: "execution", operationId: "main", field: "running" },
      { kind: "variable", variableId: "var-dark" },
      { kind: "view", componentId: "Slider-1", prop: "value" }
    ] as const;
    for (const ref of refs) {
      expect(parseBinding(encodeBinding(ref))).toEqual(ref);
    }
  });

  it("keys inputs and outputs per operation so two operations never collide", () => {
    expect(stateKey({ kind: "input", operationId: "a", nodeId: "n1" })).toBe("a:n1");
    expect(stateKey({ kind: "input", operationId: "b", nodeId: "n1" })).toBe("b:n1");
  });

  it("rejects malformed tokens", () => {
    expect(parseBinding("op:main/in:")).toBeNull();
    expect(parseBinding("op:/in:n1")).toBeNull();
    expect(parseBinding("op:main/exec#bogus")).toBeNull();
    expect(parseBinding("")).toBeNull();
    expect(parseBinding(undefined)).toBeNull();
  });
});

describe("resolveBinding", () => {
  it("resolves a legacy input name by node id", () => {
    expect(resolveBinding("prompt", scope, "write")).toEqual({
      kind: "input",
      operationId: "main",
      nodeId: "n1"
    });
  });

  it("resolves a legacy output name by node id", () => {
    expect(resolveBinding("result", scope, "read")).toEqual({
      kind: "output",
      operationId: "main",
      nodeId: "n9"
    });
  });

  it("resolves declared variables by id or display name", () => {
    const expected = { kind: "variable", variableId: "var-dark" };
    expect(resolveBinding("var-dark", scope, "read")).toEqual(expected);
    expect(resolveBinding("dark", scope, "read")).toEqual(expected);
  });

  it("keeps an undeclared SetVariable channel working", () => {
    expect(resolveBinding("legacyChannel", scope, "read")).toEqual({
      kind: "variable",
      variableId: "legacyChannel"
    });
  });

  it("fills the default operation into a legacy node-property binding", () => {
    expect(resolveBinding("node:n5#strength", scope, "write")).toEqual({
      kind: "nodeProperty",
      operationId: "main",
      nodeId: "n5",
      property: "strength"
    });
  });

  it("returns null for a name the graph no longer has", () => {
    expect(resolveBinding("renamed_away", scope, "write")).toBeNull();
  });
});

describe("migrateBindings", () => {
  it("rewrites names to ids and reports the rest", () => {
    const result = migrateBindings(
      [
        { binding: "prompt", mode: "write" },
        { binding: "result", mode: "read" },
        { binding: "op:main/in:n1", mode: "write" },
        { binding: "gone", mode: "read" }
      ],
      scope
    );
    expect(result.rewrites.get("prompt")).toBe("op:main/in:n1");
    expect(result.rewrites.get("result")).toBe("op:main/out:n9");
    expect(result.rewrites.has("op:main/in:n1")).toBe(false);
    expect(result.unresolved).toEqual(["gone"]);
  });
});
