import { encodePsd, type PsdNode } from "../psd/psdEncoder";
import { buildPsdLayerTree, cropToOpaqueBounds } from "../psd/sketchPsd";
import { createDefaultDocument, createDefaultLayer } from "../types";

// ─── Minimal PSD reader (independent of the encoder's internals) ─────────────

interface ReadLayer {
  top: number;
  left: number;
  bottom: number;
  right: number;
  blendKey: string;
  opacity: number;
  flags: number;
  name: string;
  unicodeName: string | null;
  sectionType: number | null;
  channels: Map<number, Uint8Array>;
}

function unpackBits(src: Uint8Array, offset: number, length: number, out: number[]): void {
  const end = offset + length;
  let i = offset;
  while (i < end) {
    const header = src[i++];
    if (header > 128) {
      const value = src[i++];
      for (let k = 0; k < 257 - header; k++) {
        out.push(value);
      }
    } else if (header < 128) {
      for (let k = 0; k <= header; k++) {
        out.push(src[i++]);
      }
    }
  }
}

function readChannel(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  width: number,
  height: number
): Uint8Array {
  const compression = view.getUint16(offset);
  if (width === 0 || height === 0) {
    return new Uint8Array(0);
  }
  if (compression === 0) {
    return bytes.slice(offset + 2, offset + 2 + width * height);
  }
  expect(compression).toBe(1);
  const counts: number[] = [];
  for (let y = 0; y < height; y++) {
    counts.push(view.getUint16(offset + 2 + y * 2));
  }
  const out: number[] = [];
  let p = offset + 2 + height * 2;
  for (const count of counts) {
    const before = out.length;
    unpackBits(bytes, p, count, out);
    expect(out.length - before).toBe(width);
    p += count;
  }
  return Uint8Array.from(out);
}

function readPsd(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (o: number, n: number) =>
    String.fromCharCode(...bytes.slice(o, o + n));
  expect(ascii(0, 4)).toBe("8BPS");
  expect(view.getUint16(4)).toBe(1);
  const channelCount = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  expect(view.getUint16(22)).toBe(8);
  expect(view.getUint16(24)).toBe(3);

  let p = 26;
  p += 4 + view.getUint32(p); // color mode data
  p += 4 + view.getUint32(p); // image resources
  const layerMaskLength = view.getUint32(p);
  const layerMaskEnd = p + 4 + layerMaskLength;
  p += 4;
  const layerInfoLength = view.getUint32(p);
  expect(layerInfoLength % 2).toBe(0);
  const layerInfoEnd = p + 4 + layerInfoLength;
  p += 4;
  const count = Math.abs(view.getInt16(p));
  p += 2;

  const records: Array<ReadLayer & { channelInfo: Array<{ id: number; length: number }> }> = [];
  for (let i = 0; i < count; i++) {
    const top = view.getInt32(p);
    const left = view.getInt32(p + 4);
    const bottom = view.getInt32(p + 8);
    const right = view.getInt32(p + 12);
    const nChannels = view.getUint16(p + 16);
    p += 18;
    const channelInfo: Array<{ id: number; length: number }> = [];
    for (let c = 0; c < nChannels; c++) {
      channelInfo.push({ id: view.getInt16(p), length: view.getUint32(p + 2) });
      p += 6;
    }
    expect(ascii(p, 4)).toBe("8BIM");
    const blendKey = ascii(p + 4, 4);
    const opacity = bytes[p + 8];
    const flags = bytes[p + 10];
    p += 12;
    const extraLength = view.getUint32(p);
    const extraEnd = p + 4 + extraLength;
    p += 4;
    p += 4 + view.getUint32(p); // mask
    p += 4 + view.getUint32(p); // blending ranges
    const nameLength = bytes[p];
    const name = ascii(p + 1, nameLength);
    p += Math.ceil((nameLength + 1) / 4) * 4;
    let unicodeName: string | null = null;
    let sectionType: number | null = null;
    while (p < extraEnd) {
      expect(ascii(p, 4)).toBe("8BIM");
      const key = ascii(p + 4, 4);
      const length = view.getUint32(p + 8);
      const data = p + 12;
      if (key === "luni") {
        const chars = view.getUint32(data);
        unicodeName = String.fromCharCode(
          ...Array.from({ length: chars }, (_, k) => view.getUint16(data + 4 + k * 2))
        );
      }
      if (key === "lsct") {
        sectionType = view.getUint32(data);
      }
      p = data + length;
    }
    expect(p).toBe(extraEnd);
    records.push({
      top,
      left,
      bottom,
      right,
      blendKey,
      opacity,
      flags,
      name,
      unicodeName,
      sectionType,
      channels: new Map(),
      channelInfo
    });
  }

  for (const record of records) {
    for (const info of record.channelInfo) {
      record.channels.set(
        info.id,
        readChannel(bytes, view, p, record.right - record.left, record.bottom - record.top)
      );
      p += info.length;
    }
  }
  expect(p).toBeLessThanOrEqual(layerInfoEnd);
  expect(layerInfoEnd + 4).toBe(layerMaskEnd);

  // Merged image: one compression field, then all row counts, then data.
  p = layerMaskEnd;
  expect(view.getUint16(p)).toBe(1);
  const rowCounts: number[] = [];
  for (let i = 0; i < channelCount * height; i++) {
    rowCounts.push(view.getUint16(p + 2 + i * 2));
  }
  p += 2 + rowCounts.length * 2;
  const composite: Uint8Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    const out: number[] = [];
    for (let y = 0; y < height; y++) {
      const n = rowCounts[c * height + y];
      unpackBits(bytes, p, n, out);
      p += n;
    }
    composite.push(Uint8Array.from(out));
  }
  expect(p).toBe(bytes.length);
  return { width, height, channelCount, layers: records, composite };
}

