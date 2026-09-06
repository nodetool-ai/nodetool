/**
 * Failure and edge behaviour of the asset-autosave module: the wire encoding
 * of native audio chunks, embedded-image extraction, the metadata caps, and
 * the media / text / JSON persistence branches of `autoSaveAssets`.
 *
 * `readBytesFromUri`'s http(s) branch performs a screened outbound fetch
 * (`fetchExternalMedia`) and is deliberately NOT exercised here — no test may
 * make a real network request. The file:// and data: branches are covered.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Must be set before anything calls getAssetAdapter(): the adapter is module
// state, created once from ASSET_FOLDER on first use.
process.env.ASSET_FOLDER = mkdtempSync(join(tmpdir(), "nt-autosave-test-"));

import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Asset } from "@nodetool-ai/models";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

import {
  autoSaveAssets,
  encodeNativeAudioChunks,
  extractEmbeddedImage,
  getAssetStoragePath,
  primaryTextOutputName
} from "../src/session/asset-autosave.js";
import { retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { getAssetAdapter } from "../src/lib/storage.js";

// A valid 1x1 PNG so the bytes store and the sharp thumbnail path both work.
const PNG_1x1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  218, 99, 100, 248, 207, 0, 0, 0, 3, 1, 1, 0, 24, 221, 141, 180, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130
]);
const PNG_B64 = Buffer.from(PNG_1x1).toString("base64");

const saveOpts = (
  overrides: Partial<{
    userId: string;
    workflowId: string | null;
    jobId: string;
    nodeId: string;
    textOutputName: string;
    generationIndex: number;
    properties: Record<string, unknown>;
    nodeType: string;
  }> = {}
) => ({
  userId: "1",
  workflowId: null,
  jobId: `job-${Math.random().toString(36).slice(2)}`,
  nodeId: "node-one",
  ...overrides
});

async function assetsForJob(jobId: string): Promise<Asset[]> {
  const [rows] = await Asset.paginate("1", { jobId, limit: 1000 });
  return rows;
}

describe("primaryTextOutputName", () => {
  it("answers undefined for no metadata or no outputs", () => {
    expect(primaryTextOutputName(undefined)).toBeUndefined();
    expect(primaryTextOutputName({ outputs: [] })).toBeUndefined();
    expect(primaryTextOutputName({})).toBeUndefined();
  });

  it("honors primary_output when it names a text output", () => {
    expect(
      primaryTextOutputName({
        outputs: [
          { name: "img", type: { type: "image" } },
          { name: "caption", type: { type: "str" } }
        ],
        primary_output: "caption"
      })
    ).toBe("caption");
  });

  it("falls back to the first output when primary_output names nothing", () => {
    expect(
      primaryTextOutputName({
        outputs: [{ name: "answer", type: { type: "text" } }],
        primary_output: "missing"
      })
    ).toBe("answer");
  });

  it("answers undefined for a non-text primary", () => {
    expect(
      primaryTextOutputName({
        outputs: [
          { name: "img", type: { type: "image" } },
          { name: "caption", type: { type: "str" } }
        ]
      })
    ).toBeUndefined();
    // No type at all is not text either.
    expect(
      primaryTextOutputName({ outputs: [{ name: "mystery" }] })
    ).toBeUndefined();
  });
});

describe("encodeNativeAudioChunks", () => {
  const samples = new Float32Array([0.5, -0.25, 1]);
  const nativeChunk = () => ({
    type: "chunk",
    content: new Float32Array(samples),
    content_metadata: { sample_rate: 24000 }
  });

  function decodeF32(b64: unknown): Float32Array {
    expect(typeof b64).toBe("string");
    const buf = Buffer.from(b64 as string, "base64");
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  }

  it("encodes a message that is itself a native chunk, preserving metadata", () => {
    const out = encodeNativeAudioChunks(nativeChunk());
    const meta = out.content_metadata as Record<string, unknown>;
    expect(meta.encoding).toBe("f32le");
    expect(meta.sample_rate).toBe(24000);
    expect(Array.from(decodeF32(out.content))).toEqual(Array.from(samples));
  });

  it("encodes chunks under value / result / chunk keys and inside arrays", () => {
    for (const key of ["value", "result", "chunk"]) {
      const out = encodeNativeAudioChunks({ type: "output_update", [key]: nativeChunk() });
      const encoded = out[key] as Record<string, unknown>;
      expect(typeof encoded.content).toBe("string");
    }
    const out = encodeNativeAudioChunks({
      type: "node_update",
      result: [nativeChunk(), "plain", nativeChunk()]
    });
    const arr = out.result as unknown[];
    expect(typeof (arr[0] as Record<string, unknown>).content).toBe("string");
    expect(arr[1]).toBe("plain");
    expect(typeof (arr[2] as Record<string, unknown>).content).toBe("string");
  });

  it("returns the same object untouched when nothing needs encoding", () => {
    const message = {
      type: "node_update",
      value: { type: "chunk", content: "already a string" },
      result: ["a", 1]
    };
    // Hot-path contract: no copy is made for a message with no native chunks.
    expect(encodeNativeAudioChunks(message)).toBe(message);
  });

  it("does not walk unlisted keys — a chunk under another key stays native", () => {
    const message = { type: "x", other: nativeChunk() };
    const out = encodeNativeAudioChunks(message);
    expect(
      (out.other as Record<string, unknown>).content instanceof Float32Array
    ).toBe(true);
  });
});

describe("extractEmbeddedImage", () => {
  it("parses a base64 data: URI in `data`, mime from the URI", () => {
    const out = extractEmbeddedImage({
      data: `data:image/jpeg;base64,${PNG_B64}`
    });
    expect(out).not.toBeNull();
    if (out && "bytes" in out) {
      expect(out.mimeType).toBe("image/jpeg");
      expect(Array.from(out.bytes)).toEqual(Array.from(PNG_1x1));
    } else {
      throw new Error("expected bytes result");
    }
  });

  it("lets a declared mimeType win over the data: URI's own", () => {
    const out = extractEmbeddedImage({
      data: `data:image/jpeg;base64,${PNG_B64}`,
      mimeType: "image/webp"
    });
    expect(out && "mimeType" in out ? out.mimeType : null).toBe("image/webp");
  });

  it("decodes a percent-encoded non-base64 data: URI and defaults a missing mime", () => {
    const plain = extractEmbeddedImage({ uri: "data:text/plain,hello%20world" });
    if (!plain || !("bytes" in plain)) throw new Error("expected bytes");
    expect(new TextDecoder().decode(plain.bytes)).toBe("hello world");
    expect(plain.mimeType).toBe("text/plain");

    const noMime = extractEmbeddedImage({ uri: `data:;base64,${PNG_B64}` });
    if (!noMime || !("bytes" in noMime)) throw new Error("expected bytes");
    expect(noMime.mimeType).toBe("image/png");
  });

  it("treats a bare base64 string in `data` as PNG unless a mime is declared", () => {
    const out = extractEmbeddedImage({ data: PNG_B64 });
    if (!out || !("bytes" in out)) throw new Error("expected bytes");
    expect(out.mimeType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual(Array.from(PNG_1x1));

    const declared = extractEmbeddedImage({ data: PNG_B64, mimeType: "image/webp" });
    expect(declared && "mimeType" in declared ? declared.mimeType : null).toBe(
      "image/webp"
    );
  });

  it("falls through a malformed data: URI in `data` to the uri, or to null", () => {
    // "data:" prefix but no comma — parseImageDataUri rejects it, and the
    // bare-base64 fallback must NOT swallow it.
    expect(extractEmbeddedImage({ data: "data:nocomma" })).toBeNull();
    expect(
      extractEmbeddedImage({ data: "data:nocomma", uri: "https://x/y.png" })
    ).toEqual({ uri: "https://x/y.png" });
  });

  it("surfaces a remote uri as a passthrough handle", () => {
    expect(extractEmbeddedImage({ uri: "https://example.com/a.png" })).toEqual({
      uri: "https://example.com/a.png"
    });
  });

  it("answers null for empty or non-string sources", () => {
    expect(extractEmbeddedImage({})).toBeNull();
    expect(extractEmbeddedImage({ data: 42, uri: 42 })).toBeNull();
    expect(extractEmbeddedImage({ data: "", uri: "" })).toBeNull();
  });
});

describe("autoSaveAssets", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("saves a nested media value, mutating it in place, with prompt + index metadata", async () => {
    const image: Record<string, unknown> = { type: "image", data: PNG_B64 };
    const result: Record<string, unknown> = { out: { image } };
    const opts = saveOpts({
      generationIndex: 3,
      properties: { prompt: "  a fox in snow  " }
    });
    await autoSaveAssets(result, opts);

    expect(typeof image.asset_id).toBe("string");
    const id = image.asset_id as string;
    expect(image.uri).toBe(`asset://${id}.png`);

    const row = await Asset.find("1", id);
    expect(row).not.toBeNull();
    expect(row?.content_type).toBe("image/png");
    expect(row?.job_id).toBe(opts.jobId);
    expect(row?.node_id).toBe("node-one");
    expect(row?.size).toBe(PNG_1x1.length);
    expect(row?.metadata).toEqual({
      prompt: "a fox in snow",
      generation_index: 3
    });
  });

  it("keeps the model and the settings the node ran with", async () => {
    const image: Record<string, unknown> = { type: "image", data: PNG_B64 };
    await autoSaveAssets(
      { image },
      saveOpts({
        nodeType: "nodetool.image.TextToImage",
        properties: {
          prompt: "a fox in snow",
          model: {
            type: "image_model",
            id: "fal-ai/flux/dev",
            name: "FLUX.1 [dev]",
            provider: "fal"
          },
          width: 1024,
          seed: 42
        }
      })
    );
    const row = await Asset.find("1", image.asset_id as string);
    expect(row?.metadata).toEqual({
      prompt: "a fox in snow",
      generation: {
        provider: "fal",
        model: "fal-ai/flux/dev",
        model_name: "FLUX.1 [dev]",
        node_type: "nodetool.image.TextToImage",
        params: { width: 1024, seed: 42 }
      }
    });
  });

  it("caps the prompt stored in metadata at 8000 chars", async () => {
    const image: Record<string, unknown> = { type: "image", data: PNG_B64 };
    const result = { image };
    await autoSaveAssets(
      result,
      saveOpts({ properties: { prompt: "p".repeat(9000) } })
    );
    const row = await Asset.find("1", image.asset_id as string);
    const prompt = (row?.metadata as Record<string, unknown>).prompt;
    expect(typeof prompt).toBe("string");
    expect((prompt as string).length).toBe(8000);
  });

  it("stores no metadata for a whitespace or non-string prompt and no index", async () => {
    for (const prompt of ["   ", 42]) {
      const image: Record<string, unknown> = { type: "image", data: PNG_B64 };
      await autoSaveAssets({ image }, saveOpts({ properties: { prompt } }));
      const row = await Asset.find("1", image.asset_id as string);
      expect(row?.metadata ?? null).toBeNull();
    }
  });

  it("honors an explicit mime_type and decodes an integer-array payload", async () => {
    const audio: Record<string, unknown> = {
      type: "audio",
      data: [1, 2, 3],
      mime_type: "audio/mpeg"
    };
    await autoSaveAssets({ audio }, saveOpts());
    const id = audio.asset_id as string;
    const row = await Asset.find("1", id);
    expect(row?.content_type).toBe("audio/mpeg");
    const bytes = await retrieveAssetBytes(getAssetAdapter(), "1", id, "audio/mpeg");
    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3]);
  });

  it("skips values already carrying an asset_id — replay is a no-op", async () => {
    const image: Record<string, unknown> = {
      type: "image",
      data: PNG_B64,
      asset_id: "already-saved"
    };
    const opts = saveOpts();
    await autoSaveAssets({ image }, opts);
    expect(image.asset_id).toBe("already-saved");
    // No media rows, and the media value still gates the JSON fallback.
    expect(await assetsForJob(opts.jobId)).toHaveLength(0);
  });

  it("skips undecodable payloads without creating rows", async () => {
    const bad1: Record<string, unknown> = { type: "image", data: 123 };
    const bad2: Record<string, unknown> = { type: "video", uri: "data:nocomma" };
    const bad3: Record<string, unknown> = { type: "image", data: [1.5, 2] };
    const bad4: Record<string, unknown> = {
      type: "image",
      uri: pathToFileURL(join(process.env.ASSET_FOLDER as string, "missing.bin")).href
    };
    const opts = saveOpts();
    await autoSaveAssets({ bad1, bad2, bad3, bad4 }, opts);
    for (const v of [bad1, bad2, bad3, bad4]) {
      expect(v.asset_id).toBeUndefined();
    }
    expect(await assetsForJob(opts.jobId)).toHaveLength(0);
  });

  it("reads bytes from a file:// uri", async () => {
    const p = join(process.env.ASSET_FOLDER as string, "src-image.png");
    writeFileSync(p, PNG_1x1);
    const image: Record<string, unknown> = {
      type: "image",
      uri: pathToFileURL(p).href
    };
    await autoSaveAssets({ image }, saveOpts());
    const id = image.asset_id as string;
    expect(image.uri).toBe(`asset://${id}.png`);
    const row = await Asset.find("1", id);
    expect(row?.size).toBe(PNG_1x1.length);
  });

  it("encodes raw RGBA to PNG and scrubs the raw pixels off the value", async () => {
    const raw: Record<string, unknown> = {
      type: "image",
      mimeType: RAW_RGBA_MIME,
      data: new Uint8Array(2 * 2 * 4).fill(128),
      width: 2,
      height: 2
    };
    await autoSaveAssets({ raw }, saveOpts());
    const id = raw.asset_id as string;
    expect(typeof id).toBe("string");
    expect(raw.data).toBeUndefined();
    expect(raw.mimeType).toBe("image/png");
    const row = await Asset.find("1", id);
    expect(row?.content_type).toBe("image/png");
    const bytes = await retrieveAssetBytes(getAssetAdapter(), "1", id, "image/png");
    // PNG signature — the stored asset is a real image, not raw pixels.
    expect(Array.from(bytes?.slice(0, 4) ?? [])).toEqual([137, 80, 78, 71]);
  });

  it("persists the primary text output as text/plain with an inline preview", async () => {
    const opts = saveOpts({ textOutputName: "answer", generationIndex: 5 });
    await autoSaveAssets({ answer: "hello world" }, opts);
    const rows = await assetsForJob(opts.jobId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.content_type).toBe("text/plain");
    expect(row.metadata).toEqual({ text: "hello world", generation_index: 5 });
    const bytes = await retrieveAssetBytes(getAssetAdapter(), "1", row.id, "text/plain");
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("hello world");
  });

  it("caps the inline text preview at 200000 bytes while storing the full text", async () => {
    const text = "t".repeat(250_000);
    const opts = saveOpts({ textOutputName: "answer" });
    await autoSaveAssets({ answer: text }, opts);
    const [row] = await assetsForJob(opts.jobId);
    expect(row.size).toBe(250_000);
    const preview = (row.metadata as Record<string, unknown>).text;
    expect((preview as string).length).toBe(200_000);
  });

  it("saves media and text together and never a redundant JSON copy", async () => {
    const image: Record<string, unknown> = { type: "image", data: PNG_B64 };
    const opts = saveOpts({ textOutputName: "answer" });
    await autoSaveAssets({ image, answer: "caption" }, opts);
    const rows = await assetsForJob(opts.jobId);
    expect(rows.map((r) => r.content_type).sort()).toEqual([
      "image/png",
      "text/plain"
    ]);
  });

  it("falls back to one application/json asset with the value inlined when small", async () => {
    const opts = saveOpts();
    await autoSaveAssets({ items: [1, 2], skipped: null, gone: undefined }, opts);
    const rows = await assetsForJob(opts.jobId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.content_type).toBe("application/json");
    // null/undefined entries are stripped before serialization.
    expect((row.metadata as Record<string, unknown>).json).toEqual({
      items: [1, 2]
    });
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      "1",
      row.id,
      "application/json"
    );
    expect(JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array()))).toEqual(
      { items: [1, 2] }
    );
  });

  it("omits the inline JSON copy when the value exceeds the cap", async () => {
    const opts = saveOpts({ generationIndex: 7 });
    await autoSaveAssets({ big: "x".repeat(250_000) }, opts);
    const [row] = await assetsForJob(opts.jobId);
    expect(row.content_type).toBe("application/json");
    const metadata = row.metadata as Record<string, unknown>;
    expect(metadata.json).toBeUndefined();
    expect(metadata.generation_index).toBe(7);
  });

  it("persists nothing for an empty structured result", async () => {
    // KNOWN BUG (not asserted here): a circular result — e.g.
    // `const r: Record<string, unknown> = { name: "loop" }; r.self = r` —
    // overflows the stack inside autoSaveAssets' `collect` walker before the
    // JSON.stringify try/catch can decline it. Reported, not fixed in this PR.
    const opts = saveOpts();
    await autoSaveAssets({ a: null, b: undefined }, opts);
    expect(await assetsForJob(opts.jobId)).toHaveLength(0);

    // A value JSON.stringify refuses (BigInt) declines the fallback cleanly.
    const optsBig = saveOpts();
    await autoSaveAssets({ big: 10n }, optsBig);
    expect(await assetsForJob(optsBig.jobId)).toHaveLength(0);
  });

  it("reports the configured asset storage path", () => {
    expect(getAssetStoragePath()).toBe(process.env.ASSET_FOLDER);
  });

  it("swallows storage failures on every persistence branch instead of throwing", async () => {
    // A NUL byte in the user id makes the file adapter's path invalid, so
    // adapter.store rejects inside each branch's try. The save must warn and
    // move on — a failed autosave must never take the relay down.
    const badUser = "u\0bad";
    const image: Record<string, unknown> = { type: "image", data: PNG_B64 };
    await expect(
      autoSaveAssets({ image }, saveOpts({ userId: badUser }))
    ).resolves.toBeUndefined();
    expect(image.asset_id).toBeUndefined();

    await expect(
      autoSaveAssets(
        { answer: "hello" },
        saveOpts({ userId: badUser, textOutputName: "answer" })
      )
    ).resolves.toBeUndefined();

    await expect(
      autoSaveAssets({ items: [1] }, saveOpts({ userId: badUser }))
    ).resolves.toBeUndefined();
  });

  it("routes an empty text output into the JSON fallback instead of a text asset", async () => {
    const opts = saveOpts({ textOutputName: "answer" });
    await autoSaveAssets({ answer: "" }, opts);
    const rows = await assetsForJob(opts.jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0].content_type).toBe("application/json");
  });
});
