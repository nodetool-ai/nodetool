/**
 * Tests for the 3D model editor headless tool-loop surface
 * (`src/evals/surfaces/model3d.ts`):
 *   - `createModel3DToolBridge`: headless execution of the `ui_3d_*` tool
 *     contract against an in-memory scene graph.
 *   - `MODEL3D_TOOL_LOOP_CASES`: each case is solvable end-to-end via
 *     `runToolLoopEval` driven by a scripted provider — no network.
 */
import { describe, it, expect } from "vitest";
import type { BaseProvider, ProviderStreamItem, ProviderTool } from "@nodetool-ai/runtime";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createModel3DToolBridge,
  MODEL3D_TOOL_LOOP_CASES
} from "../src/evals/surfaces/model3d.js";

// --- scripted provider -------------------------------------------------------

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider that replays one scripted list of tool calls through the tool
 * `execute` closures (mirroring how a real provider's `generateLoop` dispatches
 * self-executing tools), then ends the turn.
 */
function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

// --- createModel3DToolBridge --------------------------------------------------

describe("createModel3DToolBridge", () => {
  it("exposes exactly the 9 non-capture ui_3d_* tools", () => {
    const bridge = createModel3DToolBridge();
    const names = bridge.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "ui_3d_add_object",
        "ui_3d_delete_object",
        "ui_3d_frame_scene",
        "ui_3d_list_scene",
        "ui_3d_rename_object",
        "ui_3d_select_object",
        "ui_3d_set_material_color",
        "ui_3d_set_transform",
        "ui_3d_set_visibility"
      ].sort()
    );
    expect(names).not.toContain("ui_3d_capture_view");
  });

  it("adds two primitives and lists them", async () => {
    const bridge = createModel3DToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_3d_add_object"].execute({ kind: "box" });
    await byName["ui_3d_add_object"].execute({ kind: "sphere" });

    const listed = (await byName["ui_3d_list_scene"].execute({})) as {
      ok: boolean;
      count: number;
      objects: { name: string; type: string }[];
    };
    expect(listed.ok).toBe(true);
    expect(listed.count).toBe(2);
    expect(listed.objects.map((o) => o.name)).toEqual(["Box", "Sphere"]);
    expect(listed.objects.map((o) => o.type)).toEqual(["Mesh", "Mesh"]);

    const final = bridge.finalState();
    expect(final.objects).toHaveLength(2);
    expect(final.selectedUuid).toBe(final.objects[1].uuid);
  });

  it("throws when setting material color on a light", async () => {
    const bridge = createModel3DToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_3d_add_object"].execute({
      kind: "directionalLight",
      name: "Sun"
    });

    await expect(
      byName["ui_3d_set_material_color"].execute({
        target: "Sun",
        color: "#ff0000"
      })
    ).rejects.toThrow(/not a mesh/);
  });

  it("deletes an object and clears the selection when it was selected", async () => {
    const bridge = createModel3DToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const target = (await byName["ui_3d_add_object"].execute({
      kind: "box",
      name: "Target"
    })) as { object: { uuid: string } };
    await byName["ui_3d_add_object"].execute({ kind: "sphere", name: "Other" });

    const before = bridge.finalState();
    expect(before.objects).toHaveLength(2);
    // "Other" was added last, so it's selected, not "Target".
    expect(before.selectedUuid).not.toBe(target.object.uuid);

    const result = (await byName["ui_3d_delete_object"].execute({
      target: target.object.uuid
    })) as { ok: boolean; deleted: { name: string } };
    expect(result.ok).toBe(true);
    expect(result.deleted.name).toBe("Target");

    const after = bridge.finalState();
    expect(after.objects).toHaveLength(1);
    expect(after.objects[0].name).toBe("Other");
    // Selection is untouched since the deleted object wasn't selected.
    expect(after.selectedUuid).toBe(before.selectedUuid);
  });

  it("clears the selection when the selected object is deleted", async () => {
    const bridge = createModel3DToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const added = (await byName["ui_3d_add_object"].execute({
      kind: "box",
      name: "Selected"
    })) as { object: { uuid: string } };

    expect(bridge.finalState().selectedUuid).toBe(added.object.uuid);

    await byName["ui_3d_delete_object"].execute({ target: "Selected" });
    expect(bridge.finalState().selectedUuid).toBeNull();
  });

  it("resolves targets case-insensitively by name and rejects unknown targets", async () => {
    const bridge = createModel3DToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_3d_add_object"].execute({ kind: "box", name: "MyBox" });

    const result = (await byName["ui_3d_set_visibility"].execute({
      target: "myBOX",
      visible: false
    })) as { ok: boolean; object: { visible: boolean } };
    expect(result.ok).toBe(true);
    expect(result.object.visible).toBe(false);

    await expect(
      byName["ui_3d_select_object"].execute({ target: "does-not-exist" })
    ).rejects.toThrow(/No object found/);
  });
});

// --- MODEL3D_TOOL_LOOP_CASES via runToolLoopEval -----------------------------

describe("MODEL3D_TOOL_LOOP_CASES", () => {
  it("build-scene: adding a box, sphere, light, and moving the sphere passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_3d_list_scene", args: {} },
      { name: "ui_3d_add_object", args: { kind: "box" } },
      { name: "ui_3d_add_object", args: { kind: "sphere" } },
      { name: "ui_3d_add_object", args: { kind: "directionalLight" } },
      {
        name: "ui_3d_set_transform",
        args: { target: "Sphere", position: [0, 3, 0] }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [MODEL3D_TOOL_LOOP_CASES[0]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("recolor-and-arrange: rename, recolor, and scale the seeded box passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_3d_list_scene", args: {} },
      { name: "ui_3d_rename_object", args: { target: "Box", name: "Hero" } },
      {
        name: "ui_3d_set_material_color",
        args: { target: "Hero", color: "#ff8800" }
      },
      {
        name: "ui_3d_set_transform",
        args: { target: "Hero", scale: [2, 2, 2] }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [MODEL3D_TOOL_LOOP_CASES[1]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("hide-and-delete: hiding the box and deleting the sphere passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_3d_list_scene", args: {} },
      {
        name: "ui_3d_set_visibility",
        args: { target: "Box", visible: false }
      },
      { name: "ui_3d_delete_object", args: { target: "Sphere" } }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [MODEL3D_TOOL_LOOP_CASES[2]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });
});
