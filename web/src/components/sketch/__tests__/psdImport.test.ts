import { decodePsd } from "../psd/psdDecoder";
import { encodePsd, type PsdNode } from "../psd/psdEncoder";
import { importPsdIntoSketch, psdNodesToLayers } from "../psd/sketchPsd";
import { createDefaultDocument } from "../types";

const toDataUrl = (_pixels: Uint8ClampedArray, width: number, height: number) =>
  `data:image/png;base64,${width}x${height}`;

function solid(width: number, height: number, rgba: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rgba, i * 4);
  }
  return data;
}

const LAYERS: PsdNode[] = [
  {
    kind: "layer",
    name: "Paper",
    visible: true,
    opacity: 1,
    blendMode: "normal",
    left: 0,
    top: 0,
    width: 4,
    height: 3,
    pixels: solid(4, 3, [250, 240, 230, 255])
  },
  {
    kind: "group",
    name: "Ink",
    visible: false,
    opacity: 0.6,
    collapsed: true,
    children: [
      {
        kind: "layer",
        name: "Strokes ✏️",
        visible: true,
        opacity: 0.4,
        blendMode: "multiply",
        transparencyLocked: true,
        left: -1,
        top: 1,
        width: 2,
        height: 2,
        pixels: solid(2, 2, [10, 20, 30, 128])
      }
    ]
  }
];

/**
 * Hand-built 2×1 RGB PSD: raw colour channels and an RLE user mask channel
 * (-2) that covers only its own 1×1 rectangle.
 */
function psdWithMaskChannel(): Uint8Array {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 0xff);
  const u16 = (v: number) => { u8(v >> 8); u8(v); };
  const u32 = (v: number) => { u16(v >>> 16); u16(v & 0xffff); };
  const ascii = (s: string) => [...s].forEach((c) => u8(c.charCodeAt(0)));
  ascii("8BPS"); u16(1); for (let i = 0; i < 6; i++) u8(0);
  u16(3); u32(1); u32(2); u16(8); u16(3);
  u32(0); u32(0);
  const body = bytes.length;
  // Record: bounds 0,0,1,2; channels -1,0,1,2 (2 + 2 bytes each), -2 (2 + 1 bytes).
  u16(1);
  u32(0); u32(0); u32(1); u32(2);
  u16(5);
  for (const id of [0xffff, 0, 1, 2]) { u16(id); u32(4); }
  u16(0xfffe); u32(6);
  ascii("8BIM"); ascii("norm"); u8(255); u8(0); u8(0); u8(0);
  u32(4 + 20 + 4 + 4); // mask data, blending ranges, name
  u32(20); u32(0); u32(0); u32(1); u32(1); u8(0); u8(0); u16(0);
  u32(0);
  u8(3); ascii("Ink");
  // Channel data: alpha, R, G, B raw, then the mask as one RLE row.
  u16(0); u8(255); u8(255);
  u16(0); u8(200); u8(100);
  u16(0); u8(10); u8(20);
  u16(0); u8(30); u8(40);
  u16(1); u16(2); u8(0); u8(77);
  const layerInfo = bytes.splice(body);
  if (layerInfo.length % 2) layerInfo.push(0);
  u32(layerInfo.length + 8);
  u32(layerInfo.length);
  bytes.push(...layerInfo);
  u32(0);
  // Merged image, raw.
  u16(0); u8(200); u8(100); u8(10); u8(20); u8(30); u8(40);
  return Uint8Array.from(bytes);
}