function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rgba, i * 4);
  }
  return data;
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

describe("encodePsd", () => {
  it("writes layer records, pixels, groups and the composite", () => {
    const gradient = new Uint8ClampedArray(3 * 2 * 4);
    for (let i = 0; i < 6; i++) {
      gradient.set([i * 40, 255 - i * 40, i, 200], i * 4);
    }
    const layers: PsdNode[] = [
      {
        kind: "layer",
        name: "Background",
        visible: true,
        opacity: 1,
        blendMode: "normal",
        left: 0,
        top: 0,
        width: 4,
        height: 4,
        pixels: solid(4, 4, [10, 20, 30, 255])
      },
      {
        kind: "group",
        name: "Folder",
        visible: false,
        opacity: 0.5,
        collapsed: true,
        children: [
          {
            kind: "layer",
            name: "Ünïcode",
            visible: true,
            opacity: 0.25,
            blendMode: "multiply",
            transparencyLocked: true,
            left: 1,
            top: 2,
            width: 3,
            height: 2,
            pixels: gradient
          }
        ]
      },
      {
        kind: "layer",
        name: "Empty",
        visible: false,
        opacity: 1,
        blendMode: "add",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        pixels: new Uint8ClampedArray(0)
      }
    ];

    const psd = readPsd(
      encodePsd({ width: 4, height: 4, composite: solid(4, 4, [1, 2, 3, 128]), layers })
    );

    expect(psd).toMatchObject({ width: 4, height: 4, channelCount: 4 });
    expect(psd.layers.map((l) => l.unicodeName)).toEqual([
      "Background",
      "</Layer group>",
      "Ünïcode",
      "Folder",
      "Empty"
    ]);
    const [background, divider, child, folder, empty] = psd.layers;

    expect(background).toMatchObject({ top: 0, left: 0, bottom: 4, right: 4, blendKey: "norm", opacity: 255, flags: 0 });
    expect(Array.from(background.channels.get(0)!)).toEqual(new Array(16).fill(10));
    expect(Array.from(background.channels.get(-1)!)).toEqual(new Array(16).fill(255));

    expect(divider.sectionType).toBe(3);
    expect(folder).toMatchObject({ sectionType: 2, blendKey: "pass", opacity: 128 });
    expect(folder.flags & 0x02).toBe(0x02);

    expect(child).toMatchObject({ top: 2, left: 1, bottom: 4, right: 4, blendKey: "mul ", opacity: 64, name: "?n?code" });
    expect(child.flags & 0x01).toBe(0x01);
    expect(Array.from(child.channels.get(0)!)).toEqual([0, 40, 80, 120, 160, 200]);
    expect(Array.from(child.channels.get(1)!)).toEqual([255, 215, 175, 135, 95, 55]);
    expect(Array.from(child.channels.get(-1)!)).toEqual(new Array(6).fill(200));

    expect(empty).toMatchObject({ top: 0, left: 0, bottom: 0, right: 0, blendKey: "lddg" });
    expect(empty.flags & 0x02).toBe(0x02);

    expect(Array.from(psd.composite[2])).toEqual(new Array(16).fill(3));
    expect(Array.from(psd.composite[3])).toEqual(new Array(16).fill(128));
  });

  it("round-trips rows that mix runs and literals across the 128-byte limit", () => {
    const width = 300;
    const pixels = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x++) {
      const value = x < 140 ? 7 : x < 270 ? (x * 13) % 256 : 9;
      pixels.set([value, x % 256, 0, 255], x * 4);
    }
    const psd = readPsd(
      encodePsd({
        width,
        height: 1,
        composite: pixels,
        layers: [
          {
            kind: "layer",
            name: "Row",
            visible: true,
            opacity: 1,
            blendMode: "normal",
            left: 0,
            top: 0,
            width,
            height: 1,
            pixels
          }
        ]
      })
    );
    const red = Array.from({ length: width }, (_, x) => pixels[x * 4]);
    const green = Array.from({ length: width }, (_, x) => pixels[x * 4 + 1]);
    expect(Array.from(psd.layers[0].channels.get(0)!)).toEqual(red);
    expect(Array.from(psd.layers[0].channels.get(1)!)).toEqual(green);
    expect(Array.from(psd.composite[0])).toEqual(red);
  });

  it("rejects documents larger than PSD allows", () => {
    expect(() =>
      encodePsd({ width: 30001, height: 1, composite: new Uint8ClampedArray(30001 * 4), layers: [] })
    ).toThrow(/30000/);
  });
});

