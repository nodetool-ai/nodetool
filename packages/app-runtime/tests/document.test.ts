import { describe, expect, it } from "vitest";

import {
  APP_SCHEMA_VERSION,
  DEFAULT_OPERATION_ID,
  createEmptyDocument,
  isRenderableUi,
  liftLegacyAppDoc,
  parseApplicationDocument
} from "../src/document.js";

const puck = { root: { props: { title: "Demo" } }, content: [{ type: "Text" }] };

describe("parseApplicationDocument", () => {
  it("parses a native v3 document", () => {
    const doc = parseApplicationDocument({
      schemaVersion: 3,
      ui: puck,
      operations: [
        {
          id: "main",
          name: "Run",
          workflowId: "wf1",
          inputs: {},
          outputs: {},
          policy: "queue"
        }
      ],
      variables: [
        { id: "v1", name: "dark", scope: "user", persist: true }
      ],
      resources: [
        { id: "r1", name: "Shots", kind: "storyboard", scope: {}, operations: ["read", "update"] }
      ]
    });
    expect(doc?.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(doc?.operations[0].policy).toBe("queue");
    expect(doc?.variables[0].persist).toBe(true);
    expect(doc?.resources[0].operations).toEqual(["read", "update"]);
  });

  it("lifts a legacy app_doc into one operation bound to the host workflow", () => {
    const doc = parseApplicationDocument(
      { version: 2, data: puck },
      { hostWorkflowId: "wf-legacy" }
    );
    expect(doc?.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(doc?.ui).toEqual(puck);
    expect(doc?.operations).toEqual([
      {
        id: DEFAULT_OPERATION_ID,
        name: "Run",
        workflowId: "wf-legacy",
        inputs: {},
        outputs: {},
        policy: "replace"
      }
    ]);
  });

  it("binds a workflow-less operation to the host workflow", () => {
    // What a shipped template carries: it has no workflow id until installed.
    const doc = parseApplicationDocument(
      {
        schemaVersion: 3,
        ui: puck,
        operations: [
          {
            id: DEFAULT_OPERATION_ID,
            name: "Run",
            workflowId: "",
            inputs: {},
            outputs: {},
            policy: "replace"
          }
        ]
      },
      { hostWorkflowId: "wf-installed" }
    );
    expect(doc?.operations[0].workflowId).toBe("wf-installed");
  });

  it("refuses a document written by a newer schema", () => {
    expect(
      parseApplicationDocument({ schemaVersion: 99, ui: puck })
    ).toBeNull();
  });

  it("refuses instance-scoped variables that claim persistence", () => {
    const doc = parseApplicationDocument({
      schemaVersion: 3,
      ui: puck,
      variables: [{ id: "v1", scope: "instance", persist: true }]
    });
    expect(doc?.variables[0].persist).toBe(false);
  });

  it("rejects non-documents", () => {
    expect(parseApplicationDocument(null)).toBeNull();
    expect(parseApplicationDocument({ data: { root: {} } })).toBeNull();
  });

  it("reports renderability", () => {
    expect(isRenderableUi(puck)).toBe(true);
    expect(isRenderableUi(createEmptyDocument().ui)).toBe(false);
  });
});

describe("liftLegacyAppDoc", () => {
  it("lifts a schemaVersion-3 document, keeping explicit workflow ids", () => {
    const doc = liftLegacyAppDoc({
      id: "wf-host",
      app_doc: {
        schemaVersion: 3,
        ui: puck,
        operations: [
          {
            id: "draft",
            name: "Draft",
            workflowId: "wf-other",
            inputs: {},
            outputs: {},
            policy: "queue"
          }
        ],
        variables: [{ id: "v1", name: "tone", scope: "user", persist: true }]
      }
    });
    expect(doc?.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(doc?.ui).toEqual(puck);
    expect(doc?.operations).toHaveLength(1);
    expect(doc?.operations[0].workflowId).toBe("wf-other");
    expect(doc?.operations[0].policy).toBe("queue");
    expect(doc?.variables[0].persist).toBe(true);
  });

  it("gives operations with an empty workflowId the host workflow id", () => {
    const doc = liftLegacyAppDoc({
      id: "wf-host",
      app_doc: {
        schemaVersion: 3,
        ui: puck,
        operations: [
          { id: "main", workflowId: "", inputs: {}, outputs: {}, policy: "replace" },
          { id: "second", workflowId: "wf-other", inputs: {}, outputs: {}, policy: "replace" }
        ]
      }
    });
    expect(doc?.operations.map((op) => op.workflowId)).toEqual([
      "wf-host",
      "wf-other"
    ]);
  });

  it("lifts a legacy { version, data } document into one host operation", () => {
    const doc = liftLegacyAppDoc({
      id: "wf-host",
      app_doc: { version: 2, data: puck }
    });
    expect(doc?.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(doc?.operations).toEqual([
      {
        id: DEFAULT_OPERATION_ID,
        name: "Run",
        workflowId: "wf-host",
        inputs: {},
        outputs: {},
        policy: "replace"
      }
    ]);
    expect(doc?.variables).toEqual([]);
    expect(doc?.resources).toEqual([]);
  });

  it("parses an app_doc stored as JSON text", () => {
    const doc = liftLegacyAppDoc({
      id: "wf-host",
      app_doc: JSON.stringify({ version: 1, data: puck })
    });
    expect(doc?.operations[0].workflowId).toBe("wf-host");
  });

  it("returns null for a missing, empty, unparsable, or invalid app_doc", () => {
    expect(liftLegacyAppDoc(null)).toBeNull();
    expect(liftLegacyAppDoc(undefined)).toBeNull();
    expect(liftLegacyAppDoc({ id: "wf-host" })).toBeNull();
    expect(liftLegacyAppDoc({ id: "wf-host", app_doc: null })).toBeNull();
    expect(liftLegacyAppDoc({ id: "wf-host", app_doc: "" })).toBeNull();
    expect(liftLegacyAppDoc({ id: "wf-host", app_doc: "{not json" })).toBeNull();
    expect(liftLegacyAppDoc({ id: "wf-host", app_doc: { nope: true } })).toBeNull();
    expect(
      liftLegacyAppDoc({ id: "wf-host", app_doc: { schemaVersion: 99, ui: puck } })
    ).toBeNull();
  });
});
