/**
 * The `model3d` capability module — the headless twin of the `ui_3d_*` tools.
 *
 * Beyond the drift/category/spec-parity checks every namespace gets, what is
 * specific here is the loop the browser tools cannot run without an editor:
 * create a scene, read it back, edit it, and have the bytes on the asset be the
 * edited document.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  generationRegistry,
  ProcessingContext,
  type ProcessingContext as ProcessingContextType
} from "@nodetool-ai/runtime";
import { Asset, initTestDb } from "@nodetool-ai/models";
import { attachRunCostLedger } from "@nodetool-ai/execution";
import { withGenerationSeam } from "./_helpers/generation-seam.js";
import {
  __setBlenderRunnerForTesting,
  type BlenderJob,
  type BlenderRunner,
  type BlenderRunOptions,
  type BlenderRunResult
} from "@nodetool-ai/blender-nodes";
import {
  MODEL3D_CAPABILITIES,
  module as model3dModule
} from "../src/capabilities/model3d.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { module as generations } from "../src/capabilities/generations.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const USER = "user-model3d";

/**
 * A context backed by an in-memory object store, standing in for the server's
 * asset model interfaces: `createAsset` mints a row and keeps the bytes,
 * `updateAssetBytes` overwrites them, `resolveAssetBytes` reads them back.
 */
