import { afterEach, describe, expect, it, vi } from "vitest";
import { base64ToBytes, bytesToBase64 } from "../src/base64.js";

type NativeBase64 = {
  fromBase64?: (text: string) => Uint8Array;
  prototype: { toBase64?: (this: Uint8Array) => string };
};
const native = Uint8Array as unknown as NativeBase64;

// Node has no Uint8Array.fromBase64 yet, so the tests install one that
// counts its calls. QuickJS and current browsers have the real methods.
function installNative(): { from: ReturnType<typeof vi.fn>; to: ReturnType<typeof vi.fn> } {
  const from = vi.fn((text: string) => {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new SyntaxError("bad base64");
    return new Uint8Array(Buffer.from(text, "base64"));
  });
  const to = vi.fn(function (this: Uint8Array) {
    return Buffer.from(this).toString("base64");
  });
  native.fromBase64 = from;
  native.prototype.toBase64 = to;
  return { from, to };
}

afterEach(() => {
  delete native.fromBase64;
  delete native.prototype.toBase64;
});

describe("base64 helpers", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
  const text = Buffer.from(bytes).toString("base64");

  it("round-trips without the native methods", () => {
    expect(bytesToBase64(bytes)).toBe(text);
    expect(base64ToBytes(text)).toEqual(bytes);
  });

  it("uses the native methods when the engine has them", () => {
    const { from, to } = installNative();
    expect(bytesToBase64(bytes)).toBe(text);
    expect(base64ToBytes(text)).toEqual(bytes);
    expect(from).toHaveBeenCalledOnce();
    expect(to).toHaveBeenCalledOnce();
  });

  it("falls back to atob for text the native decoder rejects", () => {
    installNative();
    // atob skips the whitespace that the strict test decoder rejects.
    expect(base64ToBytes(`${text.slice(0, 4)} ${text.slice(4)}`)).toEqual(bytes);
    expect(() => base64ToBytes("not*base64")).toThrow();
  });
});
