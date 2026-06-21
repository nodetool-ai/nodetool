/**
 * Graceful-degradation tests for the image-io.ts sharp loader.
 *
 * `loadSharp` must resolve `null` — never an opaque module-load throw — when the
 * `sharp` native addon can't load on Node (musl, unbundled serverless, ABI
 * mismatch). The Node encode path then either falls back to OffscreenCanvas (if
 * the runtime has one) or throws a clear, actionable error that names `sharp`
 * and how to `install` it. A rejected load attempt is never cached, so a fixed
 * install is picked up on the next call.
 *
 * These mock `@nodetool-ai/config` so `importHidden("sharp")` is driven per-test,
 * forcing `IS_NODE: true` so the Node branch of `encodeRgbaToPng` is exercised,
 * and re-import the module fresh on every case (resetting the module-local
 * `_sharpPromise` cache).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function rawPixel(): Uint8Array {
  // one opaque red pixel, straight-alpha RGBA8
  return new Uint8Array([255, 0, 0, 255]);
}

describe("image-io loadSharp graceful degradation", () => {
  // Per-test handler for the mocked importHidden. Reassigned by each test.
  let importHiddenImpl: (name: string) => Promise<unknown>;

  beforeEach(() => {
    vi.resetModules();
    importHiddenImpl = async () => null;
    vi.doMock("@nodetool-ai/config", () => ({
      importHidden: (name: string) => importHiddenImpl(name),
      // Force the Node branch of encodeRgbaToPng. Other config exports that the
      // module graph may touch are stubbed minimally.
      IS_NODE: true,
      importNodeBuiltin: async (name: string) => import(name)
    }));
  });

  async function freshImageIo() {
    return import("../src/nodes/image-io.js");
  }

  it("loadSharp resolves null (never rejects) when importHidden throws", async () => {
    importHiddenImpl = async () => {
      throw new Error(
        "Cannot find module '@img/sharp-linux-x64' (native addon missing)"
      );
    };
    const { loadSharp } = await freshImageIo();
    await expect(loadSharp()).resolves.toBeNull();
  });

  it("loadSharp resolves null when importHidden resolves null (off Node)", async () => {
    importHiddenImpl = async () => null;
    const { loadSharp } = await freshImageIo();
    await expect(loadSharp()).resolves.toBeNull();
  });

  it("encodeRgbaToPng falls back to Canvas (PNG) or throws a clear sharp message", async () => {
    importHiddenImpl = async () => {
      throw new Error("Cannot find module '@img/sharp-linux-x64'");
    };
    const { encodeRgbaToPng, SHARP_UNAVAILABLE_MESSAGE } = await freshImageIo();

    if (typeof OffscreenCanvas !== "undefined") {
      // Runtime has a Canvas fallback: must encode to a real PNG.
      const png = await encodeRgbaToPng(rawPixel(), 1, 1);
      expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
    } else {
      // No Canvas (plain Node test env): must reject with a clear, actionable
      // error that names sharp and how to install it — never the opaque
      // module-load message.
      let caught: unknown;
      try {
        await encodeRgbaToPng(rawPixel(), 1, 1);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      const message = (caught as Error).message;
      expect(message).toBe(SHARP_UNAVAILABLE_MESSAGE);
      expect(message.toLowerCase()).toContain("sharp");
      expect(message.toLowerCase()).toContain("install");
      // The opaque addon-resolution text must NOT leak through.
      expect(message).not.toContain("@img/sharp-linux-x64");
      expect(message).not.toContain("Cannot find module");
    }
  });

  it("does not cache a rejected load attempt: a later working sharp succeeds", async () => {
    let calls = 0;
    importHiddenImpl = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("Cannot find module '@img/sharp-linux-x64'");
      }
      // Second attempt: a healthy sharp factory that emits a PNG-signed buffer.
      return fakeSharp;
    };
    const { loadSharp } = await freshImageIo();

    // First attempt fails → resolves null, must NOT pin the failure.
    await expect(loadSharp()).resolves.toBeNull();

    // Second call re-attempts the import (rejection not cached) and now returns
    // the working sharp factory.
    const sharp = await loadSharp();
    expect(sharp).toBe(fakeSharp);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Minimal stand-in for the `sharp` callable used only to prove the loader
 * re-attempted the import after an earlier failure and handed back the module.
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