function makeContext(): {
  context: ProcessingContextType;
  bytesOf: (assetId: string) => Uint8Array | undefined;
} {
  const store = new Map<string, Uint8Array>();
  const context = withGenerationSeam({
    userId: USER,
    getSetting: async () => null,
    createAsset: async (args: {
      name: string;
      contentType: string;
      content: Uint8Array;
    }) => {
      const asset = (await Asset.create({
        user_id: USER,
        name: args.name,
        content_type: args.contentType
      })) as Asset;
      store.set(asset.id, args.content);
      return { id: asset.id };
    },
    updateAssetBytes: async (args: {
      assetId: string;
      content: Uint8Array;
    }) => {
      const asset = await Asset.find(USER, args.assetId);
      if (!asset) return null;
      store.set(args.assetId, args.content);
      return {
        id: asset.id,
        content_type: asset.content_type,
        name: asset.name,
        metadata: null
      };
    },
    resolveAssetBytes: async (uri: string) => {
      const id = uri.replace(/^asset:\/\//, "").replace(/\.(glb|gltf)$/i, "");
      return { bytes: store.get(id) ?? null, attempts: [] };
    }
  }) as unknown as ProcessingContextType;
  return { context, bytesOf: (assetId) => store.get(assetId) };
}

const runWith = (context: ProcessingContextType) =>
  createCapabilityRun({ context, gate: UNGATED });

function capability(
  mod: { exports: readonly CapabilityExport[] },
  name: string
): CapabilityExport {
  const found = mod.exports.find((entry) => entry.spec.name === name);
  if (!found) throw new Error(`no capability ${name}`);
  return found;
}

function makeTrackedContext(): {
  context: ProcessingContext;
  bytesOf: (assetId: string) => Uint8Array | undefined;
} {
  const store = new Map<string, Uint8Array>();
  const context = new ProcessingContext({ jobId: "render-job", userId: USER });
  context.setModelInterfaces({
    createAsset: async (args) => {
      const asset = (await Asset.create({
        user_id: USER,
        name: args.name,
        content_type: args.contentType
      })) as Asset;
      store.set(asset.id, args.content);
      return { id: asset.id, content_type: args.contentType };
    }
  });
  Object.assign(context, {
    resolveAssetBytes: async (uri: string) => {
      const id = uri.replace(/^asset:\/\//, "").replace(/\.(glb|gltf)$/i, "");
      return { bytes: store.get(id) ?? null, attempts: [] };
    }
  });
  attachRunCostLedger(context, { userId: USER, workflowId: null });
  return { context, bytesOf: (assetId) => store.get(assetId) };
}

interface SceneObject {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  materialColor?: string;
}

beforeEach(() => {
  initTestDb();
  generationRegistry.reset();
});

describe("model3d capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("model3d");
    expect(loaded).toBe(model3dModule);
    expect(capabilityModuleIssues("model3d", loaded)).toEqual([]);
  });

  it("carries the six wire names", () => {
    expect(MODEL3D_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_model3ds",
      "create_model3d",
      "get_model3d",
      "edit_model3d",
      "validate_model3d",
      "render_model3d"
    ]);
  });

  it("classifies every capability the way the gate does", () => {
    for (const entry of MODEL3D_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("renders as a Tool, spec for spec", () => {
    for (const entry of MODEL3D_CAPABILITIES) {
      const tool = toolForCapabilityName(entry.spec.name);
      expect(tool.description).toBe(entry.spec.description);
      expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
    }
  });
});

describe("model3d capabilities against the database", () => {
  it("builds, reads, edits and re-reads a scene with no editor open", async () => {
    const { context, bytesOf } = makeContext();
    const run = runWith(context);

    const created = (await run.invoke("create_model3d", {
      name: "studio",
      ops: [
        { op: "add_object", kind: "box", name: "Crate" },
        { op: "add_object", kind: "directionalLight" }
      ]
    })) as { model_id: string; name: string; url: string };
    expect(created.name).toBe("studio.gltf");
    expect(created.url).toBe(`asset://${created.model_id}.gltf`);

    const listed = (await run.invoke("list_model3ds", {})) as {
      models: Array<{ model_id: string; name: string }>;
    };
    expect(listed.models).toEqual([
      expect.objectContaining({ model_id: created.model_id, name: "studio.gltf" })
    ]);

    const scene = (await run.invoke("get_model3d", {
      model_id: created.model_id
    })) as { objects: SceneObject[]; bounds: { size: number[] } | null };
    expect(scene.objects.map((o) => [o.name, o.type])).toEqual([
      ["Crate", "Mesh"],
      ["Directional Light", "DirectionalLight"]
    ]);
    expect(scene.bounds?.size).toEqual([1, 1, 1]);

    const edited = (await run.invoke("edit_model3d", {
      model_id: created.model_id,
      ops: [
        { op: "set_transform", target: "Crate", position: [0, 2, 0] },
        { op: "set_material_color", target: "Crate", color: "#ff8800" },
        { op: "rename_object", target: "Crate", name: "Cargo" }
      ]
    })) as {
      objects: SceneObject[];
      validation: { ok: boolean; summary: string };
    };
    expect(edited.validation).toMatchObject({ ok: true });
    expect(edited.objects[0]).toMatchObject({
      name: "Cargo",
      position: [0, 2, 0],
      materialColor: "#ff8800"
    });

    // The edit is on the asset, not only in the reply: a fresh read sees it.
    const reread = (await run.invoke("get_model3d", {
      model_id: `asset://${created.model_id}.gltf`
    })) as { objects: SceneObject[] };
    expect(reread.objects[0].name).toBe("Cargo");
    expect(bytesOf(created.model_id)).toBeDefined();
  });

  it("accepts an asset id with the scheme and extension still on it", async () => {
    const { context } = makeContext();
    const run = runWith(context);
    const created = (await run.invoke("create_model3d", { name: "bare.glb" })) as {
      model_id: string;
      name: string;
    };
    expect(created.name).toBe("bare.glb");
    const scene = (await run.invoke("get_model3d", {
      model_id: `${created.model_id}.gltf`
    })) as { objects: unknown[] };
    expect(scene.objects).toEqual([]);
  });

  it("lists a .glb stored with a generic content type", async () => {
    const { context } = makeContext();
    const run = runWith(context);
    // What an upload usually looks like before `normalizeAssetContentType`
    // gets a say: the extension is the only thing that says "3D model".
    const uploaded = (await Asset.create({
      user_id: USER,
      name: "scan.glb",
      content_type: "application/octet-stream"
    })) as Asset;
    await Asset.create({
      user_id: USER,
      name: "notes.bin",
      content_type: "application/octet-stream"
    });

    const listed = (await run.invoke("list_model3ds", {})) as {
      models: Array<{ model_id: string; name: string }>;
    };
    expect(listed.models.map((m) => m.name)).toEqual(["scan.glb"]);
    expect(listed.models[0].model_id).toBe(uploaded.id);
  });

  it("reports a missing model, another user's model, and a non-model asset", async () => {
    const { context } = makeContext();
    const run = runWith(context);

    expect(
      await run.invoke("get_model3d", { model_id: "nope" })
    ).toMatchObject({ error: expect.stringMatching(/was not found/) });

    const theirs = (await Asset.create({
      user_id: "someone-else",
      name: "theirs.glb",
      content_type: "model/gltf-binary"
    })) as Asset;
    expect(
      await run.invoke("get_model3d", { model_id: theirs.id })
    ).toMatchObject({ error: expect.stringMatching(/was not found/) });

    const png = (await Asset.create({
      user_id: USER,
      name: "cover.png",
      content_type: "image/png"
    })) as Asset;
    expect(await run.invoke("get_model3d", { model_id: png.id })).toMatchObject({
      error: expect.stringMatching(/not a \.glb\/\.gltf model/)
    });
  });

  it("names the operation that failed and leaves the stored model alone", async () => {
    const { context, bytesOf } = makeContext();
    const run = runWith(context);
    const created = (await run.invoke("create_model3d", {
      name: "scene",
      ops: [{ op: "add_object", kind: "box" }]
    })) as { model_id: string };
    const before = bytesOf(created.model_id);

    expect(
      await run.invoke("edit_model3d", {
        model_id: created.model_id,
        ops: [
          { op: "rename_object", target: "Box", name: "Crate" },
          { op: "set_material_color", target: "Ghost", color: "#ffffff" }
        ]
      })
    ).toMatchObject({
      error: expect.stringMatching(
        /ops\[1\] \(set_material_color\) failed: No object found matching "Ghost"/
      )
    });
    expect(bytesOf(created.model_id)).toBe(before);

    expect(
      await run.invoke("edit_model3d", {
        model_id: created.model_id,
        ops: [{ op: "explode" }]
      })
    ).toMatchObject({ error: expect.stringMatching(/expected one of/) });

    // A well-named operation with missing arguments is the shape a model
    // actually produces; it must report, not fill in a default.
    expect(
      await run.invoke("edit_model3d", {
        model_id: created.model_id,
        ops: [{ op: "set_visibility", target: "Box" }]
      })
    ).toMatchObject({
      error: expect.stringMatching(/ops\[0\] \(set_visibility\).*true or false/)
    });
    expect(
      await run.invoke("edit_model3d", {
        model_id: created.model_id,
        ops: [{ op: "add_object" }]
      })
    ).toMatchObject({ error: expect.stringMatching(/add_object.kind/) });

    expect(
      await run.invoke("edit_model3d", { model_id: created.model_id, ops: [] })
    ).toMatchObject({ error: expect.stringMatching(/non-empty array/) });
  });

  it("validates an inline document as well as a stored one", async () => {
    const { context } = makeContext();
    const run = runWith(context);

    const inline = (await run.invoke("validate_model3d", {
      document: { asset: { version: "2.0" }, scene: 4, scenes: [{ nodes: [] }] }
    })) as { ok: boolean; errors: Array<{ message: string }>; summary: string };
    expect(inline.ok).toBe(false);
    expect(inline.errors[0].message).toMatch(/scene is 4/);
    expect(inline.summary).toMatch(/1 error/);

    const created = (await run.invoke("create_model3d", {
      name: "lit",
      ops: [
        { op: "add_object", kind: "sphere" },
        { op: "add_object", kind: "pointLight" }
      ]
    })) as { model_id: string };
    expect(
      await run.invoke("validate_model3d", { model_id: created.model_id })
    ).toMatchObject({ ok: true, summary: "No issues found." });

    expect(await run.invoke("validate_model3d", {})).toMatchObject({
      error: expect.stringMatching(/model_id.*document/)
    });
  });

  it("renders a model through Blender and stores the PNG", async () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3
    ]);
    const calls: Array<{
      job: BlenderJob;
      inputs: Record<string, Uint8Array>;
      options: BlenderRunOptions;
    }> = [];
    const fake: BlenderRunner = {
      kind: "local",
      run: async (
        job: BlenderJob,
        inputs: Record<string, Uint8Array>,
        options: BlenderRunOptions
      ): Promise<BlenderRunResult> => {
        calls.push({ job, inputs, options });
        return {
          outputs: { image: PNG },
          stats: {
            blender_version: "5.2.1-test",
            render_seconds: 1.25,
            objects: 1,
            camera: "NodeTool_Orbit"
          }
        };
      }
    };
    __setBlenderRunnerForTesting(fake);
    try {
      const { context, bytesOf } = makeContext();
      const run = runWith(context);
      const created = (await run.invoke("create_model3d", {
        name: "render-me",
        ops: [{ op: "add_object", kind: "box" }]
      })) as { model_id: string };

      const rendered = (await run.invoke("render_model3d", {
        model_id: created.model_id,
        camera_mode: "orbit",
        width: 64,
        height: 64,
        engine: "eevee"
      })) as {
        image_id: string;
        url: string;
        stats: Record<string, unknown>;
        generation_id: string;
      };

      expect(typeof rendered.image_id).toBe("string");
      expect(rendered.url).toBe(`asset://${rendered.image_id}.png`);
      expect(rendered.generation_id).toEqual(expect.any(String));
      expect(rendered.stats).toMatchObject({
        blender_version: "5.2.1-test",
        render_seconds: 1.25
      });
      expect(bytesOf(rendered.image_id)).toEqual(PNG);

      // The capability builds the render_image job from its params and
      // hands the stored model bytes to the runner.
      expect(calls).toHaveLength(1);
      expect(calls[0].job.job.op).toBe("render_image");
      expect(calls[0].job.job).toMatchObject({
        params: expect.objectContaining({
          camera_mode: "orbit",
          width: 64,
          height: 64,
          engine: "eevee"
        })
      });
      expect(calls[0].inputs["model"]!.length).toBeGreaterThan(0);
      expect(calls[0].options.timeoutMs).toBe(600_000);
    } finally {
      __setBlenderRunnerForTesting(null);
    }
  });

  it("returns a background receipt that await_generation collects", async () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1
    ]);
    let complete: (() => void) | null = null;
    __setBlenderRunnerForTesting({
      kind: "local",
      run: async () =>
        new Promise<BlenderRunResult>((resolve) => {
          complete = () =>
            resolve({
              outputs: { image: PNG },
              stats: {
                blender_version: "5.2.1-test",
                render_seconds: 1,
                objects: 1,
                camera: "NodeTool_Orbit"
              }
            });
        })
    });
    try {
      const { context, bytesOf } = makeTrackedContext();
      const run = runWith(context);
      const created = (await run.invoke("create_model3d", {
        name: "background-render"
      })) as { model_id: string };

      const started = (await run.invoke("render_model3d", {
        model_id: created.model_id,
        background: true
      })) as {
        generation_id: string;
        status: string;
        background: boolean;
      };
      expect(started).toMatchObject({ status: "running", background: true });
      expect(generationRegistry.isRunning(started.generation_id)).toBe(true);

      await vi.waitFor(() => expect(complete).not.toBeNull());
      complete?.();
      const awaited = (await capability(generations, "await_generation").impl(
        run,
        { generation_id: started.generation_id, timeout_seconds: 5 }
      )) as { status: string; asset_ids: string[] };
      expect(awaited.status).toBe("completed");
      expect(awaited.asset_ids).toHaveLength(1);
      expect(bytesOf(awaited.asset_ids[0]!)).toEqual(PNG);
    } finally {
      __setBlenderRunnerForTesting(null);
    }
  });

  it("shares the background-generation limit with media capabilities", async () => {
    __setBlenderRunnerForTesting({
      kind: "local",
      run: async (_job, _inputs, options) =>
        new Promise<BlenderRunResult>((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(options.signal.reason)
          );
        })
    });
    try {
      const { context } = makeTrackedContext();
      const run = runWith(context);
      const created = (await run.invoke("create_model3d", {
        name: "limited-render"
      })) as { model_id: string };
      for (let i = 0; i < 16; i++) {
        await run.invoke("render_model3d", {
          model_id: created.model_id,
          background: true
        });
      }

      expect(
        await run.invoke("render_model3d", {
          model_id: created.model_id,
          background: true
        })
      ).toMatchObject({ error: expect.stringMatching(/16 background generations/) });

      for (const id of generationRegistry.runningFor(USER)) {
        generationRegistry.cancel(id, USER);
      }
    } finally {
      __setBlenderRunnerForTesting(null);
    }
  });

  it("reports a missing model before touching Blender", async () => {
    const run = vi.fn(async () => {
      throw new Error("Blender must not run without a model.");
    });
    __setBlenderRunnerForTesting({
      kind: "local",
      run
    } as unknown as BlenderRunner);
    try {
      const { context } = makeContext();
      expect(
        await runWith(context).invoke("render_model3d", { model_id: "nope" })
      ).toMatchObject({ error: expect.stringMatching(/was not found/) });
      expect(run).not.toHaveBeenCalled();
    } finally {
      __setBlenderRunnerForTesting(null);
    }
  });

  it("names the server, not the caller, when Blender is missing", async () => {
    // No availability gate exists at the capability layer, so this stays
    // visible where Blender can never exist (e.g. the cloud server). The
    // failure must then name the cause: "this server has no Blender", not
    // a bare "blender was not found".
    const { HostBinaryMissingError } = await import("@nodetool-ai/runtime");
    __setBlenderRunnerForTesting({
      kind: "local",
      run: async () => {
        throw new HostBinaryMissingError("blender");
      }
    } as unknown as BlenderRunner);
    try {
      const { context } = makeContext();
      const run = runWith(context);
      const created = (await run.invoke("create_model3d", {
        name: "no-blender-here"
      })) as { model_id: string };
      expect(
        await run.invoke("render_model3d", { model_id: created.model_id })
      ).toMatchObject({ error: expect.stringMatching(/this server has no Blender/) });
    } finally {
      __setBlenderRunnerForTesting(null);
    }
  });

  it("reports a save that cannot land instead of claiming success", async () => {
    const { context } = makeContext();
    const run = runWith(context);
    const created = (await run.invoke("create_model3d", { name: "scene" })) as {
      model_id: string;
    };
    vi.spyOn(context, "updateAssetBytes").mockResolvedValue(null);

    expect(
      await run.invoke("edit_model3d", {
        model_id: created.model_id,
        ops: [{ op: "add_object", kind: "box" }]
      })
    ).toMatchObject({ error: expect.stringMatching(/not found when saving/) });
  });
});
