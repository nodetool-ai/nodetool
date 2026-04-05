/**
 * Tests for safetensor-layout.ts — safetensors header inspection and classification.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  summarizeSafetensor,
  classifySafetensorSet,
  SafetensorLayoutHint
} from "../src/safetensor-layout.js";

// ---------------------------------------------------------------------------
// Helpers: create fake .safetensors files with valid headers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "safetensor-layout-test-"));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Write a minimal .safetensors file with the given header metadata.
 * Format: 8-byte LE uint64 header length + JSON header + padding bytes.
 */
function writeFakeSafetensor(
  filePath: string,
  tensors: Record<
    string,
    { dtype: string; shape: number[]; data_offsets: [number, number] }
  >
): void {
  const header = JSON.stringify({
    __metadata__: { format: "pt" },
    ...tensors
  });
  const headerBuf = Buffer.from(header, "utf-8");
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);
  // Write just enough fake data after header
  const dataBuf = Buffer.alloc(16);
  fs.writeFileSync(filePath, Buffer.concat([lenBuf, headerBuf, dataBuf]));
}

// ---------------------------------------------------------------------------
// summarizeSafetensor
// ---------------------------------------------------------------------------

describe("summarizeSafetensor", () => {
  it("reads key count and shapes from header", () => {
    const filePath = path.join(tmpDir, "model.safetensors");
    writeFakeSafetensor(filePath, {
      "layer.0.weight": {
        dtype: "F32",
        shape: [768, 768],
        data_offsets: [0, 4]
      },
      "layer.0.bias": { dtype: "F32", shape: [768], data_offsets: [4, 8] },
      "layer.1.weight": {
        dtype: "F32",
        shape: [768, 3072],
        data_offsets: [8, 12]
      }
    });

    const summary = summarizeSafetensor(filePath);
    expect(summary.path).toBe(filePath);
    expect(summary.keyCount).toBe(3);
    expect(summary.sampledShapes["layer.0.weight"]).toEqual([768, 768]);
    expect(summary.sampledShapes["layer.0.bias"]).toEqual([768]);
  });

  it("respects sampleLimit", () => {
    const filePath = path.join(tmpDir, "big.safetensors");
    const tensors: Record<
      string,
      { dtype: string; shape: number[]; data_offsets: [number, number] }
    > = {};
    for (let i = 0; i < 50; i++) {
      tensors[`tensor_${i}`] = {
        dtype: "F32",
        shape: [i + 1],
        data_offsets: [0, 4]
      };
    }
    writeFakeSafetensor(filePath, tensors);

    const summary = summarizeSafetensor(filePath, 5);
    expect(summary.keyCount).toBe(50);
    expect(Object.keys(summary.sampledShapes).length).toBe(5);
  });

  it("skips __metadata__ key", () => {
    const filePath = path.join(tmpDir, "meta.safetensors");
    writeFakeSafetensor(filePath, {
      weight: { dtype: "F32", shape: [10], data_offsets: [0, 4] }
    });

    const summary = summarizeSafetensor(filePath);
    expect(summary.keyCount).toBe(1);
    expect(summary.sampledShapes["__metadata__"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// classifySafetensorSet
// ---------------------------------------------------------------------------

describe("classifySafetensorSet", () => {
  it("returns EMPTY for no files", () => {
    expect(classifySafetensorSet([])).toBe(SafetensorLayoutHint.EMPTY);
  });

  it("returns SINGLE for one file", () => {
    const filePath = path.join(tmpDir, "single.safetensors");
    writeFakeSafetensor(filePath, {
      weight: { dtype: "F32", shape: [10], data_offsets: [0, 4] }
    });
    expect(classifySafetensorSet([filePath])).toBe(SafetensorLayoutHint.SINGLE);
  });

  it("returns SHARDED_BUNDLE for files with overlapping keys and matching shapes", () => {
    const f1 = path.join(tmpDir, "shard1.safetensors");
    const f2 = path.join(tmpDir, "shard2.safetensors");

    // Same keys, same shapes — like sharded model parts
    writeFakeSafetensor(f1, {
      shared_key: { dtype: "F32", shape: [768, 768], data_offsets: [0, 4] },
      unique_to_f1: { dtype: "F32", shape: [768], data_offsets: [4, 8] }
    });
    writeFakeSafetensor(f2, {
      shared_key: { dtype: "F32", shape: [768, 768], data_offsets: [0, 4] },
      unique_to_f2: { dtype: "F32", shape: [1024], data_offsets: [4, 8] }
    });

    expect(classifySafetensorSet([f1, f2])).toBe(
      SafetensorLayoutHint.SHARDED_BUNDLE
    );
  });

  it("returns DISJOINT for files with no overlapping keys", () => {
    const f1 = path.join(tmpDir, "variant1.safetensors");
    const f2 = path.join(tmpDir, "variant2.safetensors");

    writeFakeSafetensor(f1, {
      "encoder.weight": { dtype: "F32", shape: [768], data_offsets: [0, 4] }
    });
    writeFakeSafetensor(f2, {
      "decoder.weight": { dtype: "F32", shape: [512], data_offsets: [0, 4] }
    });

    expect(classifySafetensorSet([f1, f2])).toBe(SafetensorLayoutHint.DISJOINT);
  });

  it("returns MIXED for files with overlapping keys but mismatched shapes", () => {
    const f1 = path.join(tmpDir, "mixed1.safetensors");
    const f2 = path.join(tmpDir, "mixed2.safetensors");

    writeFakeSafetensor(f1, {
      shared_key: { dtype: "F32", shape: [768, 768], data_offsets: [0, 4] }
    });
    writeFakeSafetensor(f2, {
      shared_key: { dtype: "F32", shape: [1024, 1024], data_offsets: [0, 4] }
    });

    expect(classifySafetensorSet([f1, f2])).toBe(SafetensorLayoutHint.MIXED);
  });
});
