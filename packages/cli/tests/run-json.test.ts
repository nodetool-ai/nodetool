/**
 * `--json` reporting of a finished run (#5198).
 *
 * A `lib.image.*` node emits raw-RGBA bytes as its in-flight format, so a run
 * of several 1024² frames used to overflow V8's string limit inside
 * `JSON.stringify(result, null, 2)` — failing the report of a run that had
 * already completed and been paid for. These pin the two halves of the fix:
 * raw-RGBA refs go through the shared PNG encoder at this boundary, and binary
 * payloads over the ceiling are written to disk rather than expanded byte by
 * byte into the JSON text.
 *
 * `@nodetool-ai/protocol` and `@nodetool-ai/runtime` are stubbed for this
 * package's tests (see vitest.config.ts), so the predicate and the encoder are
 * supplied here. The encoder's own behaviour is pinned by
 * packages/runtime/tests/image-codec.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RAW_RGBA_MIME = "image/x-raw-rgba";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

vi.mock("@nodetool-ai/protocol", () => ({
  RAW_RGBA_MIME: "image/x-raw-rgba",
  isRawRgbaImage: (value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      v.type === "image" &&
      v.mimeType === "image/x-raw-rgba" &&
      v.data instanceof Uint8Array &&
      typeof v.width === "number" &&
      typeof v.height === "number" &&
      v.data.length === v.width * v.height * 4
    );
  }
}));

vi.mock("@nodetool-ai/runtime", () => ({
  encodeRawImageRef: async (ref: Record<string, unknown>) => {
    const width = ref.width as number;
    const height = ref.height as number;
    return {
      ...ref,
      mimeType: "image/png",
      // Stands in for the real PNG: signed, and smaller than the raw pixels.
      data: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...new Uint8Array(width * height)
      ])
    };
  }
}));

import { formatRunJson, previewJson } from "../src/run-json.js";

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "run-json-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

/** `w`x`h` opaque-red straight-alpha RGBA8, the in-flight image-node output. */
function rawImage(w: number, h: number) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 3] = 255;
  }
  return { type: "image", mimeType: RAW_RGBA_MIME, width: w, height: h, data };
}

describe("formatRunJson", () => {
  it("keeps a payload under the ceiling inline", async () => {
    const { json, files } = await formatRunJson(
      { outputs: { a: [{ data: new Uint8Array([1, 2, 3]) }] } },
      { outputDir, maxInlineBytes: 64 }
    );
    expect(files).toEqual([]);
    expect(JSON.parse(json).outputs.a[0].data).toEqual({
      "0": 1,
      "1": 2,
      "2": 3
    });
  });

  it("writes a payload at or over the ceiling to disk and points at it", async () => {
    const data = new Uint8Array(4096).fill(7);
    const { json, files } = await formatRunJson(
      { outputs: { a: [{ type: "audio", mimeType: "audio/wav", data }] } },
      { outputDir, maxInlineBytes: 1024 }
    );

    expect(files).toHaveLength(1);
    const file = files[0];
    const pointer = JSON.parse(json).outputs.a[0].data;
    expect(pointer).toEqual({ $file: file, bytes: 4096, mimeType: "audio/wav" });
    expect(file).toMatch(/payload-0\.wav$/);
    expect(readFileSync(file)).toEqual(Buffer.from(data));
    // The bytes are gone from the text — that is the whole point.
    expect(json.length).toBeLessThan(1000);
  });

  it("PNG-encodes a raw-RGBA ref before it leaves the process", async () => {
    const { json, files } = await formatRunJson(
      { outputs: { image: [rawImage(64, 64)] } },
      { outputDir, maxInlineBytes: 1024 }
    );

    const ref = JSON.parse(json).outputs.image[0];
    expect(ref.mimeType).toBe("image/png");
    expect(json).not.toContain(RAW_RGBA_MIME);
    expect(files[0]).toMatch(/payload-0\.png$/);
    const written = readFileSync(files[0]);
    expect(Array.from(written.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(written.byteLength).toBeLessThan(64 * 64 * 4);
  });

  it("names an encoded payload by its own mimeType, not an enclosing one", async () => {
    const { files } = await formatRunJson(
      { mimeType: "application/json", image: rawImage(32, 32) },
      { outputDir, maxInlineBytes: 1024 }
    );
    expect(files[0]).toMatch(/\.png$/);
  });

  it("labels a payload with no known mimeType .bin", async () => {
    const { files } = await formatRunJson(
      { data: new Uint8Array(2048) },
      { outputDir, maxInlineBytes: 1024 }
    );
    expect(files[0]).toMatch(/payload-0\.bin$/);
  });

  it("leaves a value that serializes itself alone", async () => {
    const { json } = await formatRunJson(
      { started: new Date("2026-08-24T00:00:00.000Z") },
      { outputDir }
    );
    expect(JSON.parse(json).started).toBe("2026-08-24T00:00:00.000Z");
  });

  it("reports a serialization failure as JSON instead of throwing", async () => {
    const { json } = await formatRunJson(
      { status: "completed", outputs: { a: 1n } },
      { outputDir }
    );
    const report = JSON.parse(json);
    expect(report.error).toMatch(/could not be serialized/);
    expect(report.keys).toEqual(["status", "outputs"]);
  });

  it("still reports the files it spilled when serialization fails", async () => {
    const { json, files } = await formatRunJson(
      { image: rawImage(32, 32), broken: 1n },
      { outputDir, maxInlineBytes: 1 }
    );
    expect(files).toHaveLength(1);
    expect(JSON.parse(json).files).toEqual(files);
  });
});

describe("previewJson", () => {
  it("describes byte arrays instead of expanding them", () => {
    expect(previewJson({ data: new Uint8Array(4_194_304) })).toBe(
      '{"data":"<4194304 bytes>"}'
    );
  });

  it("truncates to maxChars", () => {
    expect(previewJson({ text: "x".repeat(100) }, 10)).toBe('{"text":"x…');
  });

  it("leaves a value under maxChars whole", () => {
    expect(previewJson({ a: 1 }, 100)).toBe('{"a":1}');
  });
});
