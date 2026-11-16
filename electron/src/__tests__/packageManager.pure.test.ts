import { getRuntimePackageStatuses, validateRepoId } from "../packageManager";
import { getDesktopRuntimeRegistry } from "../runtimeHost";

const runtimeRegistry = getDesktopRuntimeRegistry();

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

  it("passes bundled library status to the renderer", async () => {
    jest.spyOn(runtimeRegistry, "statuses").mockResolvedValue([{ id: "imaging", installed: true, bundled: true }]);
    const [status] = await getRuntimePackageStatuses();
    expect(status).toMatchObject({ id: "imaging", installed: true, bundled: true });
  });

  it("passes an npm package's installed and pinned versions to the renderer", async () => {
    jest.spyOn(runtimeRegistry, "statuses").mockResolvedValue([
      {
        id: "transformers-js",
        installed: true,
        installedVersion: "3.7.0",
        latestVersion: "3.8.1",
        updateAvailable: true,
      },
    ]);
    const [status] = await getRuntimePackageStatuses();
    expect(status).toMatchObject({
      id: "transformers-js",
      name: "Transformers.js",
      installed: true,
      installedVersion: "3.7.0",
      latestVersion: "3.8.1",
      updateAvailable: true,
    });
  });
});
