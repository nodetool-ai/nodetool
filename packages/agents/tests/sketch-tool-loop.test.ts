/**
 * Tests for the Sketch / image-editor headless tool-loop surface
 * (`src/evals/surfaces/sketch.ts`):
 *   - `createSketchToolBridge`: headless execution of the real `ui_sketch_*`
 *     tool contract against a layer stack of real skia bitmaps, painted by the
 *     editor's own brush/pencil/eraser engine.
 *   - `SKETCH_TOOL_LOOP_CASES`: each case is solvable end-to-end via
 *     `runToolLoopEval` driven by a scripted provider (no network).
 */
import { describe, it, expect } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createSketchToolBridge,
  getLastSketchToolBridge,
  SKETCH_TOOL_LOOP_CASES,
  type SketchBridgeFinalState,
  type SketchToolBridge
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

// --- real pixels: ui_sketch_stroke / ui_sketch_get_layer_image --------------

type ToolMap = Record<
  string,
  { execute: (args: Record<string, unknown>) => Promise<unknown> }
>;

const toolsOf = (bridge: SketchToolBridge): ToolMap =>
  Object.fromEntries(bridge.tools.map((t) => [t.name, t])) as ToolMap;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Decode the bridge's composite PNG and read one pixel out of it. */
async function compositePixel(
  bridge: SketchToolBridge,
  x: number,
  y: number
): Promise<Rgba> {
  const image = await loadImage(bridge.compositePng());
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return { r, g, b, a };
}

interface StrokeToolResult {
  ok: boolean;
  strokes: {
    layerId: string;
    layerName: string;
    tool: string;
    points: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
  }[];
}

