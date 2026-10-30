/**
 * `nodetool sketch render` (src/commands/sketch-render.ts): registration, flag
 * parsing, and a render of a real document file written to disk.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { encodeSketchLayerData } from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { registerSketchCommands } from "../src/commands/sketch.js";
import {
  defaultOutputPath,
  parseDimension,
  runSketchRender
} from "../src/commands/sketch-render.js";

// The CLI suite stubs @nodetool-ai/runtime; the renderer needs only its canvas loader.
vi.mock("@nodetool-ai/runtime", () => ({
  loadCanvas: () => import("@napi-rs/canvas")
}));

function redLayerDocument() {
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 8, 8);
  const bounds = { x: 4, y: 4, width: 8, height: 8 };
  return {
    name: "Red Square",
    document: {
      sketch: {
        version: 1,
        canvas: { width: 16, height: 16, backgroundColor: "#ffffff" },
        layers: [
          {
            id: "red",
            name: "Red",
            type: "raster",
            visible: true,
            opacity: 1,
            blendMode: "normal",
            data: encodeSketchLayerData(
              `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
              bounds
            ),
            transform: { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            contentBounds: bounds
          }
        ],
        activeLayerId: "red",
        maskLayerId: null
      },
      layerBindings: []
    }
  };
}

const noRows = async () => null;

describe("sketch render registration", () => {
  it("registers render with its output options", () => {
    const program = new Command();
    registerSketchCommands(program);
    const sketch = program.commands.find((c) => c.name() === "sketch");
    const render = sketch?.commands.find((c) => c.name() === "render");
    expect(render?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining([
        "--out",
        "--format",
        "--width",
        "--height",
        "--background",
        "--layer",
        "--mask",
        "--json"
      ])
    );
  });
});

describe("parseDimension and defaultOutputPath", () => {
  it("takes a positive whole number and refuses anything else", () => {
    expect(parseDimension("width", undefined)).toBeUndefined();
    expect(parseDimension("width", "512")).toBe(512);
    expect(() => parseDimension("width", "0")).toThrow(/--width/);
    expect(() => parseDimension("height", "1.5")).toThrow(/--height/);
  });

  it("names the output after the sketch", () => {
    expect(defaultOutputPath("x.json", "png", "Spring Poster!")).toBe("spring-poster.png");
    expect(defaultOutputPath("dir/my_sketch.json", "psd", undefined)).toBe("my-sketch.psd");
  });
});

describe("runSketchRender", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sketch-render-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("renders a document file to the PNG the editor exports", async () => {
    const file = path.join(dir, "sketch.json");
    writeFileSync(file, JSON.stringify(redLayerDocument()));
    const out = path.join(dir, "out.png");
    const report = await runSketchRender(file, { out, width: "32" }, { loadDocument: noRows });
    expect(report).toMatchObject({
      target: { kind: "file", name: "Red Square" },
      out,
      format: "png",
      width: 32,
      height: 32,
      canvas_width: 16,
      layers: [{ id: "red", drawn: true }]
    });
    const image = await loadImage(readFileSync(out));
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    // The square sits at (4, 4)–(12, 12) on the 16 px canvas: (8, 8)–(24, 24) at 2×.
    expect(Array.from(ctx.getImageData(16, 16, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(ctx.getImageData(2, 2, 1, 1).data[3]).toBe(0);
  });

  it("writes a PSD and reads a row through the loader", async () => {
    const out = path.join(dir, "out.psd");
    const doc = redLayerDocument();
    const report = await runSketchRender(
      "row-1",
      { out, format: "psd" },
      {
        loadDocument: async (id) =>
          id === "row-1" ? { id, name: doc.name, document: JSON.stringify(doc.document) } : null
      }
    );
    expect(report).toMatchObject({ target: { kind: "id", ref: "row-1" }, format: "psd" });
    expect(readFileSync(out).subarray(0, 4).toString("latin1")).toBe("8BPS");
  });

  it("refuses an unknown format", async () => {
    await expect(
      runSketchRender("x", { format: "gif" }, { loadDocument: noRows })
    ).rejects.toThrow(/png or psd/);
  });
});
