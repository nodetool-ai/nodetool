import { beforeEach, describe, expect, it } from "@jest/globals";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import { useSketchLayerBindingsStore } from "../SketchLayerBindingsStore";

const makeBinding = (
  overrides: Partial<LayerWorkflowBinding> = {}
): LayerWorkflowBinding => ({
  layerId: "layer-1",
  workflowId: "wf-1",
  selectedOutputNodeId: "out-1",
  paramOverrides: { prompt: "hello" },
  status: "draft",
  versions: [],
  ...overrides
});

describe("SketchLayerBindingsStore", () => {
  beforeEach(() => {
    useSketchLayerBindingsStore.getState().reset();
  });

  it("seeds dependencyHash and status when bindings load", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const stored = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    expect(stored.dependencyHash).toMatch(/^[0-9a-f]{16}$/);
    expect(stored.status).toBe("draft");
  });

  it("marks the layer stale once a generated hash exists and overrides change", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const seeded = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    // Pretend generation completed at the seed hash so subsequent edits flip
    // the status to "stale" rather than staying "draft".
    useSketchLayerBindingsStore.getState().recordGeneratedVersion("layer-1", {
      version: {
        id: "v1",
        createdAt: new Date().toISOString(),
        jobId: "job-1",
        assetId: "asset-1",
        workflowUpdatedAt: "",
        dependencyHash: seeded.dependencyHash!,
        paramOverridesSnapshot: seeded.paramOverrides!,
        status: "success"
      },
      dependencyHash: seeded.dependencyHash!,
      assetId: "asset-1"
    });

    expect(useSketchLayerBindingsStore.getState().bindings["layer-1"].status).toBe(
      "generated"
    );

    useSketchLayerBindingsStore
      .getState()
      .setParamOverride("layer-1", "prompt", "world");

    const after = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    expect(after.status).toBe("stale");
    expect(after.dependencyHash).not.toBe(after.lastGeneratedHash);
  });

  it("returns to generated when overrides are reverted to the generated value", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const seeded = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    useSketchLayerBindingsStore.getState().recordGeneratedVersion("layer-1", {
      version: {
        id: "v1",
        createdAt: "",
        jobId: "job-1",
        assetId: "asset-1",
        workflowUpdatedAt: "",
        dependencyHash: seeded.dependencyHash!,
        paramOverridesSnapshot: seeded.paramOverrides!,
        status: "success"
      },
      dependencyHash: seeded.dependencyHash!,
      assetId: "asset-1"
    });

    useSketchLayerBindingsStore
      .getState()
      .setParamOverride("layer-1", "prompt", "world");
    expect(useSketchLayerBindingsStore.getState().bindings["layer-1"].status).toBe(
      "stale"
    );

    useSketchLayerBindingsStore
      .getState()
      .setParamOverride("layer-1", "prompt", "hello");
    expect(useSketchLayerBindingsStore.getState().bindings["layer-1"].status).toBe(
      "generated"
    );
  });

  it("setSelectedOutputNodeId invalidates a previously generated layer", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const seeded = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    useSketchLayerBindingsStore.getState().recordGeneratedVersion("layer-1", {
      version: {
        id: "v1",
        createdAt: "",
        jobId: "j",
        assetId: "a",
        workflowUpdatedAt: "",
        dependencyHash: seeded.dependencyHash!,
        paramOverridesSnapshot: seeded.paramOverrides!,
        status: "success"
      },
      dependencyHash: seeded.dependencyHash!,
      assetId: "a"
    });
    useSketchLayerBindingsStore
      .getState()
      .setSelectedOutputNodeId("layer-1", "out-2");
    const stored = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    expect(stored.selectedOutputNodeId).toBe("out-2");
    expect(stored.status).toBe("stale");
  });

  it("markStaleForWorkflow marks every binding for that workflow", () => {
    useSketchLayerBindingsStore
      .getState()
      .setBindings([
        makeBinding({ layerId: "a" }),
        makeBinding({ layerId: "b", workflowId: "wf-2" })
      ]);
    useSketchLayerBindingsStore.getState().markStaleForWorkflow("wf-1");
    const state = useSketchLayerBindingsStore.getState();
    expect(state.bindings["a"].status).toBe("stale");
    expect(state.bindings["b"].status).toBe("draft");
  });

  it("applyInputDrift seeds added inputs and drops removed ones", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    useSketchLayerBindingsStore.getState().applyInputDrift(
      "wf-1",
      [{ name: "steps", defaultValue: 25 }],
      ["prompt"]
    );
    const stored = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    expect(stored.paramOverrides).toEqual({ steps: 25 });
  });

  it("setInputAssetHashes recomputes the dependency hash", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const before = useSketchLayerBindingsStore.getState().bindings["layer-1"]
      .dependencyHash;
    useSketchLayerBindingsStore
      .getState()
      .setInputAssetHashes("layer-1", ["asset-hash-a"]);
    const after = useSketchLayerBindingsStore.getState().bindings["layer-1"]
      .dependencyHash;
    expect(after).not.toBe(before);
  });

  it("removeBinding deletes the entry", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    useSketchLayerBindingsStore.getState().removeBinding("layer-1");
    expect(useSketchLayerBindingsStore.getState().bindings["layer-1"]).toBeUndefined();
  });
});
