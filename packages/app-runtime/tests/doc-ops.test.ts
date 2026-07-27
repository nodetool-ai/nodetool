import { describe, expect, it } from "vitest";

import {
  EMPTY_DOC_META,
  addOperation,
  addResource,
  bindingTargets,
  declareVariable,
  removeOperation,
  removeResource,
  removeVariable,
  updateOperation,
  updateVariable,
  type AppDocMeta,
  type BindableWorkflow
} from "../src/doc-ops.js";

const workflow: BindableWorkflow = {
  inputs: [{ nodeId: "in-1", name: "prompt", label: "Prompt" }],
  outputs: [{ nodeId: "out-1", name: "answer", label: "Answer" }],
  variables: ["channel"]
};

describe("operations", () => {
  it("derives an id from the name and keeps the document immutable", () => {
    const { meta, operation } = addOperation(EMPTY_DOC_META, {
      name: "Translate Title",
      workflowId: "wf-2"
    });
    expect(operation.id).toBe("translate_title");
    expect(operation.policy).toBe("replace");
    expect(meta.operations).toHaveLength(1);
    expect(EMPTY_DOC_META.operations).toHaveLength(0);
  });

  it("collapses separator runs and trims the edges", () => {
    const { operation } = addOperation(EMPTY_DOC_META, {
      name: "  Hello -- World!  ",
      workflowId: "wf-1"
    });
    expect(operation.id).toBe("hello_world");
  });

  it("falls back when a name has nothing to slug", () => {
    const { operation } = addOperation(EMPTY_DOC_META, {
      name: "***",
      workflowId: "wf-1"
    });
    expect(operation.id).toBe("item");
  });

  it("suffixes a derived id that is already taken", () => {
    const first = addOperation(EMPTY_DOC_META, {
      name: "Run",
      workflowId: "wf-1"
    }).meta;
    const { operation } = addOperation(first, {
      name: "Run",
      workflowId: "wf-1"
    });
    expect(operation.id).toBe("run_2");
  });

  it("rejects an explicit id that already exists", () => {
    const { meta } = addOperation(EMPTY_DOC_META, {
      id: "main",
      workflowId: "wf-1"
    });
    expect(() => addOperation(meta, { id: "main", workflowId: "wf-1" })).toThrow(
      'An operation with id "main" already exists'
    );
  });

  it("merges input mappings per node id", () => {
    const { meta } = addOperation(EMPTY_DOC_META, {
      id: "main",
      workflowId: "wf-1",
      inputs: {
        "in-1": { from: "constant", value: 1 },
        "in-2": { from: "widget" }
      }
    });
    const { operation } = updateOperation(meta, "main", {
      inputs: { "in-1": { from: "variable", variableId: "lang" } }
    });
    expect(operation?.inputs).toEqual({
      "in-1": { from: "variable", variableId: "lang" },
      "in-2": { from: "widget" }
    });
  });

  it("reports a missing operation on update and remove", () => {
    expect(updateOperation(EMPTY_DOC_META, "nope", {}).operation).toBeNull();
    expect(removeOperation(EMPTY_DOC_META, "nope").removed).toBe(false);
  });

  it("removes an operation by id", () => {
    const { meta } = addOperation(EMPTY_DOC_META, {
      id: "main",
      workflowId: "wf-1"
    });
    const removed = removeOperation(meta, "main");
    expect(removed.removed).toBe(true);
    expect(removed.meta.operations).toEqual([]);
  });
});

