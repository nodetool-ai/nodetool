/**
 * Tests for the sketch debug harness (src/sketch-debug/): the `--interact`
 * script parser and the orchestrator, with the validator core and the headless
 * bridge injected — neither the execution core nor `@nodetool-ai/agents` is
 * loaded here.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeToolName,
  parseInteractionScript
} from "../src/sketch-debug/interactions.js";
import {
  runSketchDebug,
  runSketchValidate,
  type SketchDebugCore
} from "../src/sketch-debug/harness.js";

const layer = {
  id: "layer-1",
  name: "Background",
  type: "raster",
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: "normal",
  data: null
};

const document = {
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
    layers: [layer],
    activeLayerId: "layer-1",
    maskLayerId: null
  },
  layerBindings: []
};

const sketchFile = (): string => {
  const file = join(mkdtempSync(join(tmpdir(), "sketch-harness-")), "sketch.json");
  writeFileSync(
    file,
    JSON.stringify({
      id: "img-1",
      name: "Poster",
      width: 2048,
      height: 768,
      backgroundColor: "#000000",
      document
    }),
    "utf8"
  );
  return file;
};

const outDir = (): string => join(mkdtempSync(join(tmpdir(), "sketch-out-")), "bundle");

const cleanValidation = { ok: true, errors: [], warnings: [] };

/** A core that records what it was handed and answers with a fixed report. */
function fakeCore(): SketchDebugCore & {
  calls: { validate: unknown[]; build: unknown[] };
} {
  const calls = { validate: [] as unknown[], build: [] as unknown[] };
  return {
    calls,
    validateSketchDocument: (raw, meta) => {
      calls.validate.push({ raw, meta });
      return cleanValidation;
    },
    buildSketchDebugReport: (input) => {
      calls.build.push(input);
      return {
        target: input.target,
        meta: {
          width: 1024,
          height: 768,
          backgroundColor: "#ffffff",
          layerCount: 1,
          bindingCount: 0
        },
        validation: cleanValidation,
        interactions: input.interactions ?? [],
        ...(input.finalState ? { finalState: input.finalState } : {}),
        notSimulated: ["pixels"],
        verdict: { ok: true, headline: "sketch ok", issues: [] }
      };
    },
    renderSketchReportMarkdown: (report) => `# ${report.verdict.headline}\n`
  };
}

/** A bridge whose one tool succeeds and whose other always throws. */
function fakeBridge() {
  const layers = [
    {
      id: "layer_1",
      name: "Background",
      type: "raster" as const,
      visible: true,
      opacity: 1,
      blendMode: "normal"
    }
  ];
  return {
    tools: [
      {
        name: "ui_sketch_add_layer",
        execute: async (args: Record<string, unknown>) => {
          layers.push({
            id: `layer_${layers.length + 1}`,
            name: String(args.name ?? "Layer"),
            type: "raster" as const,
            visible: true,
            opacity: 1,
            blendMode: "normal"
          });
          return { ok: true };
        }
      },
      {
        name: "ui_sketch_remove_layer",
        execute: async () => {
          throw new Error('No layer found matching "nope".');
        }
      }
    ],
    finalState: () => ({
      width: 1024,
      height: 768,
      backgroundColor: "#ffffff",
      activeLayerId: layers[layers.length - 1]?.id ?? null,
      layers
    })
  };
}

describe("parseInteractionScript", () => {
  it("normalizes bare and prefixed tool names alike", () => {
    const steps = parseInteractionScript(
      JSON.stringify([
        { tool: "add_layer", input: { name: "Glow" } },
        { tool: "ui_sketch_set_color", input: { foreground: "#ff0000" } },
        { tool: "ui_select_layer" }
      ])
    );
    expect(steps.map((s) => s.tool)).toEqual([
      "ui_sketch_add_layer",
      "ui_sketch_set_color",
      "ui_sketch_select_layer"
    ]);
    expect(steps[2].input).toEqual({});
  });

  it("rejects invalid JSON with the parser's own message", () => {
    expect(() => parseInteractionScript("[{")).toThrow(/--interact is not valid JSON/);
  });

  it("rejects a non-array script", () => {
    expect(() => parseInteractionScript('{"tool":"add_layer"}')).toThrow(
      /must be a JSON array/
    );
  });

  it("names the step that has no tool", () => {
    expect(() =>
      parseInteractionScript(JSON.stringify([{ tool: "add_layer" }, { input: {} }]))
    ).toThrow(/step 2 has no `tool` name/);
  });

  it("rejects a non-object input", () => {
    expect(() =>
      parseInteractionScript(JSON.stringify([{ tool: "add_layer", input: 5 }]))
    ).toThrow(/step 1: `input` must be an object/);
  });

  it("leaves an already-canonical name alone", () => {
    expect(normalizeToolName("ui_sketch_add_layer")).toBe("ui_sketch_add_layer");
  });
});

