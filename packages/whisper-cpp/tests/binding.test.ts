import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@nodetool-ai/config", async (original) => ({
  ...(await original<typeof import("@nodetool-ai/config")>()),
  importOptionalModule: mocks.load
}));

const originalPlatform = process.platform;
function setPlatform(platform: string): void {
  Object.defineProperty(process, "platform", { value: platform });
}

beforeEach(() => {
  vi.resetModules();
  mocks.load.mockReset();
});
afterEach(() => {
  setPlatform(originalPlatform);
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
