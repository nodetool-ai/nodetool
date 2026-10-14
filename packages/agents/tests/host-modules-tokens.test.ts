import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEncoding } from "js-tiktoken";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";

const load = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@nodetool-ai/config")>(),
  importOptionalModule: load
}));

beforeEach(() => {
  vi.resetModules();
  load.mockReset();
});

describe("sandbox token runtime package", () => {
  it("names the package and install command when missing", async () => {
    load.mockRejectedValue(new Error("Cannot find package 'js-tiktoken'"));
    const tokens = await import("../src/host-modules/tokens.js");
    for (const invoke of [() => tokens.count("hello"), () => tokens.encode("hello"), () => tokens.decode([15339])]) {
      const error = await invoke().catch((failure: unknown) => failure);
      expect(missingRuntimePackageOf(error)).toBe("tokenizer");
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) { throw new Error("expected a package error"); }
      expect(error.message).toContain("js-tiktoken");
    }
  });

  it("counts, encodes and decodes exactly when installed", async () => {
    load.mockResolvedValue({ getEncoding });
    const tokens = await import("../src/host-modules/tokens.js");
    const text = "Hello, 世界!";
    const ids = getEncoding("cl100k_base").encode(text);
    expect(await tokens.count(text)).toBe(ids.length);
    expect(await tokens.encode(text)).toEqual(ids);
    expect(await tokens.decode(ids)).toBe(text);
    expect(load).toHaveBeenCalledWith("js-tiktoken");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
