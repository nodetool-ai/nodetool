import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@nodetool-ai/config", async (original) => ({
  ...(await original<typeof import("@nodetool-ai/config")>()),
  importOptionalModule: mocks.load
}));

const originalPlatform = process.platform;
function setPlatform(platform: string): void {
  Object.defineProperty(process, "platform", { value: platform });
}

// The first import transforms binding.js and the real @nodetool-ai/config,
// which can outlast a test's 5s timeout on a loaded CI runner. Later
// imports after resetModules reuse the transformed code.
beforeAll(async () => {
  await import("../src/binding.js");
}, 60_000);

beforeEach(() => {
  vi.resetModules();
  mocks.load.mockReset();
});
afterEach(() => {
  setPlatform(originalPlatform);
  vi.unstubAllEnvs();
});

it("keeps the failed specifier, cause, and source install command on the loader error", async () => {
  vi.stubEnv("NODETOOL_HOST", "source");
  const cause = new Error("fixture binding unavailable");
  mocks.load.mockRejectedValue(cause);
  const { loadWhisperNode } = await import("../src/binding.js");
  const error = await loadWhisperNode().catch((failure: unknown) => failure);
  expect(error).toMatchObject({ cause, details: { runtimePackage: "whisper-cpp", missing: "@fugood/whisper.node" } });
  expect(String(error)).toContain("npm run dev:nodetool -- runtime add whisper-cpp");
  expect(String(error)).not.toContain("Package Manager");
});

it("keeps an explicit backend without probing", async () => {
  const { resolveVariant } = await import("../src/binding.js");
  expect(await resolveVariant("cuda")).toBe("cuda");
  expect(await resolveVariant("vulkan")).toBe("vulkan");
  expect(await resolveVariant("cpu")).toBe("default");
  expect(await resolveVariant("metal")).toBe("default");
  expect(mocks.load).not.toHaveBeenCalled();
});

it("auto on Linux uses the CUDA build when it loads", async () => {
  setPlatform("linux");
  mocks.load.mockResolvedValue({});
  const { resolveVariant } = await import("../src/binding.js");
  expect(await resolveVariant("auto")).toBe("cuda");
});

it("auto on Windows falls back to Vulkan, then the default build", async () => {
  setPlatform("win32");
  mocks.load.mockImplementation(async (name: string) => {
    if (name.endsWith("-vulkan")) return {};
    throw new Error("cannot load");
  });
  const { resolveVariant } = await import("../src/binding.js");
  expect(await resolveVariant(undefined)).toBe("vulkan");

  vi.resetModules();
  mocks.load.mockRejectedValue(new Error("cannot load"));
  const fresh = await import("../src/binding.js");
  expect(await fresh.resolveVariant("auto")).toBe("default");
});

it("auto on macOS uses the default (Metal) build", async () => {
  setPlatform("darwin");
  const { resolveVariant } = await import("../src/binding.js");
  expect(await resolveVariant("auto")).toBe("default");
  expect(mocks.load).not.toHaveBeenCalled();
});
