/**
 * Tests for the sketch debug target loader (src/sketch-debug/target.ts): file
 * vs. row-id precedence, the document shapes a file can carry, and where the
 * canvas settings come from.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveSketchTarget } from "../src/sketch-debug/target.js";

const document = {
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
    layers: [
      {
        id: "layer-1",
        name: "Background",
        type: "raster",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        data: null
      }
    ],
    activeLayerId: "layer-1",
    maskLayerId: null
  },
  layerBindings: []
};

const writeJson = (name: string, value: unknown): string => {
  const file = join(mkdtempSync(join(tmpdir(), "sketch-target-")), name);
  writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
};

const noDocuments = vi.fn(async () => null);

describe("resolveSketchTarget", () => {
  it("reads a bare ImageDocumentData file", async () => {
    const file = writeJson("sketch.json", document);
    const resolved = await resolveSketchTarget(file, {
      loadDocument: noDocuments
    });

    expect(resolved.target).toEqual({ kind: "file", ref: file });
    expect(resolved.document.layers).toEqual([
      { id: "layer-1", name: "Background", type: "raster" }
    ]);
    expect(resolved.document.activeLayerId).toBe("layer-1");
    expect(resolved.meta).toEqual({});
    expect(noDocuments).not.toHaveBeenCalled();
  });

  it("unwraps a sketch.get response and keeps its canvas settings apart", async () => {
    const file = writeJson("response.json", {
      id: "img-1",
      name: "Poster",
      width: 2048,
      height: 768,
      backgroundColor: "#000000",
      document
    });
    const resolved = await resolveSketchTarget(file, {
      loadDocument: noDocuments
    });

    expect(resolved.target).toEqual({ kind: "file", ref: file, name: "Poster" });
    expect(resolved.meta).toEqual({
      width: 2048,
      height: 768,
      backgroundColor: "#000000"
    });
    expect(resolved.document.canvas).toEqual({
      width: 1024,
      height: 768,
      backgroundColor: "#ffffff"
    });
  });

  it("unwraps a document stored as a JSON string", async () => {
    const file = writeJson("row.json", {
      id: "img-1",
      document: JSON.stringify(document)
    });
    const resolved = await resolveSketchTarget(file, {
      loadDocument: noDocuments
    });

    expect(resolved.document.layers).toHaveLength(1);
  });

  it("rejects a file that carries no image document", async () => {
    const file = writeJson("nope.json", { tracks: [], clips: [] });
    await expect(
      resolveSketchTarget(file, { loadDocument: noDocuments })
    ).rejects.toThrow(/is not an image document/);
  });

  it("rejects a file that is not JSON", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "sketch-target-")), "bad.json");
    writeFileSync(file, "{oops", "utf8");
    await expect(
      resolveSketchTarget(file, { loadDocument: noDocuments })
    ).rejects.toThrow(/is not valid JSON/);
  });

  it("reads a row id through the loader, snake_case background included", async () => {
    const resolved = await resolveSketchTarget("img-1", {
      loadDocument: async (id) => ({
        id,
        name: "Poster",
        width: 1024,
        height: 768,
        background_color: "#101010",
        document: JSON.stringify(document)
      })
    });

    expect(resolved.target).toEqual({ kind: "id", ref: "img-1", name: "Poster" });
    expect(resolved.meta).toEqual({
      width: 1024,
      height: 768,
      backgroundColor: "#101010"
    });
    expect(resolved.raw).toEqual(document);
  });

  it("names the id that has no row", async () => {
    await expect(
      resolveSketchTarget("img-9", { loadDocument: async () => null })
    ).rejects.toThrow(/Image document not found: img-9/);
  });
});
