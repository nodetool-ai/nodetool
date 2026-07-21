/**
 * Tests for the Sketch / image-editor headless tool-loop surface
 * (`src/evals/surfaces/sketch.ts`):
 *   - `createSketchToolBridge`: headless execution of the real `ui_sketch_*`
 *     tool contract against an in-memory layer stack.
 *   - `SKETCH_TOOL_LOOP_CASES`: each case is solvable end-to-end via
 *     `runToolLoopEval` driven by a scripted provider (no network).
 */
import { describe, it, expect } from "vitest";
import {
  createSketchToolBridge,
  SKETCH_TOOL_LOOP_CASES,
  type SketchBridgeFinalState
} from "../src/evals/surfaces/sketch.js";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";

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

// --- createSketchToolBridge --------------------------------------------------

describe("createSketchToolBridge", () => {
  it("starts with a single 'Background' layer, active", async () => {
    const bridge = createSketchToolBridge();
    const state = bridge.finalState();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].name).toBe("Background");
    expect(state.activeLayerId).toBe(state.layers[0].id);
  });

  it("add_layer inserts directly above the active layer and becomes active", async () => {
    const bridge = createSketchToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const first = (await byName["ui_sketch_add_layer"].execute({
      name: "Sketch"
    })) as { ok: boolean; layer: { id: string } };
    let state = bridge.finalState();
    expect(state.layers.map((l) => l.name)).toEqual(["Background", "Sketch"]);
    expect(state.activeLayerId).toBe(first.layer.id);

    // Adding again with "Sketch" active inserts above it, not at the top blindly
    // — same effect here since it *is* the top, but exercises the active-based
    // insertion point rather than a hardcoded push.
    await byName["ui_sketch_add_layer"].execute({ name: "Details" });
    state = bridge.finalState();
    expect(state.layers.map((l) => l.name)).toEqual([
      "Background",
      "Sketch",
      "Details"
    ]);

    // Select Background, then add: new layer goes directly above Background,
    // not at the top of the stack.
    await byName["ui_sketch_select_layer"].execute({ target: "Background" });
    await byName["ui_sketch_add_layer"].execute({ name: "Between" });
    state = bridge.finalState();
    expect(state.layers.map((l) => l.name)).toEqual([
      "Background",
      "Between",
      "Sketch",
      "Details"
    ]);
    expect(state.activeLayerId).toBe(
      state.layers.find((l) => l.name === "Between")?.id
    );
  });

  it("generate creates a bound layer with generationStarted true by default", async () => {
    const bridge = createSketchToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const result = (await byName["ui_sketch_generate"].execute({
      kind: "text-to-image",
      prompt: "a red fox in snow",
      provider: "fal_ai",
      model: "fal-ai/flux/schnell"
    })) as {
      ok: boolean;
      layer: { id: string; hasBinding: boolean };
      generationStarted: boolean;
    };

    expect(result.generationStarted).toBe(true);
    expect(result.layer.hasBinding).toBe(true);

    const state = bridge.finalState();
    const layer = state.layers.find((l) => l.id === result.layer.id);
    expect(layer?.hasBinding).toBe(true);
    expect(layer?.prompt).toBe("a red fox in snow");
    expect(layer?.provider).toBe("fal_ai");
    expect(layer?.model).toBe("fal-ai/flux/schnell");
    expect(state.activeLayerId).toBe(result.layer.id);
  });

  it("generate with autoGenerate false does not start generation", async () => {
    const bridge = createSketchToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const result = (await byName["ui_sketch_generate"].execute({
      kind: "text-to-image",
      prompt: "a mountain",
      autoGenerate: false
    })) as { generationStarted: boolean; note?: string };
    expect(result.generationStarted).toBe(false);
    expect(result.note).toBeTruthy();
  });

  it("remove_layer on a missing target throws", async () => {
    const bridge = createSketchToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await expect(
      byName["ui_sketch_remove_layer"].execute({ target: "no-such-layer" })
    ).rejects.toThrow(/No layer found/);
  });

  it("set_layer_props patches only provided fields", async () => {
    const bridge = createSketchToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_sketch_set_layer_props"].execute({
      target: "active",
      opacity: 0.5,
      blendMode: "multiply"
    });
    const state = bridge.finalState();
    expect(state.layers[0].opacity).toBe(0.5);
    expect(state.layers[0].blendMode).toBe("multiply");
    expect(state.layers[0].visible).toBe(true);
  });

  it("resize_canvas and selection update document state", async () => {
    const bridge = createSketchToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_sketch_resize_canvas"].execute({
      width: 1024,
      height: 768
    });
    await byName["ui_sketch_selection"].execute({ op: "all" });
    const state = bridge.finalState();
    expect(state.width).toBe(1024);
    expect(state.height).toBe(768);
    expect(state.hasSelection).toBe(true);
  });
});

// --- SKETCH_TOOL_LOOP_CASES via runToolLoopEval -----------------------------

describe("SKETCH_TOOL_LOOP_CASES", () => {
  it("compose-layers: a valid scripted solution is accepted with a perfect score", async () => {
    const composeCase = SKETCH_TOOL_LOOP_CASES.find(
      (c) => c.id === "compose-layers"
    )!;
    const provider = createScriptedProvider([
      { name: "ui_sketch_get_state", args: {} },
      { name: "ui_sketch_add_layer", args: { name: "Ink" } },
      { name: "ui_sketch_add_layer", args: { name: "Shading" } },
      {
        name: "ui_sketch_set_layer_props",
        args: { target: "Shading", opacity: 0.5, blendMode: "multiply" }
      }
    ]);
    const report = await runToolLoopEval<SketchBridgeFinalState>({
      provider,
      model: "test-model",
      cases: [composeCase]
    });
    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("generate-layer: a valid scripted solution is accepted with a perfect score", async () => {
    const generateCase = SKETCH_TOOL_LOOP_CASES.find(
      (c) => c.id === "generate-layer"
    )!;
    const provider = createScriptedProvider([
      { name: "ui_sketch_get_state", args: {} },
      {
        name: "ui_sketch_generate",
        args: {
          kind: "text-to-image",
          prompt: "a glowing lantern at dusk",
          provider: "fal_ai",
          model: "fal-ai/flux/schnell"
        }
      },
      { name: "ui_sketch_set_color", args: { foreground: "#ff8800" } }
    ]);
    const report = await runToolLoopEval<SketchBridgeFinalState>({
      provider,
      model: "test-model",
      cases: [generateCase]
    });
    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("resize-and-select: a valid scripted solution is accepted with a perfect score", async () => {
    const resizeCase = SKETCH_TOOL_LOOP_CASES.find(
      (c) => c.id === "resize-and-select"
    )!;
    const provider = createScriptedProvider([
      { name: "ui_sketch_get_state", args: {} },
      {
        name: "ui_sketch_resize_canvas",
        args: { width: 1024, height: 768 }
      },
      { name: "ui_sketch_selection", args: { op: "all" } }
    ]);
    const report = await runToolLoopEval<SketchBridgeFinalState>({
      provider,
      model: "test-model",
      cases: [resizeCase]
    });
    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });
});