describe("variables", () => {
  it("only lets user-scoped variables persist", () => {
    const instance = declareVariable(EMPTY_DOC_META, {
      name: "draft",
      scope: "instance",
      persist: true
    });
    expect(instance.variable.persist).toBe(false);

    const user = declareVariable(EMPTY_DOC_META, {
      name: "theme",
      scope: "user",
      persist: true
    });
    expect(user.variable.persist).toBe(true);
  });

  it("clears persist when a variable is narrowed to instance scope", () => {
    const { meta } = declareVariable(EMPTY_DOC_META, {
      id: "theme",
      scope: "user",
      persist: true
    });
    const { variable } = updateVariable(meta, "theme", { scope: "instance" });
    expect(variable?.persist).toBe(false);
  });

  it("keeps other fields when patching one", () => {
    const { meta } = declareVariable(EMPTY_DOC_META, {
      id: "lang",
      name: "Language",
      default: "en"
    });
    const { variable } = updateVariable(meta, "lang", { name: "Locale" });
    expect(variable).toMatchObject({
      id: "lang",
      name: "Locale",
      default: "en",
      scope: "instance"
    });
  });

  it("reports a missing variable on update and remove", () => {
    expect(updateVariable(EMPTY_DOC_META, "nope", {}).variable).toBeNull();
    expect(removeVariable(EMPTY_DOC_META, "nope").removed).toBe(false);
  });
});

describe("resources", () => {
  it("needs a project or a fixed id", () => {
    expect(() =>
      addResource(EMPTY_DOC_META, { kind: "asset", scope: {} })
    ).toThrow(/needs a scope/);
  });

  it("defaults to read-only", () => {
    const { resource } = addResource(EMPTY_DOC_META, {
      name: "Shots",
      kind: "timeline",
      scope: { projectId: "proj-1" }
    });
    expect(resource).toMatchObject({
      id: "shots",
      kind: "timeline",
      operations: ["read"]
    });
  });

  it("removes a resource binding by id", () => {
    const { meta } = addResource(EMPTY_DOC_META, {
      id: "shots",
      kind: "asset",
      scope: { fixedId: "asset-1" }
    });
    expect(removeResource(meta, "shots").meta.resources).toEqual([]);
    expect(removeResource(meta, "other").removed).toBe(false);
  });
});

describe("bindingTargets", () => {
  it("reports the implicit operation when the document declares none", () => {
    const targets = bindingTargets(EMPTY_DOC_META, "wf-1", workflow);
    expect(targets.operations).toHaveLength(1);
    expect(targets.operations[0]).toMatchObject({
      operationId: "main",
      workflowId: "wf-1",
      ioAvailable: true
    });
    expect(targets.operations[0].inputs[0]).toEqual({
      nodeId: "in-1",
      name: "prompt",
      label: "Prompt",
      binding: "op:main/in:in-1"
    });
    expect(targets.operations[0].outputs[0].binding).toBe("op:main/out:out-1");
    expect(targets.operations[0].execution.map((e) => e.binding)).toEqual([
      "op:main/exec#running",
      "op:main/exec#progress",
      "op:main/exec#error",
      "op:main/exec#activity"
    ]);
  });

  it("keys every operation's tokens on its own id", () => {
    const meta: AppDocMeta = addOperation(EMPTY_DOC_META, {
      id: "second",
      workflowId: "wf-1"
    }).meta;
    const targets = bindingTargets(meta, "wf-1", workflow);
    expect(targets.operations[0].inputs[0].binding).toBe("op:second/in:in-1");
  });

  it("lists no nodes for an operation over another workflow", () => {
    const { meta } = addOperation(EMPTY_DOC_META, {
      id: "other",
      workflowId: "wf-9"
    });
    const targets = bindingTargets(meta, "wf-1", workflow);
    expect(targets.operations[0]).toMatchObject({
      ioAvailable: false,
      inputs: [],
      outputs: []
    });
  });

  it("includes declared variables and the graph's SetVariable channels", () => {
    const { meta } = declareVariable(EMPTY_DOC_META, {
      id: "lang",
      name: "Language"
    });
    const targets = bindingTargets(meta, "wf-1", workflow);
    expect(targets.variables).toEqual([
      {
        id: "lang",
        name: "Language",
        scope: "instance",
        persist: false,
        binding: "var:lang"
      },
      {
        id: "channel",
        name: "channel",
        scope: "instance",
        persist: false,
        binding: "var:channel"
      }
    ]);
  });
});
