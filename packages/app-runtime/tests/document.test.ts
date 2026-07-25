import { describe, expect, it } from "vitest";

import {
  APP_SCHEMA_VERSION,
  DEFAULT_OPERATION_ID,
  createEmptyDocument,
  isRenderableUi,
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
