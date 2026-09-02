/**
 * Tests for the application-target resolvers (src/app-debug/application-target.ts):
 * an application row and an inline draft both become the same simulator target,
 * and a document that does not parse says which one it was.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applicationTarget,
  inlineDocumentTarget
} from "../src/app-debug/application-target.js";

const graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "hello" }
    },
    {
      id: "out1",
      type: "nodetool.output.StringOutput",
      data: { name: "result" }
    }
  ],
  edges: []
};

const document = (workflowId: string) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Demo App" } },
    content: [
      { type: "Markdown", props: { id: "Markdown-1", binding: "result" } }
    ],
    zones: {}
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ],
  resources: [],
  variables: []
});

describe("applicationTarget", () => {
  it("resolves a row's document and loads its first operation's graph", async () => {
    const loadFromDb = vi.fn(async () => ({ graph }));
    const resolved = await applicationTarget(
      "app-1",
      { id: "app-1", name: "Demo App", document: document("wf1") },
      loadFromDb
    );

    expect(loadFromDb).toHaveBeenCalledWith("wf1");
    expect(resolved.info).toMatchObject({
      ref: "app-1",
      source: "application",
      workflowId: "wf1",
      nodeCount: 2
    });
    expect(resolved.appName).toBe("Demo App");
    expect(resolved.document?.operations[0]?.workflowId).toBe("wf1");
    expect(resolved.operationsReferenceKeys).toBe(false);
    // ReactFlow `data` became runner-shape `properties`.
    expect(resolved.graph.nodes[0]?.properties).toEqual({
      name: "prompt",
      value: "hello"
    });
  });

  it("accepts a document stored as a JSON string", async () => {
    const resolved = await applicationTarget(
      "app-1",
      {
        id: "app-1",
        name: "Demo App",
        document: JSON.stringify(document("wf1"))
      },
      async () => ({ graph })
    );
    expect(resolved.issue).toBeNull();
    // Parsing normalizes the document (schemaVersion migrates, optional keys
    // fill in), so assert the parts the string itself carried.
    expect(resolved.document?.ui.root.props.title).toBe("Demo App");
    expect(resolved.document?.ui.content).toEqual([
      { type: "Markdown", props: { id: "Markdown-1", binding: "result" } }
    ]);
    expect(
      resolved.document?.operations.map((o) => [o.id, o.name, o.workflowId])
    ).toEqual([["main", "Run", "wf1"]]);
  });

  it("reports a row whose document does not parse", async () => {
    const resolved = await applicationTarget(
      "app-1",
      { id: "app-1", name: "Broken", document: "not json" },
      async () => null
    );
    expect(resolved.document).toBeNull();
    expect(resolved.issue).toContain('Application "app-1"');
    expect(resolved.graph).toEqual({ nodes: [], edges: [] });
  });

  it("leaves the host graph empty when no operation's workflow loads", async () => {
    const resolved = await applicationTarget(
      "app-1",
      { id: "app-1", name: "Demo App", document: document("missing") },
      async () => null
    );
    expect(resolved.document).not.toBeNull();
    expect(resolved.info.workflowId).toBeNull();
    expect(resolved.graph.nodes).toEqual([]);
  });
});

describe("inlineDocumentTarget", () => {
  it("resolves a posted draft the same way a row resolves", async () => {
    const resolved = await inlineDocumentTarget(document("wf1"), async () => ({
      graph
    }));
    expect(resolved.info).toMatchObject({
      ref: "inline-document",
      source: "application",
      workflowId: "wf1"
    });
    expect(resolved.document?.operations[0]?.id).toBe("main");
    expect(resolved.graph.nodes).toHaveLength(2);
  });

  it("says the posted document is the one that did not parse", async () => {
    const resolved = await inlineDocumentTarget({ nope: true }, async () => null);
    expect(resolved.document).toBeNull();
    expect(resolved.issue).toContain("document posted");
  });
});
