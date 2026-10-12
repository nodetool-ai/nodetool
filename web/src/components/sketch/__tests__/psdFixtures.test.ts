import { readFileSync } from "fs";
import { join } from "path";
import { decodePsd } from "../psd/psdDecoder";
import type { PsdNode } from "../psd/psdEncoder";
import { importPsdIntoSketch } from "../psd/sketchPsd";
import { createDefaultDocument } from "../types";

const FIXTURES = join(__dirname, "fixtures", "psd");

interface ExpectedFile {
  error?: string;
  size?: [number, number];
  compositeRGBSums?: number[];
  layers?: unknown[];
}

const expected = JSON.parse(
  readFileSync(join(FIXTURES, "expected.json"), "utf8")
) as Record<string, ExpectedFile>;

function describeNodes(nodes: PsdNode[]): unknown[] {
  return nodes.map((node) => {
    if (node.kind === "group") {
      return {
        kind: "group",
        name: node.name,
        visible: node.visible,
        opacity: Math.round(node.opacity * 255),
        children: describeNodes(node.children)
      };
    }
    const channelSums = [0, 0, 0, 0];
    for (let i = 0; i < node.pixels.length; i++) {
      channelSums[i % 4] += node.pixels[i];
    }
    return {
      kind: "layer",
      name: node.name,
      visible: node.visible,
      opacity: Math.round(node.opacity * 255),
      blendMode: node.blendMode,
      bounds: [node.left, node.top, node.width, node.height],
      channelSums
    };
  });
}

const read = (file: string) => new Uint8Array(readFileSync(join(FIXTURES, file)));

describe("decodePsd on Photoshop files", () => {
  it("covers every fixture", () => {
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(10);
  });

  it.each(Object.entries(expected).filter(([, e]) => !e.error))(
    "matches psd-tools on %s",
    (file, want) => {
      const psd = decodePsd(read(file));
      expect([psd.width, psd.height]).toEqual(want.size);
      expect(describeNodes(psd.layers)).toEqual(want.layers);
      const rgb = [0, 0, 0];
      for (let i = 0; i < psd.composite.length; i++) {
        if (i % 4 < 3) {
          rgb[i % 4] += psd.composite[i];
        }
      }
      expect(rgb).toEqual(want.compositeRGBSums);
      // Every fixture also maps onto a sketch.
      const doc = importPsdIntoSketch(createDefaultDocument(), psd, file, () => "data:,");
      expect(doc.canvas).toMatchObject({ width: psd.width, height: psd.height });
    }
  );

  it.each(Object.entries(expected).filter(([, e]) => e.error))(
    "rejects %s",
    (file) => {
      expect(() => decodePsd(read(file))).toThrow(/8-bit/);
    }
  );
});