describe("decodePsd", () => {
  it("reads back what encodePsd writes", () => {
    const composite = solid(4, 3, [1, 2, 3, 200]);
    const psd = decodePsd(encodePsd({ width: 4, height: 3, composite, layers: LAYERS }));
    expect(psd).toMatchObject({ width: 4, height: 3, unsupportedBlendKeys: [] });
    expect(Array.from(psd.composite)).toEqual(Array.from(composite));
    expect(psd.layers).toHaveLength(2);
    expect(psd.layers[0]).toMatchObject({ kind: "layer", name: "Paper", left: 0, top: 0, width: 4, height: 3 });
    const group = psd.layers[1];
    expect(group).toMatchObject({ kind: "group", name: "Ink", visible: false, collapsed: true });
    expect(group.kind === "group" && group.opacity).toBeCloseTo(0.6, 2);
    const child = group.kind === "group" ? group.children[0] : null;
    expect(child).toMatchObject({
      kind: "layer",
      name: "Strokes ✏️",
      blendMode: "multiply",
      transparencyLocked: true,
      left: -1,
      top: 1,
      width: 2,
      height: 2
    });
    expect(child?.kind === "layer" && Array.from(child.pixels.slice(0, 4))).toEqual([10, 20, 30, 128]);
  });

  it("reads raw channels and skips layer-mask channels", () => {
    const psd = decodePsd(psdWithMaskChannel());
    expect(psd.layers).toEqual([
      expect.objectContaining({ name: "Ink", width: 2, height: 1, pixels: Uint8ClampedArray.from([200, 10, 30, 255, 100, 20, 40, 255]) })
    ]);
    expect(Array.from(psd.composite)).toEqual([200, 10, 30, 255, 100, 20, 40, 255]);
  });

  it("rejects files it cannot read", () => {
    expect(() => decodePsd(new Uint8Array(40))).toThrow(/Not a Photoshop/);
    const bytes = encodePsd({ width: 1, height: 1, composite: solid(1, 1, [0, 0, 0, 255]), layers: [] });
    bytes[23] = 16;
    expect(() => decodePsd(bytes)).toThrow(/8-bit/);
    expect(() => decodePsd(bytes.slice(0, 30))).toThrow();
  });
});

describe("importPsdIntoSketch", () => {
  const psd = { width: 4, height: 3, composite: solid(4, 3, [5, 5, 5, 255]), layers: LAYERS, unsupportedBlendKeys: [] };

  it("maps groups below their children with document-space bounds", () => {
    const layers = psdNodesToLayers(LAYERS, toDataUrl);
    expect(layers.map((l) => [l.type, l.name])).toEqual([
      ["raster", "Paper"],
      ["group", "Ink"],
      ["raster", "Strokes ✏️"]
    ]);
    expect(layers[2]).toMatchObject({
      parentId: layers[1].id,
      blendMode: "multiply",
      alphaLock: true,
      opacity: 0.4,
      contentBounds: { x: -1, y: 1, width: 2, height: 2 },
      exposedAsInput: false
    });
    expect(layers[1]).toMatchObject({ visible: false, collapsed: true, opacity: 0.6 });
    expect(layers[2].data).toEqual(expect.any(String));
  });

  it("replaces a blank sketch at the PSD's size", () => {
    const doc = importPsdIntoSketch(createDefaultDocument(512, 512), psd, "art", toDataUrl);
    expect(doc.canvas).toMatchObject({ width: 4, height: 3 });
    expect(doc.layers.map((l) => l.name)).toEqual(["Paper", "Ink", "Strokes ✏️"]);
    expect(doc.activeLayerId).toBe(doc.layers[2].id);
  });

  it("adds the PSD as a group on top of a sketch with content", () => {
    const base = createDefaultDocument(512, 512);
    base.layers[0] = { ...base.layers[0], data: "data:image/png;base64,x" };
    const doc = importPsdIntoSketch(base, psd, "art", toDataUrl);
    expect(doc.canvas).toMatchObject({ width: 512, height: 512 });
    expect(doc.layers.map((l) => l.name)).toEqual([base.layers[0].name, "art", "Paper", "Ink", "Strokes ✏️"]);
    expect(doc.layers[2].parentId).toBe(doc.layers[1].id);
    expect(doc.layers[4].parentId).toBe(doc.layers[3].id);
  });

  it("uses the composite of a PSD without layers", () => {
    const doc = importPsdIntoSketch(createDefaultDocument(), { ...psd, layers: [] }, "flat", toDataUrl);
    expect(doc.layers).toEqual([expect.objectContaining({ name: "Background", contentBounds: { x: 0, y: 0, width: 4, height: 3 } })]);
  });
});
