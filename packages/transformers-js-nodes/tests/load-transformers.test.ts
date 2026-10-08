import { describe, expect, it, vi } from "vitest";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";

const importOptionalModule = vi.hoisted(() => vi.fn());

vi.mock("@nodetool-ai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/config")>()),
  importOptionalModule
}));

const { loadTransformers } = await import("../src/transformers-base.js");

describe("loadTransformers", () => {
  it("loads the package after a failed import, without a restart", async () => {
    importOptionalModule.mockRejectedValueOnce(
      new Error("Cannot find module '@huggingface/transformers'")
    );
    const failure = await loadTransformers().catch((err: unknown) => err);
    expect(missingRuntimePackageOf(failure)).toBe("transformers-js");

    const installed = { pipeline: vi.fn() };
    importOptionalModule.mockResolvedValueOnce(installed);
    await expect(loadTransformers()).resolves.toBe(installed);
  });
});
