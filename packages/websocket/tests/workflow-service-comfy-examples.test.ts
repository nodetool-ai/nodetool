import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), loadExampleGraph: vi.fn() }));
vi.mock("@nodetool-ai/models", () => ({
  Project: {}, WorkflowCollaborator: {}, Workflow: { create: mocks.create }
}));
vi.mock("../src/configured-providers.js", () => ({ loadConfiguredProviders: async () => ({}) }));
vi.mock("../src/lib/example-apps.js", () => ({ localizeLanguageModels: (graph: unknown) => graph }));
vi.mock("../src/triggers/registration-sync.js", () => ({ syncRegistrations: async () => undefined }));
vi.mock("../src/example-workflows.js", () => ({
  loadExampleGraph: mocks.loadExampleGraph,
  defaultExamplePackageName: () => "nodetool-base"
}));

import { createWorkflow } from "../src/lib/workflow-service.js";

afterEach(() => vi.resetAllMocks());

const graph = {
  nodes: [{ id: "save", type: "comfy.SaveImage", data: { filename_prefix: "example" } }],
  edges: []
};
const seed = { exampleName: "Comfy Example", apiOptions: {} };

describe("copying Comfy workflow examples", () => {
  it("persists the example's Comfy mode when the copy request omits it", async () => {
    mocks.loadExampleGraph.mockReturnValue({ run_mode: "comfy", graph });
    mocks.create.mockImplementation(async (row) => ({ id: "copy", ...row }));
    const copy = await createWorkflow("user", { name: "My copy" }, seed);
    expect(copy.run_mode).toBe("comfy");
    expect(copy.graph).toEqual(graph);
  });

  it("preserves an explicit run mode from the copy request", async () => {
    mocks.loadExampleGraph.mockReturnValue({ run_mode: "comfy", graph });
    mocks.create.mockImplementation(async (row) => ({ id: "copy", ...row }));
    const copy = await createWorkflow("user", { name: "My copy", run_mode: "workflow" }, seed);
    expect(copy.run_mode).toBe("workflow");
  });
});
