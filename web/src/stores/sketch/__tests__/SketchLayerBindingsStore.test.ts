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

  it("markStaleForWorkflow only invalidates bindings for that workflow", () => {
    useSketchLayerBindingsStore
      .getState()
      .setBindings([
        makeBinding({ layerId: "a" }),
        makeBinding({ layerId: "b", workflowId: "wf-2" })
      ]);
    // Mark each binding as already generated so workflow drift flips them to
    // "stale" rather than the (uninteresting) "draft" of a never-generated
    // binding.
    for (const layerId of ["a", "b"] as const) {
      const seeded = useSketchLayerBindingsStore.getState().bindings[layerId];
      useSketchLayerBindingsStore.getState().recordGeneratedVersion(layerId, {
        version: {
          id: `v-${layerId}`,
          createdAt: "",
          jobId: "j",
          assetId: layerId,
          workflowUpdatedAt: "",
          dependencyHash: seeded.dependencyHash!,
          paramOverridesSnapshot: seeded.paramOverrides!,
          status: "success"
        },
        dependencyHash: seeded.dependencyHash!,
        assetId: layerId
      });
    }
    useSketchLayerBindingsStore.getState().markStaleForWorkflow("wf-1");
    const state = useSketchLayerBindingsStore.getState();
    expect(state.bindings["a"].status).toBe("stale");
    expect(state.bindings["b"].status).toBe("generated");
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

  it("setInputAssetHashes persists hashes across later recomputes", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    useSketchLayerBindingsStore
      .getState()
      .setInputAssetHashes("layer-1", ["asset-hash-a"]);
    const afterAssets = useSketchLayerBindingsStore.getState().bindings[
      "layer-1"
    ].dependencyHash;

    // A subsequent param override must produce a different hash than the
    // baseline-without-assets, proving the asset hashes were folded in
    // again instead of being silently dropped.
    useSketchLayerBindingsStore
      .getState()
      .setParamOverride("layer-1", "prompt", "world");
    const afterOverride = useSketchLayerBindingsStore.getState().bindings[
      "layer-1"
    ].dependencyHash;
    expect(afterOverride).not.toBe(afterAssets);

    const baselineWithoutAssets = (() => {
      useSketchLayerBindingsStore.getState().setBindings([
        makeBinding({ paramOverrides: { prompt: "world" } })
      ]);
      return useSketchLayerBindingsStore.getState().bindings["layer-1"]
        .dependencyHash;
    })();
    expect(afterOverride).not.toBe(baselineWithoutAssets);
  });

  it("markStaleForWorkflow stays sticky across later recomputes", () => {
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
    expect(
      useSketchLayerBindingsStore.getState().bindings["layer-1"].status
    ).toBe("generated");

    // Workflow drift bumps the per-layer drift token; the recomputed hash
    // diverges from `lastGeneratedHash` so the binding flips to stale.
    useSketchLayerBindingsStore.getState().markStaleForWorkflow("wf-1");
    expect(
      useSketchLayerBindingsStore.getState().bindings["layer-1"].status
    ).toBe("stale");

    // Reverting overrides to the originally-generated value must NOT flip
    // the binding back to "generated" while the workflow drift is still in
    // effect — the drift token keeps the dependency hash diverged.
    useSketchLayerBindingsStore
      .getState()
      .setParamOverride("layer-1", "prompt", seeded.paramOverrides!.prompt);
    expect(
      useSketchLayerBindingsStore.getState().bindings["layer-1"].status
    ).toBe("stale");
  });

  it("removeBinding deletes the entry", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    useSketchLayerBindingsStore.getState().removeBinding("layer-1");
    expect(useSketchLayerBindingsStore.getState().bindings["layer-1"]).toBeUndefined();
  });

  it("restoreVersion swaps overrides and lastGeneratedHash to the version snapshot", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const seeded = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    useSketchLayerBindingsStore.getState().recordGeneratedVersion("layer-1", {
      version: {
        id: "v1",
        createdAt: "",
        jobId: "j",
        assetId: "a-1",
        workflowUpdatedAt: "",
        dependencyHash: seeded.dependencyHash!,
        paramOverridesSnapshot: { prompt: "hello" },
        status: "success"
      },
      dependencyHash: seeded.dependencyHash!,
      assetId: "a-1"
    });

    useSketchLayerBindingsStore
      .getState()
      .setParamOverride("layer-1", "prompt", "world");
    expect(
      useSketchLayerBindingsStore.getState().bindings["layer-1"].status
    ).toBe("stale");

    // Append a synthetic earlier version to restore
    const binding = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    binding.versions.push({
      id: "v0",
      createdAt: "",
      jobId: "j0",
      assetId: "a-0",
      workflowUpdatedAt: "",
      dependencyHash: seeded.dependencyHash!,
      paramOverridesSnapshot: { prompt: "hello" },
      status: "success"
    });
    useSketchLayerBindingsStore.getState().restoreVersion("layer-1", "v0");
    const restored = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    expect(restored.currentAssetId).toBe("a-0");
    expect(restored.paramOverrides).toEqual({ prompt: "hello" });
    expect(restored.status).toBe("generated");
  });

  it("setLocked flips status to locked and revert returns to draft", () => {
    useSketchLayerBindingsStore.getState().setBindings([makeBinding()]);
    const seeded = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    useSketchLayerBindingsStore.getState().recordGeneratedVersion("layer-1", {
      version: {
        id: "v1",
        createdAt: "",
        jobId: "j",
        assetId: "a-1",
        workflowUpdatedAt: "",
        dependencyHash: seeded.dependencyHash!,
        paramOverridesSnapshot: seeded.paramOverrides!,
        status: "success"
      },
      dependencyHash: seeded.dependencyHash!,
      assetId: "a-1"
    });

    useSketchLayerBindingsStore.getState().setLocked("layer-1", true);
    expect(
      useSketchLayerBindingsStore.getState().bindings["layer-1"].status
    ).toBe("locked");

    useSketchLayerBindingsStore.getState().setLocked("layer-1", false);
    expect(
      useSketchLayerBindingsStore.getState().bindings["layer-1"].status
    ).toBe("generated");

    useSketchLayerBindingsStore.getState().revert("layer-1");
    const after = useSketchLayerBindingsStore.getState().bindings["layer-1"];
    expect(after.currentAssetId).toBeUndefined();
    expect(after.lastGeneratedHash).toBeUndefined();
    expect(after.status).toBe("draft");
  });

  it("setBindingsOutputNode applies to every binding sharing the workflow", () => {
    useSketchLayerBindingsStore
      .getState()
      .setBindings([
        makeBinding({ layerId: "a" }),
        makeBinding({ layerId: "b" }),
        makeBinding({ layerId: "c", workflowId: "wf-other" })
      ]);

    useSketchLayerBindingsStore
      .getState()
      .setBindingsOutputNode("wf-1", "out-2");

    const state = useSketchLayerBindingsStore.getState();
    expect(state.bindings["a"].selectedOutputNodeId).toBe("out-2");
    expect(state.bindings["b"].selectedOutputNodeId).toBe("out-2");
    expect(state.bindings["c"].selectedOutputNodeId).toBe("out-1");
  });
});
