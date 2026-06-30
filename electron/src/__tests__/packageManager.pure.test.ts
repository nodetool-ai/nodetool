import {
  getPackageDescription,
  needsTorchPlatformDetection,
  isRegistryWheelPackage,
  validateRepoId,
  selectRegistryWheelUrl,
} from "../packageManager";

describe("getPackageDescription", () => {
  it("returns override for known repo_id", () => {
    const desc = getPackageDescription({
      repo_id: "nodetool-ai/nodetool-core",
      description: "original",
    });
    expect(desc).toContain("Essential NodeTool");
  });

  it("is case-insensitive for repo_id overrides", () => {
    const desc = getPackageDescription({
      repo_id: "Nodetool-AI/Nodetool-Core",
      description: "original",
    });
    expect(desc).toContain("Essential NodeTool");
  });

  it("returns trimmed description when no override", () => {
    expect(
      getPackageDescription({ repo_id: "some/pkg", description: "  hello  " })
    ).toBe("hello");
  });

  it("returns empty string for missing description", () => {
    expect(
      getPackageDescription({ repo_id: "some/pkg", description: undefined })
    ).toBe("");
  });
});

describe("needsTorchPlatformDetection", () => {
  it("returns true for known torch-dependent packages", () => {
    expect(needsTorchPlatformDetection("nodetool-huggingface")).toBe(true);
    expect(needsTorchPlatformDetection("nunchaku")).toBe(true);
  });

  it("returns false for other packages", () => {
    expect(needsTorchPlatformDetection("nodetool-core")).toBe(false);
  });

  it("normalises dashes/underscores", () => {
    expect(needsTorchPlatformDetection("nodetool_huggingface")).toBe(true);
  });
});

describe("isRegistryWheelPackage", () => {
  it("returns true for nunchaku", () => {
    expect(isRegistryWheelPackage("nunchaku")).toBe(true);
  });

  it("returns false for arbitrary packages", () => {
    expect(isRegistryWheelPackage("nodetool-huggingface")).toBe(false);
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

describe("selectRegistryWheelUrl", () => {
  const baseOptions = {
    packageName: "nunchaku",
    pythonTag: "cp311",
    platformTag: "linux_x86_64",
    torchTag: "torch2.5",
    cudaTag: null,
  };

  const urls = [
    "https://example.com/nunchaku-0.2.1-cp311-cp311-linux_x86_64-torch2.5.whl",
    "https://example.com/nunchaku-0.3.0-cp311-cp311-linux_x86_64-torch2.5.whl",
    "https://example.com/nunchaku-0.3.0-cp310-cp310-linux_x86_64-torch2.5.whl",
    "https://example.com/otherpkg-1.0.0-cp311-cp311-linux_x86_64-torch2.5.whl",
  ];

  it("selects the latest matching version", () => {
    const result = selectRegistryWheelUrl(urls, baseOptions);
    expect(result).toContain("nunchaku-0.3.0");
    expect(result).toContain("cp311-cp311");
  });

  it("returns null when no urls match", () => {
    const result = selectRegistryWheelUrl(urls, {
      ...baseOptions,
      platformTag: "win_amd64",
    });
    expect(result).toBeNull();
  });

  it("returns null for empty url list", () => {
    expect(selectRegistryWheelUrl([], baseOptions)).toBeNull();
  });

  it("prefers CUDA-tagged wheels when cudaTag is set", () => {
    const cudaUrls = [
      "https://example.com/nunchaku-0.3.0-cp311-cp311-linux_x86_64-cu12.4torch2.5.whl",
      "https://example.com/nunchaku-0.3.0-cp311-cp311-linux_x86_64-torch2.5.whl",
    ];
    const result = selectRegistryWheelUrl(cudaUrls, {
      ...baseOptions,
      cudaTag: "cu12.4",
    });
    expect(result).toContain("cu12.4");
  });
});
