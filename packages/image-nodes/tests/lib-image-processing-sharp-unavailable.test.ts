/**
 * Graceful-degradation tests for the lib-image-utils.ts sharp loader.
 *
 * `toFloatRGB` / `fromFloatRGB` have no browser/edge fallback — they require
 * `sharp`. When the loader resolves null (off Node, or a broken Node addon)
 * they must throw a CLEAR, actionable error that names `sharp` and how to
 * `install` it, never an opaque module-load throw. And because the loader never
 * caches a rejected attempt, a later call after sharp is restored succeeds.
 *
 * These mock `@nodetool-ai/config` so `importHidden("sharp")` is driven per-test
 * and re-import the module fresh on every case (resetting the module-local
 * `_sharpPromise` cache).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("lib-image-utils float-RGB helpers without a working sharp", () => {
  // Per-test handler for the mocked importHidden. Reassigned by each test.
  let importHiddenImpl: (name: string) => Promise<unknown>;

  beforeEach(() => {
    vi.resetModules();
    importHiddenImpl = async () => null;
    vi.doMock("@nodetool-ai/config", () => ({
      importHidden: (name: string) => importHiddenImpl(name),
      IS_NODE: true,
      importNodeBuiltin: async (name: string) => import(name)
    }));
  });

  async function freshUtils() {
    return import("../src/nodes/lib-image-utils.js");
  }

  it("toFloatRGB throws a clear sharp/install message when sharp fails to load", async () => {
    importHiddenImpl = async () => {
      throw new Error(
        "Cannot find module '@img/sharp-linux-x64' (native addon missing)"
      );
    };
    const { toFloatRGB } = await freshUtils();

    let caught: unknown;
    try {
      await toFloatRGB(Buffer.from([0, 0, 0, 0]));
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
  });

  it("fromFloatRGB throws a clear sharp/install message when sharp resolves null", async () => {
    importHiddenImpl = async () => null;
    const { fromFloatRGB } = await freshUtils();

    let caught: unknown;
    try {
      await fromFloatRGB(new Float32Array([0, 0, 0]), 1, 1);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message.toLowerCase()).toContain("sharp");
    expect(message.toLowerCase()).toContain("install");
  });

  it("does not cache a rejected load attempt: fromFloatRGB succeeds after sharp is restored", async () => {
    let calls = 0;
    importHiddenImpl = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("Cannot find module '@img/sharp-linux-x64'");
      }
      return fakeSharp;
    };
    const { fromFloatRGB } = await freshUtils();

    // First attempt: sharp broken → loader resolves null → helper throws.
    await expect(
      fromFloatRGB(new Float32Array([0, 0, 0]), 1, 1)
    ).rejects.toThrow(/sharp/i);

    // Second call re-attempts the import (rejection not cached) and now
    // succeeds via the fake sharp.
    const out = await fromFloatRGB(new Float32Array([1, 0, 0]), 1, 1);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Minimal stand-in for the `sharp` callable covering the `fromFloatRGB` chain:
 * `sharp(out, { raw }).png().toBuffer()` resolves a Buffer.
 */
const fakeSharp: unknown = (_input: unknown, _opts?: unknown) => ({
  png() {
    return {
      async toBuffer() {
        return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      }
    };
  }
});
