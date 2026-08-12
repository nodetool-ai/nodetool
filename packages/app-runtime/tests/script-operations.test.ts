/**
 * Script operations: the v4 target union, the v3 lift, and the bundle's
 * script-key indirection.
 */
import { describe, expect, it } from "vitest";

import {
  APP_SCHEMA_VERSION,
  createEmptyPuckData,
  isScriptOperation,
  operationTarget,
  parseApplicationDocument,
  type ApplicationDocument,
  type OperationBinding
} from "../src/document.js";
import {
  applyBundle,
  bundleFromApplication,
  parseApplicationBundle,
  pinScriptVersions,
  type BundleJsScriptDocument
} from "../src/bundle.js";

const scriptDocument: BundleJsScriptDocument = {
  schemaVersion: 1,
  code: 'await output("out", inputs.text);',
  inputs: [{ name: "text", type: "str" }],
  outputs: [{ name: "out", type: "str" }]
};

const scriptOperation = (
  id: string,
  scriptId: string,
  scriptVersion = 1
): OperationBinding => ({
  id,
  name: id,
  workflowId: "",
  target: { kind: "script", scriptId, scriptVersion },
  inputs: {},
  outputs: {},
  policy: "replace"
});

const document = (...operations: OperationBinding[]): ApplicationDocument => ({
  schemaVersion: APP_SCHEMA_VERSION,
  ui: createEmptyPuckData("Scripted"),
  operations,
  resources: [],
  variables: []
});

describe("operation targets", () => {
  it("reads a v3 operation as a workflow target", () => {
    const parsed = parseApplicationDocument({
      schemaVersion: 3,
      ui: createEmptyPuckData(),
      operations: [
        { id: "main", name: "Run", workflowId: "wf1", workflowVersion: 2 }
      ]
    });
    expect(parsed?.schemaVersion).toBe(4);
    const operation = parsed!.operations[0];
    expect(operationTarget(operation)).toEqual({
      kind: "workflow",
      workflowId: "wf1",
      workflowVersion: 2
    });
    expect(isScriptOperation(operation)).toBe(false);
    // Readable for one schema version.
    expect(operation.workflowId).toBe("wf1");
  });

  it("parses a script target and leaves no workflow id behind", () => {
    const parsed = parseApplicationDocument({
      schemaVersion: 4,
      ui: createEmptyPuckData(),
      operations: [
        {
          id: "glue",
          name: "Glue",
          workflowId: "",
          target: { kind: "script", scriptId: "s1", scriptVersion: 3 }
        }
      ]
    });
    const operation = parsed!.operations[0];
    expect(isScriptOperation(operation)).toBe(true);
    expect(operationTarget(operation)).toEqual({
      kind: "script",
      scriptId: "s1",
      scriptVersion: 3
    });
    expect(operation.workflowId).toBe("");
  });

  it("drops a script target with no pinned version", () => {
    const parsed = parseApplicationDocument({
      schemaVersion: 4,
      ui: createEmptyPuckData(),
      operations: [
        {
          id: "glue",
          name: "Glue",
          target: { kind: "script", scriptId: "s1" }
        }
      ]
    });
    expect(parsed?.operations).toEqual([]);
  });

  it("does not bind a script operation to the host workflow", () => {
    const parsed = parseApplicationDocument(
      {
        schemaVersion: 4,
        ui: createEmptyPuckData(),
        operations: [
          {
            id: "glue",
            name: "Glue",
            workflowId: "",
            target: { kind: "script", scriptId: "s1", scriptVersion: 1 }
          }
        ]
      },
      { hostWorkflowId: "host" }
    );
    expect(parsed!.operations[0].workflowId).toBe("");
  });

  it("rejects a document from a newer schema version", () => {
    expect(
      parseApplicationDocument({
        schemaVersion: APP_SCHEMA_VERSION + 1,
        ui: createEmptyPuckData(),
        operations: []
      })
    ).toBeNull();
  });
});

describe("bundling script operations", () => {
  it("rewrites script ids to keys on export and back on import", () => {
    const bundle = bundleFromApplication(
      {
        name: "Scripted",
        description: "",
        document: document(scriptOperation("glue", "script-row-1"))
      },
      [],
      [
        {
          scriptId: "script-row-1",
          name: "Shout",
          document: scriptDocument,
          version: 4
        }
      ]
    );
    expect(bundle.scripts).toHaveLength(1);
    expect(bundle.scripts[0].key).toBe("shout");
    expect(operationTarget(bundle.app.operations[0])).toEqual({
      kind: "script",
      scriptId: "shout",
      scriptVersion: 1
    });

    const applied = applyBundle(bundle, {
      newScriptId: () => "new-script-id"
    });
    expect(applied.scripts.map((script) => script.id)).toEqual([
      "new-script-id"
    ]);
    expect(operationTarget(applied.app.document.operations[0])).toEqual({
      kind: "script",
      scriptId: "new-script-id",
      scriptVersion: 1
    });
  });

  it("re-pins operations to the versions the importer created", () => {
    const pinned = pinScriptVersions(
      document(scriptOperation("glue", "new-script-id", 4)),
      new Map([["new-script-id", 7]])
    );
    expect(operationTarget(pinned.operations[0])).toEqual({
      kind: "script",
      scriptId: "new-script-id",
      scriptVersion: 7
    });
  });

  it("parses carried scripts and drops one with no ports", () => {
    const parsed = parseApplicationBundle({
      schemaVersion: 1,
      name: "Scripted",
      description: "",
      app: document(scriptOperation("glue", "shout")),
      workflows: [],
      scripts: [
        { key: "shout", name: "Shout", document: scriptDocument },
        { key: "broken", name: "Broken", document: { code: "" } }
      ]
    });
    expect(parsed?.scripts.map((script) => script.key)).toEqual(["shout"]);
  });

  it("carries no scripts when a bundle declares none", () => {
    const parsed = parseApplicationBundle({
      schemaVersion: 1,
      name: "Plain",
      description: "",
      app: document(),
      workflows: []
    });
    expect(parsed?.scripts).toEqual([]);
  });
});
