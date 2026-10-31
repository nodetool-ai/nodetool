import { afterEach, describe, expect, it, vi } from "vitest";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";

const importOptionalModule = vi.hoisted(() => vi.fn());

vi.mock("@nodetool-ai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/config")>()),
  importOptionalModule
}));

const { loadTransformers } = await import("../src/transformers-base.js");
afterEach(() => { vi.unstubAllEnvs(); });

describe("loadTransformers", () => {
  it("loads the package after a failed import, without a restart", async () => {
    vi.stubEnv("NODETOOL_HOST", "source");
    const cause = new Error("Cannot find module '@huggingface/transformers'");
    importOptionalModule.mockRejectedValueOnce(cause);
    const failure = await loadTransformers().catch((err: unknown) => err);
    expect(missingRuntimePackageOf(failure)).toBe("transformers-js");
    expect(failure).toMatchObject({ cause, details: { missing: "@huggingface/transformers" } });
    expect(String(failure)).toContain("npm run dev:nodetool -- packs add transformers-js --yes");
    expect(String(failure)).not.toContain("Package Manager");

    const installed = { pipeline: vi.fn() };
    importOptionalModule.mockResolvedValueOnce(installed);
    await expect(loadTransformers()).resolves.toBe(installed);
  });
});