// ─── Sketch document mapping ─────────────────────────────────────────────────

describe("buildPsdLayerTree", () => {
  it("crops to opaque pixels", () => {
    const data = new Uint8ClampedArray(5 * 4 * 4);
    data.set([1, 2, 3, 255], (2 * 5 + 1) * 4);
    data.set([4, 5, 6, 10], (3 * 5 + 3) * 4);
    const cropped = cropToOpaqueBounds({ width: 5, height: 4, data });
    expect(cropped).toMatchObject({ left: 1, top: 2, width: 3, height: 2 });
    expect(Array.from(cropped.pixels.slice(0, 4))).toEqual([1, 2, 3, 255]);
    expect(Array.from(cropped.pixels.slice(20, 24))).toEqual([4, 5, 6, 10]);
    expect(cropToOpaqueBounds({ width: 2, height: 2, data: new Uint8ClampedArray(16) })).toMatchObject({ width: 0, height: 0 });
  });

  it("maps layers, groups and the mask layer", () => {
    const doc = createDefaultDocument(2, 2);
    const base = { ...createDefaultLayer("Paint", "raster", 2, 2), id: "paint", opacity: 0.6, blendMode: "screen" as const };
    const group = { ...createDefaultLayer("Group", "group", 2, 2), id: "group", visible: false };
    const child = { ...createDefaultLayer("", "vector", 2, 2), id: "child", parentId: "group" };
    const mask = { ...createDefaultLayer("Mask", "mask", 2, 2), id: "mask" };
    doc.layers = [base, child, group, mask];

    const rendered: string[] = [];
    const tree = buildPsdLayerTree(doc, (id) => {
      rendered.push(id);
      return { width: 2, height: 2, data: solid(2, 2, [9, 9, 9, 255]) };
    });

    expect(rendered).toEqual(["paint", "child", "mask"]);
    expect(tree.map((n) => n.name)).toEqual(["Paint", "Group", "Mask"]);
    expect(tree[0]).toMatchObject({ kind: "layer", opacity: 0.6, blendMode: "screen", width: 2, height: 2 });
    expect(tree[1]).toMatchObject({ kind: "group", visible: false, children: [{ kind: "layer", name: "Layer" }] });
    expect(tree[2]).toMatchObject({ kind: "layer", visible: false });
  });
});