describe("runSketchValidate", () => {
  it("validates the raw document with the row's canvas settings", async () => {
    const core = fakeCore();
    const { target, validation } = await runSketchValidate(sketchFile(), {
      loadDocument: async () => null,
      core
    });

    expect(target.kind).toBe("file");
    expect(validation).toEqual(cleanValidation);
    expect(core.calls.validate).toHaveLength(1);
    expect((core.calls.validate[0] as { meta: unknown }).meta).toEqual({
      width: 2048,
      height: 768,
      backgroundColor: "#000000"
    });
  });
});

describe("runSketchDebug", () => {
  it("seeds the bridge from the document and records each step", async () => {
    const createBridge = vi.fn(() => fakeBridge());
    const { report } = await runSketchDebug(
      sketchFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([{ tool: "add_layer", input: { name: "Glow" } }])
        ),
        outDir: outDir()
      },
      { loadDocument: async () => null, core: fakeCore(), createBridge }
    );

    expect(createBridge).toHaveBeenCalledWith({
      name: "Poster",
      width: 1024,
      height: 768,
      layers: [{ name: "Background", type: "raster" }]
    });
    expect(report.interactions).toEqual([
      {
        tool: "ui_sketch_add_layer",
        input: { name: "Glow" },
        ok: true,
        result: { ok: true }
      }
    ]);
  });

  it("records a failing step and keeps going", async () => {
    const { report } = await runSketchDebug(
      sketchFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([
            { tool: "remove_layer", input: { target: "nope" } },
            { tool: "not_a_tool" },
            { tool: "add_layer", input: { name: "Glow" } }
          ])
        ),
        outDir: outDir()
      },
      {
        loadDocument: async () => null,
        core: fakeCore(),
        createBridge: () => fakeBridge()
      }
    );

    expect(report.interactions.map((i) => i.ok)).toEqual([false, false, true]);
    expect(report.interactions[0].error).toMatch(/No layer found/);
    expect(report.interactions[1].error).toMatch(/No sketch tool named/);
  });

  it("rebuilds the post-edit document from the bridge snapshot", async () => {
    const core = fakeCore();
    await runSketchDebug(
      sketchFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([{ tool: "add_layer", input: { name: "Glow" } }])
        ),
        outDir: outDir()
      },
      { loadDocument: async () => null, core, createBridge: () => fakeBridge() }
    );

    const built = core.calls.build[0] as {
      finalDocument?: {
        sketch: {
          canvas: { width: number; height: number };
          layers: { id: string; name: string }[];
          activeLayerId: string;
        };
        layerBindings: unknown[];
      };
      finalState?: unknown;
    };
    expect(built.finalDocument?.sketch.layers.map((l) => l.name)).toEqual([
      "Background",
      "Glow"
    ]);
    expect(built.finalDocument?.sketch.activeLayerId).toBe("layer_2");
    expect(built.finalDocument?.sketch.canvas).toEqual({
      width: 1024,
      height: 768,
      backgroundColor: "#ffffff"
    });
    // The bridge tracks no persisted binding record, so the rebuild drops them.
    expect(built.finalDocument?.layerBindings).toEqual([]);
    expect(built.finalState).toBeDefined();
  });

  it("runs no bridge at all without an interact script", async () => {
    const createBridge = vi.fn(() => fakeBridge());
    const core = fakeCore();
    const { report } = await runSketchDebug(
      sketchFile(),
      { outDir: outDir() },
      { loadDocument: async () => null, core, createBridge }
    );

    expect(createBridge).not.toHaveBeenCalled();
    expect(report.interactions).toEqual([]);
    expect((core.calls.build[0] as { finalState?: unknown }).finalState).toBeUndefined();
  });

  it("writes the bundle: report.json, report.md and the input document", async () => {
    const dir = outDir();
    const { bundleDir } = await runSketchDebug(
      sketchFile(),
      { outDir: dir },
      { loadDocument: async () => null, core: fakeCore() }
    );

    expect(bundleDir).toBe(dir);
    for (const name of ["report.json", "report.md", "sketch.json"]) {
      expect(existsSync(join(dir, name))).toBe(true);
    }
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("sketch ok");
    const written = JSON.parse(readFileSync(join(dir, "sketch.json"), "utf8"));
    expect(written.sketch.layers).toEqual([layer]);
  });
});
