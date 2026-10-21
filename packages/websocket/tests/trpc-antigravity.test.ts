import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { antigravityRouter } from "../src/trpc/routers/antigravity.js";
import type { Context } from "../src/trpc/context.js";
import {
  getAntigravityPlatform,
  installAntigravity,
  resolveAntigravityCommand
} from "@nodetool-ai/antigravity-cli";

vi.mock("@nodetool-ai/antigravity-cli", () => ({
  getAntigravityBinaryPath: () => "/nodetool/bin/antigravity/agy",
  getAntigravityPlatform: vi.fn(() => "darwin_arm64"),
  installAntigravity: vi.fn(),
  resolveAntigravityCommand: vi.fn()
}));

function caller(userId: string | null = "1") {
  // This router only reads the authenticated user, not the runtime dependencies.
  return antigravityRouter.createCaller({ userId } as unknown as Context);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_NODE_PROFILE", "full");
  vi.mocked(getAntigravityPlatform).mockReturnValue("darwin_arm64");
  vi.mocked(resolveAntigravityCommand).mockResolvedValue("agy");
  vi.mocked(installAntigravity).mockResolvedValue(
    "/nodetool/bin/antigravity/agy"
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("Antigravity installation settings", () => {
  it("requires authentication", async () => {
    await expect(caller(null).install()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
    expect(installAntigravity).not.toHaveBeenCalled();
  });
  it("reports missing and installed binaries with a copyable command", async () => {
    expect(await caller().status()).toMatchObject({
      available: true,
      installed: false,
      command: null
    });
    vi.mocked(resolveAntigravityCommand).mockResolvedValue(
      "/nodetool/bin/antigravity/agy"
    );
    expect(await caller().status()).toMatchObject({
      installed: true,
      command: "'/nodetool/bin/antigravity/agy'"
    });
  });
  it.each(["cloud", "production"])(
    "rejects %s installations without disclosing paths",
    async (mode) => {
      if (mode === "cloud") vi.stubEnv("NODETOOL_NODE_PROFILE", "cloud");
      else vi.stubEnv("NODETOOL_ENV", "production");
      expect(await caller().status()).toMatchObject({
        available: false,
        command: null
      });
      await expect(caller().install()).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
      expect(installAntigravity).not.toHaveBeenCalled();
    }
  );
  it("disables unsupported platforms", async () => {
    vi.mocked(getAntigravityPlatform).mockImplementation(() => {
      throw new Error("Unsupported");
    });
    expect(await caller().status()).toMatchObject({ available: false });
    await expect(caller().install()).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });
  it("shares a pending install across callers and reports progress", async () => {
    let finish: (value: string) => void = () => undefined;
    vi.mocked(installAntigravity).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const first = caller().install();
    await vi.waitFor(() => expect(installAntigravity).toHaveBeenCalledTimes(1));
    expect(await caller().status()).toMatchObject({ installing: true });
    const second = caller().install();
    finish("/nodetool/bin/antigravity/agy");
    await expect(first).resolves.toEqual({ installed: true });
    await expect(second).resolves.toEqual({ installed: true });
    expect(installAntigravity).toHaveBeenCalledTimes(1);
    expect(await caller().status()).toMatchObject({ installing: false });
  });
  it("reports failure and allows retry", async () => {
    vi.mocked(installAntigravity).mockRejectedValueOnce(
      new Error("checksum mismatch")
    );
    await expect(caller().install()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED"
    });
    expect(await caller().status()).toMatchObject({ installing: false });
    await expect(caller().install()).resolves.toEqual({ installed: true });
  });
});
