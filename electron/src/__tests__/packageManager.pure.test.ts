import {
  getRuntimePackageStatuses,
  needsTorchPlatformDetection,
  validateRepoId,
} from "../packageManager";
import { runtimeRegistry } from "../runtime/packages/registry";

describe("needsTorchPlatformDetection", () => {
  it("returns true for known torch-dependent packages", () => {
    expect(needsTorchPlatformDetection("nodetool-huggingface")).toBe(true);
  });

  it("returns false for other packages", () => {
    expect(needsTorchPlatformDetection("nodetool-core")).toBe(false);
  });

  it("normalises dashes/underscores", () => {
    expect(needsTorchPlatformDetection("nodetool_huggingface")).toBe(true);
  });
});

describe("validateRepoId", () => {
  it("accepts valid owner/project format", () => {
    expect(validateRepoId("nodetool-ai/nodetool-core")).toEqual({
      valid: true,
    });
  });

  it("rejects empty string", () => {
    const result = validateRepoId("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects single segment without slash", () => {
    const result = validateRepoId("nodetool");
    expect(result.valid).toBe(false);
  });

  it("rejects leading hyphens", () => {
    expect(validateRepoId("-owner/project").valid).toBe(false);
    expect(validateRepoId("owner/-project").valid).toBe(false);
  });

  it("rejects special characters", () => {
    expect(validateRepoId("owner/pro ject").valid).toBe(false);
    expect(validateRepoId("owner/pro@ject").valid).toBe(false);
  });
});

describe("getRuntimePackageStatuses", () => {
  afterEach(() => jest.restoreAllMocks());

  it("passes an npm package's installed and pinned versions to the renderer", async () => {
    jest.spyOn(runtimeRegistry, "statuses").mockResolvedValue([
      {
        id: "tensorflow-js",
        installed: true,
        installedVersion: "4.20.0",
        latestVersion: "4.22.0",
        updateAvailable: true,
      },
    ]);
    const [status] = await getRuntimePackageStatuses();
    expect(status).toMatchObject({
      id: "tensorflow-js",
      name: "TensorFlow.js Models",
      installed: true,
      installedVersion: "4.20.0",
      latestVersion: "4.22.0",
      updateAvailable: true,
    });
  });
});