describe("createSketchToolBridge — painting", () => {
  it("a brush stroke paints real pixels on the layer", async () => {
    const bridge = createSketchToolBridge({ width: 128, height: 128 });
    const t = toolsOf(bridge);
    expect(bridge.finalState().paintedPixels).toBe(0);

    const result = (await t["ui_sketch_stroke"].execute({
      strokes: [
        {
          points: [
            { x: 20, y: 64 },
            { x: 108, y: 64 }
          ],
          color: "#ff0000",
          size: 12
        }
      ]
    })) as StrokeToolResult;

    const state = bridge.finalState();
    expect(state.paintedPixels).toBeGreaterThan(500);
    expect(state.layers[0].paintedPixels).toBe(state.paintedPixels);
    expect(state.layers[0].strokeCount).toBe(1);
    expect(state.strokedFraction).toBeGreaterThan(0.03);

    // The reported bounds are the engine's dirty rect, clamped to the canvas.
    const bounds = result.strokes[0].bounds!;
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThanOrEqual(88);
    expect(bounds.y).toBeGreaterThan(40);
    expect(bounds.y + bounds.height).toBeLessThan(90);

    // ...and the pixels are the colour that was asked for.
    const onStroke = await compositePixel(bridge, 64, 64);
    expect(onStroke.a).toBe(255);
    expect(onStroke.r).toBeGreaterThan(200);
    expect(onStroke.g).toBeLessThan(60);
    const offStroke = await compositePixel(bridge, 64, 10);
    expect(offStroke.a).toBe(0);
  });

  it("a single point lays down one dab rather than nothing", async () => {
    const bridge = createSketchToolBridge({ width: 64, height: 64 });
    const t = toolsOf(bridge);
    await t["ui_sketch_stroke"].execute({
      strokes: [{ points: [{ x: 32, y: 32 }], color: "#00ff00", size: 16 }]
    });
    const state = bridge.finalState();
    expect(state.paintedPixels).toBeGreaterThan(100);
    expect((await compositePixel(bridge, 32, 32)).g).toBeGreaterThan(200);
  });

  it("`closed` joins the last point back to the first", async () => {
    const square = [
      { x: 20, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 100 },
      { x: 20, y: 100 }
    ];
    const paint = async (closed: boolean): Promise<number> => {
      const bridge = createSketchToolBridge({ width: 128, height: 128 });
      await toolsOf(bridge)["ui_sketch_stroke"].execute({
        strokes: [{ points: square, closed, color: "#ffffff", size: 4 }]
      });
      return bridge.finalState().paintedPixels;
    };
    const open = await paint(false);
    const closed = await paint(true);
    // Three edges versus four.
    expect(closed).toBeGreaterThan(open * 1.2);
  });

  it("the eraser removes pixels the brush laid down", async () => {
    const bridge = createSketchToolBridge({ width: 128, height: 128 });
    const t = toolsOf(bridge);
    await t["ui_sketch_stroke"].execute({
      strokes: [
        {
          points: [
            { x: 8, y: 64 },
            { x: 120, y: 64 }
          ],
          color: "#ffffff",
          size: 20
        }
      ]
    });
    const painted = bridge.finalState().paintedPixels;
    expect((await compositePixel(bridge, 64, 64)).a).toBe(255);

    await t["ui_sketch_stroke"].execute({
      strokes: [
        {
          tool: "eraser",
          points: [
            { x: 50, y: 64 },
            { x: 80, y: 64 }
          ],
          size: 40
        }
      ]
    });

    const afterErase = bridge.finalState().paintedPixels;
    expect(afterErase).toBeLessThan(painted);
    expect(afterErase).toBeGreaterThan(0);
    expect((await compositePixel(bridge, 64, 64)).a).toBe(0);
    // The far end of the line is untouched.
    expect((await compositePixel(bridge, 12, 64)).a).toBe(255);
  });

  it("refuses to paint on a locked layer, leaving it unpainted", async () => {
    const bridge = createSketchToolBridge({ width: 64, height: 64 });
    const t = toolsOf(bridge);
    await t["ui_sketch_set_layer_props"].execute({
      target: "Background",
      locked: true
    });
    await expect(
      t["ui_sketch_stroke"].execute({
        strokes: [{ points: [{ x: 32, y: 32 }], size: 20 }]
      })
    ).rejects.toThrow(/locked/i);
    expect(bridge.finalState().paintedPixels).toBe(0);
  });

  it("refuses to paint on a non-raster layer", async () => {
    const bridge = createSketchToolBridge({ width: 64, height: 64 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({ name: "Alpha", type: "mask" });
    await expect(
      t["ui_sketch_stroke"].execute({
        strokes: [{ target: "Alpha", points: [{ x: 32, y: 32 }], size: 20 }]
      })
    ).rejects.toThrow(/raster/i);
  });

  it("a bad target rejects the whole batch before anything is painted", async () => {
    const bridge = createSketchToolBridge({ width: 64, height: 64 });
    const t = toolsOf(bridge);
    await expect(
      t["ui_sketch_stroke"].execute({
        strokes: [
          { points: [{ x: 32, y: 32 }], size: 20 },
          { target: "no-such-layer", points: [{ x: 10, y: 10 }], size: 20 }
        ]
      })
    ).rejects.toThrow(/No layer found/);
    expect(bridge.finalState().paintedPixels).toBe(0);
  });

  it("fillColor fills real pixels", async () => {
    const bridge = createSketchToolBridge({ width: 32, height: 32 });
    await toolsOf(bridge)["ui_sketch_add_layer"].execute({
      name: "Backdrop",
      fillColor: "#0000ff"
    });
    const state = bridge.finalState();
    expect(state.paintedFraction).toBe(1);
    // A fill is not a stroke — this is what keeps the drawing check honest.
    expect(state.strokedFraction).toBe(0);
    expect(await compositePixel(bridge, 16, 16)).toEqual({
      r: 0,
      g: 0,
      b: 255,
      a: 255
    });
  });
});

describe("createSketchToolBridge — raster tools", () => {
  it("flood-fills a connected white region", async () => {
    const bridge = createSketchToolBridge({ width: 32, height: 32 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({
      name: "Paint",
      fillColor: "#ffffff"
    });
    await t["ui_sketch_fill"].execute({
      target: "Paint",
      x: 2,
      y: 2,
      color: "#ff0000",
      tolerance: 0
    });
    expect(await compositePixel(bridge, 8, 8)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 255
    });
  });

  it("draws a filled rectangle", async () => {
    const bridge = createSketchToolBridge({ width: 32, height: 32 });
    const t = toolsOf(bridge);
    await t["ui_sketch_draw_shape"].execute({
      shape: "rect",
      x: 4,
      y: 4,
      width: 12,
      height: 12,
      fill: "#00ff00"
    });
    expect(await compositePixel(bridge, 8, 8)).toMatchObject({
      r: 0,
      g: 255,
      b: 0
    });
    expect((await compositePixel(bridge, 30, 30)).a).toBe(0);
  });

  it("paints a linear gradient and samples the start color", async () => {
    const bridge = createSketchToolBridge({ width: 32, height: 8 });
    const t = toolsOf(bridge);
    await t["ui_sketch_gradient"].execute({
      type: "linear",
      start: { x: 0, y: 4 },
      end: { x: 31, y: 4 },
      stops: [
        { offset: 0, color: "#0000ff" },
        { offset: 1, color: "#ff0000" }
      ]
    });
    const picked = (await t["ui_sketch_pick_color"].execute({
      x: 0,
      y: 4
    })) as { color: string; rgba: { b: number } };
    expect(picked.rgba.b).toBeGreaterThan(200);
  });

  it("sets a rect selection and inverts it", async () => {
    const bridge = createSketchToolBridge({ width: 16, height: 16 });
    const t = toolsOf(bridge);
    await t["ui_sketch_set_selection_shape"].execute({
      shape: "rect",
      bounds: { x: 0, y: 0, width: 8, height: 8 }
    });
    expect(bridge.finalState().hasSelection).toBe(true);
    await t["ui_sketch_selection"].execute({ op: "clear" });
    expect(bridge.finalState().hasSelection).toBe(false);
  });

  it("flips a painted layer and crops the canvas", async () => {
    const bridge = createSketchToolBridge({ width: 16, height: 16 });
    const t = toolsOf(bridge);
    await t["ui_sketch_draw_shape"].execute({
      shape: "rect",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      fill: "#ffffff"
    });
    await t["ui_sketch_transform"].execute({ flipH: true });
    const right = await compositePixel(bridge, 14, 1);
    expect(right.a).toBeGreaterThan(0);
    await t["ui_sketch_crop"].execute({ x: 8, y: 0, width: 8, height: 8 });
    expect(bridge.finalState().width).toBe(8);
    expect(bridge.finalState().height).toBe(8);
  });

  it("raises brightness of a dark layer", async () => {
    const bridge = createSketchToolBridge({ width: 8, height: 8 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({
      name: "Tone",
      fillColor: "#404040"
    });
    const before = await compositePixel(bridge, 2, 2);
    await t["ui_sketch_adjust_layer"].execute({
      target: "Tone",
      brightness: 0.4
    });
    const after = await compositePixel(bridge, 2, 2);
    expect(after.r).toBeGreaterThan(before.r);
  });
});

describe("createSketchToolBridge — compositing", () => {
  it("honors layer opacity", async () => {
    const bridge = createSketchToolBridge({ width: 16, height: 16 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({
      name: "Under",
      fillColor: "#000000"
    });
    await t["ui_sketch_add_layer"].execute({
      name: "Over",
      fillColor: "#ffffff"
    });
    expect((await compositePixel(bridge, 8, 8)).r).toBe(255);

    await t["ui_sketch_set_layer_props"].execute({
      target: "Over",
      opacity: 0.5
    });
    const half = await compositePixel(bridge, 8, 8);
    expect(half.a).toBe(255);
    expect(half.r).toBeGreaterThan(120);
    expect(half.r).toBeLessThan(136);
  });

  it("maps 'add' onto Canvas 'lighter' and 'multiply' onto itself", async () => {
    const bridge = createSketchToolBridge({ width: 16, height: 16 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({
      name: "Red",
      fillColor: "#ff0000"
    });
    await t["ui_sketch_add_layer"].execute({
      name: "Blue",
      fillColor: "#0000ff"
    });

    await t["ui_sketch_set_layer_props"].execute({
      target: "Blue",
      blendMode: "add"
    });
    // Additive: red + blue = magenta. Plain source-over would give pure blue.
    expect(await compositePixel(bridge, 8, 8)).toEqual({
      r: 255,
      g: 0,
      b: 255,
      a: 255
    });

    await t["ui_sketch_set_layer_props"].execute({
      target: "Blue",
      blendMode: "multiply"
    });
    const multiplied = await compositePixel(bridge, 8, 8);
    expect(multiplied.r).toBe(0);
    expect(multiplied.b).toBe(0);
  });

  it("a hidden layer contributes nothing to the composite", async () => {
    const bridge = createSketchToolBridge({ width: 16, height: 16 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({
      name: "Wash",
      fillColor: "#ff0000"
    });
    expect(bridge.finalState().paintedFraction).toBe(1);
    await t["ui_sketch_set_layer_props"].execute({
      target: "Wash",
      visible: false
    });
    expect(bridge.finalState().paintedFraction).toBe(0);
  });

  it("duplicate_layer copies the bitmap instead of sharing it", async () => {
    const bridge = createSketchToolBridge({ width: 64, height: 64 });
    const t = toolsOf(bridge);
    await t["ui_sketch_stroke"].execute({
      strokes: [{ points: [{ x: 20, y: 20 }], color: "#ffffff", size: 10 }]
    });
    const original = bridge.finalState().layers[0].paintedPixels;
    await t["ui_sketch_duplicate_layer"].execute({ target: "Background" });
    await t["ui_sketch_stroke"].execute({
      strokes: [{ points: [{ x: 45, y: 45 }], color: "#ffffff", size: 10 }]
    });
    const state = bridge.finalState();
    expect(state.layers[0].paintedPixels).toBe(original);
    expect(state.layers[1].paintedPixels).toBeGreaterThan(original);
  });
});

describe("ui_sketch_get_layer_image", () => {
  it("returns a PNG data URL for the composite and for a single layer", async () => {
    const bridge = createSketchToolBridge({ width: 64, height: 64 });
    const t = toolsOf(bridge);
    await t["ui_sketch_add_layer"].execute({ name: "Ink" });
    await t["ui_sketch_stroke"].execute({
      strokes: [
        {
          target: "Ink",
          points: [
            { x: 8, y: 32 },
            { x: 56, y: 32 }
          ],
          color: "#ffffff",
          size: 8
        }
      ]
    });

    interface ImageResult {
      ok: boolean;
      layerId: string | null;
      layerName: string | null;
      width: number;
      height: number;
      note: string;
      image_content: { uri: string; mimeType: string };
    }

    const composite = (await t["ui_sketch_get_layer_image"].execute(
      {}
    )) as ImageResult;
    expect(composite.layerId).toBeNull();
    expect(composite.layerName).toBeNull();
    expect(composite.width).toBe(64);
    expect(composite.height).toBe(64);
    expect(composite.note).toMatch(/composite/i);
    expect(composite.image_content.mimeType).toBe("image/png");
    expect(
      composite.image_content.uri.startsWith("data:image/png;base64,")
    ).toBe(true);

    const single = (await t["ui_sketch_get_layer_image"].execute({
      target: "Ink"
    })) as ImageResult;
    expect(single.layerName).toBe("Ink");
    expect(single.note).toContain("Ink");

    // The empty Background reads back as a fully transparent bitmap, not an error.
    const empty = (await t["ui_sketch_get_layer_image"].execute({
      target: "Background"
    })) as ImageResult;
    expect(empty.image_content.uri.length).toBeGreaterThan(64);
  });

  it("a missing target is an error, not a blank image", async () => {
    const bridge = createSketchToolBridge();
    await expect(
      toolsOf(bridge)["ui_sketch_get_layer_image"].execute({ target: "nope" })
    ).rejects.toThrow(/No layer found/);
  });
});

describe("getLastSketchToolBridge", () => {
  it("hands a harness the composite PNG of the run it just drove", async () => {
    const bridge = createSketchToolBridge({ width: 32, height: 32 });
    await toolsOf(bridge)["ui_sketch_stroke"].execute({
      strokes: [{ points: [{ x: 16, y: 16 }], color: "#ffffff", size: 12 }]
    });
    const last = getLastSketchToolBridge();
    expect(last).toBe(bridge);
    const png = last!.compositePng();
    // PNG magic — real encoded bytes, not a stub.
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(last!.compositeDataUrl().startsWith("data:image/png;base64,")).toBe(
      true
    );
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

  it("draw-an-animal: a valid scripted solution is accepted with a perfect score", async () => {
    const drawCase = SKETCH_TOOL_LOOP_CASES.find(
      (c) => c.id === "draw-an-animal"
    )!;

    const arc = (cx: number, cy: number, r: number, n: number) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      });

    const provider = createScriptedProvider([
      { name: "ui_sketch_get_state", args: {} },
      { name: "ui_sketch_add_layer", args: { name: "Body" } },
      {
        name: "ui_sketch_stroke",
        args: {
          strokes: [
            {
              target: "Body",
              points: arc(256, 320, 110, 32),
              closed: true,
              color: "#ffb703",
              size: 9
            }
          ]
        }
      },
      { name: "ui_sketch_add_layer", args: { name: "Head" } },
      {
        name: "ui_sketch_stroke",
        args: {
          strokes: [
            {
              target: "Head",
              points: arc(256, 180, 70, 24),
              closed: true,
              color: "#ffb703",
              size: 9
            },
            {
              target: "Head",
              points: [
                { x: 200, y: 128 },
                { x: 190, y: 80 },
                { x: 240, y: 110 }
              ],
              closed: true,
              color: "#ffb703",
              size: 7
            }
          ]
        }
      },
      { name: "ui_sketch_add_layer", args: { name: "Face" } },
      {
        name: "ui_sketch_stroke",
        args: {
          strokes: [
            {
              target: "Face",
              points: arc(232, 175, 9, 16),
              closed: true,
              color: "#0b1d26",
              size: 6
            },
            {
              target: "Face",
              points: arc(280, 175, 9, 16),
              closed: true,
              color: "#0b1d26",
              size: 6
            },
            {
              target: "Face",
              tool: "pencil",
              points: [
                { x: 214, y: 205 },
                { x: 160, y: 196 }
              ],
              color: "#ffffff",
              size: 3
            }
          ]
        }
      },
      { name: "ui_sketch_get_layer_image", args: {} }
    ]);

    const report = await runToolLoopEval<SketchBridgeFinalState>({
      provider,
      model: "test-model",
      cases: [drawCase]
    });
    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);

    // The run left a real drawing behind, reachable for a human to look at.
    const drawn = getLastSketchToolBridge()!;
    expect(drawn.finalState().strokedFraction).toBeGreaterThan(0.01);
    expect([...drawn.compositePng().subarray(0, 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47
    ]);
  });
});
