/**
 * Mutation-hardening tests for the raw-RGBA → PNG image codec.
 *
 * Pins that raw straight-alpha RGBA8 pixels encode to a real PNG, and that
 * `encodeRawImageRef` converts only raw refs (rewriting data + mimeType) while
 * passing everything else through untouched. See MUTATION_TESTING.md.
 *
 * Also covers the graceful sharp loader: when the `sharp` native addon can't
 * load, `loadSharp` resolves null (never an opaque module-load throw) and
 * `encodeRawRgbaToPng` either falls back to OffscreenCanvas (if the runtime
 * has one) or rejects with a clear, actionable message that names `sharp` and
 * how to `install` it — and a rejected load attempt is never cached.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeRawRgbaToPng, encodeRawImageRef } from "../src/image-codec.js";
import { RAW_RGBA_MIME, type ImageRef } from "@nodetool-ai/protocol";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function rawPixel(): Uint8Array {
  // one opaque red pixel, straight-alpha RGBA8
  return new Uint8Array([255, 0, 0, 255]);
}

describe("encodeRawRgbaToPng", () => {
  it("produces PNG-signed bytes from raw RGBA", async () => {
    const png = await encodeRawRgbaToPng(rawPixel(), 1, 1);
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it("encodes the given dimensions (2x1 differs from 1x1)", async () => {
    const onePx = await encodeRawRgbaToPng(rawPixel(), 1, 1);
    const twoPx = await encodeRawRgbaToPng(
      new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      2,
      1
    );
    // Both valid PNGs, but different pixel data ⇒ different bytes.
    expect(Buffer.from(twoPx).equals(Buffer.from(onePx))).toBe(false);
  });
});

describe("encodeRawImageRef", () => {
  it("converts a raw-RGBA ref to a PNG ref", async () => {
    const ref: ImageRef = {
      type: "image",
      data: rawPixel(),
      width: 1,
      height: 1,
      mimeType: RAW_RGBA_MIME
    } as ImageRef;
    const out = (await encodeRawImageRef(ref)) as ImageRef;
    expect(out.mimeType).toBe("image/png");
    expect(Array.from((out.data as Uint8Array).slice(0, 8))).toEqual(
      PNG_SIGNATURE
    );
  });

  it("returns a non-raw ref unchanged (same reference)", async () => {
    const ref = { type: "image", uri: "asset://x.png" };
    expect(await encodeRawImageRef(ref)).toBe(ref);
  });

  it("returns a non-image value unchanged", async () => {
    expect(await encodeRawImageRef("not-a-ref")).toBe("not-a-ref");
    expect(await encodeRawImageRef(null)).toBe(null);
  });
});

/**
 * Graceful-degradation tests for the sharp loader. These mock `@nodetool-ai/config`
 * so `importHidden("sharp")` is driven per-test, and re-import the codec module
 * fresh (resetting its module-local `_sharpPromise` cache) on every case.
 */
describe("encodeRawRgbaToPng without a working sharp", () => {
  // Per-test handler for the mocked importHidden. Reassigned by each test.
  let importHiddenImpl: (name: string) => Promise<unknown>;

  beforeEach(() => {
    vi.resetModules();
    importHiddenImpl = async () => null;
    vi.doMock("@nodetool-ai/config", () => ({
      importHidden: (name: string) => importHiddenImpl(name),
      // Other exports the module may pull from config; unused here.
      IS_NODE: true
    }));
  });

  async function freshCodec() {
    return import("../src/image-codec.js");
  }

  it("rejects with an actionable sharp/install message (or returns PNG via OffscreenCanvas) when sharp fails to load", async () => {
    // importHidden THROWS on Node when the native addon is missing/broken —
    // the loader must swallow it (resolve null), never surface an opaque
    // module-load error.
    importHiddenImpl = async () => {
      throw new Error(
        "Cannot find module '@img/sharp-linux-x64' (native addon missing)"
      );
    };
    const { encodeRawRgbaToPng: encode } = await freshCodec();

    if (typeof OffscreenCanvas !== "undefined") {
      // Runtime has a Canvas fallback: must encode to a real PNG.
      const png = await encode(rawPixel(), 1, 1);
      expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
    } else {
      // No Canvas (plain Node test env): must reject with a clear, actionable
      // error that names sharp and how to install it — never the opaque
      // module-load message.
      let caught: unknown;
      try {
        await encode(rawPixel(), 1, 1);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      const message = (caught as Error).message;
      expect(message.toLowerCase()).toContain("sharp");
      expect(message.toLowerCase()).toContain("install");
      // The opaque addon-resolution text must NOT leak through.
      expect(message).not.toContain("@img/sharp-linux-x64");
      expect(message).not.toContain("Cannot find module");
    }
  });

  it("does not cache a rejected load attempt: a later working sharp succeeds", async () => {
    // First attempt: importHidden throws (addon broken) → loadSharp resolves
    // null → encode rejects (no Canvas) or falls back to Canvas.
    let calls = 0;
    importHiddenImpl = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("Cannot find module '@img/sharp-linux-x64'");
      }
      // Second attempt: a healthy sharp factory that emits a PNG-signed buffer.
      return fakeSharp;
    };
    const { encodeRawRgbaToPng: encode } = await freshCodec();

    // Drive the first (failing) attempt. With no Canvas it rejects; with a
    // Canvas it succeeds via fallback. Either way it must not pin the failure.
    if (typeof OffscreenCanvas === "undefined") {
      await expect(encode(rawPixel(), 1, 1)).rejects.toThrow(/sharp/i);
    } else {
      await encode(rawPixel(), 1, 1);
    }

    // Second call must re-attempt the import (rejection not cached) and now
    // succeed via the fake sharp, returning PNG-signed bytes.
    const png = await encode(rawPixel(), 1, 1);
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Minimal stand-in for the `sharp` callable. `sharp(buf, opts).png().toBuffer()`
 * resolves a Buffer beginning with the PNG signature — enough to prove the
 * codec re-loaded and used it after an earlier failed attempt.
 */
const fakeSharp: unknown = (_input: unknown, _opts?: unknown) => ({
  png() {
    return {
      async toBuffer() {
        return Buffer.from([...PNG_SIGNATURE, 0, 0, 0, 0]);
      }
    };
  }
});
