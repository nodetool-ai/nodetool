/**
 * Tests for the app debug target loader (src/app-debug/app-target.ts): how an
 * application id, an ApplicationBundle file, and a legacy workflow target are
 * detected and what each resolves to.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveAppTarget } from "../src/app-debug/app-target.js";

const graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "hello" }
    },
    { id: "out1", type: "nodetool.output.StringOutput", data: { name: "result" } }
  ],
  edges: []
};

const document = (workflowId: string) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Demo App" } },
    content: [{ type: "Markdown", props: { id: "Markdown-1", binding: "result" } }],
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

const writeJson = (name: string, value: unknown): string => {
  const file = join(mkdtempSync(join(tmpdir(), "app-target-")), name);
  writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
};

const noWorkflows = vi.fn(async () => null);

describe("resolveAppTarget", () => {
  it("resolves an application id through the application loader", async () => {
    const loadFromDb = vi.fn(async () => ({ graph }));
    const resolved = await resolveAppTarget("app-1", {
      loadFromDb,
      loadApplication: async (id) => ({
        id,
        name: "Demo App",
        description: "",
        document: JSON.stringify(document("wf1"))
      })
    });

    expect(resolved.info.source).toBe("application");
    expect(resolved.info.workflowId).toBe("wf1");
    expect(resolved.appName).toBe("Demo App");
    expect(resolved.document?.operations[0].workflowId).toBe("wf1");
    // The host graph is the default operation's workflow, read once and cached
    // so the harness does not fetch it again.
    expect(resolved.graph.nodes).toHaveLength(2);
    expect(resolved.graphs.get("wf1")).toBe(resolved.graph);
    expect(loadFromDb).toHaveBeenCalledOnce();
  });

  it("accepts an application whose document is already an object", async () => {
    const resolved = await resolveAppTarget("app-1", {
      loadFromDb: async () => ({ graph }),
      loadApplication: async (id) => ({
        id,
        name: "Demo App",
        document: document("wf1")
      })
    });
    expect(resolved.document?.ui.content).toHaveLength(1);
    expect(resolved.issue).toBeNull();
  });

  it("reports an application with an unparsable document", async () => {
    const resolved = await resolveAppTarget("app-1", {
      loadFromDb: noWorkflows,
      loadApplication: async (id) => ({ id, name: "Broken", document: "{" })
    });
    expect(resolved.document).toBeNull();
    expect(resolved.issue).toMatch(/no valid document/);
  });

  it("leaves the host graph empty when the bound workflow is gone", async () => {
    const resolved = await resolveAppTarget("app-1", {
      loadFromDb: noWorkflows,
      loadApplication: async (id) => ({
        id,
        name: "Demo App",
        document: document("missing")
      })
    });
    expect(resolved.graph).toEqual({ nodes: [], edges: [] });
    expect(resolved.info.workflowId).toBeNull();
    expect(resolved.document?.operations[0].workflowId).toBe("missing");
  });

  it("falls back to the workflow table when no application has the id", async () => {
    const loadApplication = vi.fn(async () => null);
    const resolved = await resolveAppTarget("wf1", {
      loadFromDb: async () => ({ graph, app_doc: { version: 2, data: document("").ui } }),
      loadApplication
    });
    expect(loadApplication).toHaveBeenCalledWith("wf1");
    expect(resolved.info.source).toBe("id");
    expect(resolved.info.workflowId).toBe("wf1");
    // A legacy `{version,data}` doc is lifted onto the host workflow id.
    expect(resolved.document?.operations[0].workflowId).toBe("wf1");
  });

  it("throws naming both resources when an id matches neither", async () => {
    await expect(
      resolveAppTarget("nope", {
        loadFromDb: noWorkflows,
        loadApplication: async () => null
      })
    ).rejects.toThrow(/No application or workflow found: nope/);
  });

  it("resolves a bundle file, keying carried graphs by bundle key", async () => {
    const file = writeJson("my.app.json", {
      schemaVersion: 1,
      name: "Bundled App",
      description: "",
      app: document("demo"),
      workflows: [{ key: "demo", name: "Demo", graph }]
    });
    const loadFromDb = vi.fn(async () => null);
    const resolved = await resolveAppTarget(file, { loadFromDb });

    expect(resolved.info.source).toBe("bundle");
    // Operations reference bundle keys, so there is no workflow id to report.
    expect(resolved.info.workflowId).toBeNull();
    expect(resolved.appName).toBe("Bundled App");
    expect(resolved.graphs.get("demo")).toBe(resolved.graph);
    expect(resolved.graph.nodes[0].properties).toEqual({
      name: "prompt",
      value: "hello"
    });
    expect(loadFromDb).not.toHaveBeenCalled();
  });

  it("reports a bundle file whose app document is not parsable", async () => {
    const file = writeJson("bad.app.json", {
      schemaVersion: 1,
      name: "Broken",
      app: { nope: true },
      workflows: []
    });
    const resolved = await resolveAppTarget(file, { loadFromDb: noWorkflows });
    expect(resolved.document).toBeNull();
    expect(resolved.issue).toMatch(/not a valid application bundle/);
  });

  it("reads a workflow JSON file as the legacy app_doc path", async () => {
    const file = writeJson("workflow.json", {
      id: "wf1",
      graph,
      app_doc: { version: 2, data: document("").ui }
    });
    const resolved = await resolveAppTarget(file, { loadFromDb: noWorkflows });
    expect(resolved.info.source).toBe("json");
    expect(resolved.document?.operations[0].workflowId).toBe("wf1");
    expect(resolved.graphs.get("wf1")).toBe(resolved.graph);
  });

  it("explains a workflow file that carries no app document", async () => {
    const file = writeJson("workflow.json", { id: "wf1", graph });
    const resolved = await resolveAppTarget(file, { loadFromDb: noWorkflows });
    expect(resolved.document).toBeNull();
    expect(resolved.issue).toMatch(/no app_doc/);
  });
});
