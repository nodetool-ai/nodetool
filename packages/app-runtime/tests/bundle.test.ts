import { describe, expect, it } from "vitest";

import {
  APPLICATION_BUNDLE_SCHEMA_VERSION,
  applyBundle,
  bundleFromApplication,
  parseApplicationBundle,
  serializeApplicationBundle,
  type BundleApplicationSource,
  type BundleGraph,
  type BundleWorkflowSource
} from "../src/bundle.js";
import {
  APP_SCHEMA_VERSION,
  createEmptyPuckData,
  type ApplicationDocument,
  type OperationBinding
} from "../src/document.js";

const graphFor = (nodeId: string): BundleGraph => ({
  nodes: [{ id: nodeId, type: "nodetool.input.StringInput" }],
  edges: []
});

const operation = (
  id: string,
  workflowId: string
): OperationBinding => ({
  id,
  name: id,
  workflowId,
  inputs: { in1: { from: "widget" } },
  outputs: { out1: { to: "display" } },
  policy: "replace"
});

const document = (...operations: OperationBinding[]): ApplicationDocument => ({
  schemaVersion: APP_SCHEMA_VERSION,
  ui: createEmptyPuckData("Draft & refine"),
  operations,
  resources: [],
  variables: []
});

const app: BundleApplicationSource = {
  name: "Draft & refine",
  description: "Two workflows, one app",
  document: document(operation("draft", "wf-1"), operation("refine", "wf-2"))
};

const sources: BundleWorkflowSource[] = [
  {
    workflowId: "wf-1",
    name: "Draft copy",
    graph: graphFor("n1"),
    version: 3,
    graphHash: "hash-1"
  },
  { workflowId: "wf-2", name: "Refine copy", graph: graphFor("n2") }
];

describe("bundleFromApplication", () => {
  it("replaces workflow ids with bundle-local keys", () => {
    const bundle = bundleFromApplication(app, sources);

    expect(bundle.schemaVersion).toBe(APPLICATION_BUNDLE_SCHEMA_VERSION);
    expect(bundle.workflows.map((w) => w.key)).toEqual([
      "draft-copy",
      "refine-copy"
    ]);
    expect(bundle.app.operations.map((op) => op.workflowId)).toEqual([
      "draft-copy",
      "refine-copy"
    ]);
    // The source document is untouched.
    expect(app.document.operations[0].workflowId).toBe("wf-1");
  });

  it("pins what the release pinned, nulling what a draft does not", () => {
    const [drafted, refined] = bundleFromApplication(app, sources).workflows;

    expect(drafted).toMatchObject({ version: 3, graphHash: "hash-1" });
    expect(refined).toMatchObject({ version: null, graphHash: null });
  });

  it("gives colliding names distinct keys and carries a workflow once", () => {
    const twin = { ...sources[1], workflowId: "wf-3", name: "Draft copy" };
    const bundle = bundleFromApplication(app, [
      ...sources,
      sources[0],
      twin
    ]);

    expect(bundle.workflows.map((w) => w.key)).toEqual([
      "draft-copy",
      "refine-copy",
      "draft-copy-2"
    ]);
  });

  it("leaves an operation bound to an uncarried workflow alone", () => {
    const bundle = bundleFromApplication(app, [sources[0]]);

    expect(bundle.app.operations.map((op) => op.workflowId)).toEqual([
      "draft-copy",
      "wf-2"
    ]);
  });
});

describe("applyBundle", () => {
  it("round-trips: operations point at the newly created workflow ids", () => {
    const bundle = bundleFromApplication(app, sources);
    const wire = parseApplicationBundle(
      JSON.parse(serializeApplicationBundle(bundle))
    );
    expect(wire).not.toBeNull();

    let next = 0;
    const result = applyBundle(wire as NonNullable<typeof wire>, {
      newWorkflowId: () => `new-${++next}`
    });

    expect(result.app.name).toBe("Draft & refine");
    expect(result.app.description).toBe("Two workflows, one app");
    expect(result.workflows.map((w) => w.id)).toEqual(["new-1", "new-2"]);
    expect(result.workflows.map((w) => w.name)).toEqual([
      "Draft copy",
      "Refine copy"
    ]);
    expect(result.workflows[0].graph).toEqual(graphFor("n1"));
    expect(result.app.document.operations.map((op) => op.workflowId)).toEqual([
      "new-1",
      "new-2"
    ]);
    // Everything but the rewritten ids survives the trip.
    expect(result.app.document.operations[0].inputs).toEqual({
      in1: { from: "widget" }
    });
    expect(result.app.document.ui).toEqual(app.document.ui);
  });

  it("keeps an operation whose key is not carried", () => {
    const bundle = bundleFromApplication(app, [sources[0]]);
    const result = applyBundle(bundle, { newWorkflowId: () => "new-1" });

    expect(result.app.document.operations.map((op) => op.workflowId)).toEqual([
      "new-1",
      "wf-2"
    ]);
  });
});

describe("parseApplicationBundle", () => {
  it("rejects non-bundles and future schema versions", () => {
    expect(parseApplicationBundle(null)).toBeNull();
    expect(parseApplicationBundle({ app: {} })).toBeNull();
    expect(
      parseApplicationBundle({
        schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION + 1,
        app: document(),
        workflows: []
      })
    ).toBeNull();
  });

  it("drops workflow entries without a key or a graph", () => {
    const bundle = parseApplicationBundle({
      schemaVersion: 1,
      name: "App",
      app: document(),
      workflows: [
        { key: "ok", name: "Ok", graph: graphFor("n1") },
        { key: "", name: "No key", graph: graphFor("n2") },
        { key: "no-graph", name: "No graph" }
      ]
    });

    expect(bundle?.workflows.map((w) => w.key)).toEqual(["ok"]);
  });

  it("defaults name, description, and pins", () => {
    const bundle = parseApplicationBundle({
      app: document(),
      workflows: [{ key: "ok", graph: graphFor("n1") }]
    });

    expect(bundle).toMatchObject({
      schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
      name: "Untitled app",
      description: ""
    });
    expect(bundle?.workflows[0]).toMatchObject({
      name: "ok",
      version: null,
      graphHash: null
    });
  });

  it("parses a legacy { version, data } document", () => {
    const bundle = parseApplicationBundle({
      name: "Legacy",
      app: { version: 2, data: createEmptyPuckData("Legacy") },
      workflows: []
    });

    expect(bundle?.app.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(bundle?.app.operations).toEqual([]);
  });
});
