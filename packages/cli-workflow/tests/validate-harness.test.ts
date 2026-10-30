import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const { buildRegistry } = vi.hoisted(() => ({ buildRegistry: vi.fn(async () => ({ has: () => true })) }));
vi.mock("@nodetool-ai/cli-execution/node-registry", () => ({ buildFullRegistry: buildRegistry }));
vi.mock("@nodetool-ai/pack-manager/command-errors", () => ({ printCommandError: vi.fn() }));
vi.mock("@nodetool-ai/execution/missing-packs", () => ({ findMissingPacks: async () => null }));

const cleanReport = {
  ok: true,
  nodeCount: 1,
  edgeCount: 0,
  counts: { errors: 0, warnings: 0, info: 0 },
  issues: []
};

// The CLI Vitest harness replaces unbuilt workspaces with empty modules.
// Supply only the exports this integration seam calls.
vi.mock("@nodetool-ai/node-sdk", () => ({
  collectSecretRequirementSites: () => [],
  validateGraph: () => cleanReport
}));

vi.mock("@nodetool-ai/runtime", () => ({
  listRegisteredProviderIds: () => [],
  listOfflineModelIds: () => undefined
}));

const { runValidate } = await import("@nodetool-ai/cli-execution/validate/index");
const { collectAvailableSecrets } = await import("../src/commands/validate.js");

describe("runValidate", () => {
  it("does not resolve stored credentials for a JSON file target", async () => {
    const availableSecrets = vi.fn(async () => new Set<string>());
    const file = fileURLToPath(
      new URL(
        "../../../examples/workflows/hello_input_output_cli.json",
        import.meta.url
      )
    );

    const result = await runValidate(file, {
      loadFromDb: async () => {
        throw new Error("file validation must not load the database");
      },
      registry: {
        has: () => true,
        getMetadata: () => undefined,
        validateNode: () => []
      },
      availableSecrets
    });

    expect(result.target.source).toBe("json");
    expect(availableSecrets).not.toHaveBeenCalled();
  });
});

describe("collectAvailableSecrets", () => {
  it("uses exact required-setting names and rejects empty values", async () => {
    const values: Record<string, string> = {
      FAL_KEY: "alias-only",
      EMPTY_KEY: ""
    };

    await expect(
      collectAvailableSecrets(["FAL_API_KEY", "EMPTY_KEY"], (key) =>
        Promise.resolve(values[key])
      )
    ).resolves.toEqual(new Set());
  });
});

describe("shared async validation registry", () => {
  const file = fileURLToPath(new URL("../../../examples/workflows/hello_input_output_cli.json", import.meta.url));
  const deps = { loadFromDb: async () => null };

  it("shares one in-flight registration across concurrent validations", async () => {
    vi.resetModules();
    buildRegistry.mockClear();
    const { runValidate } = await import("@nodetool-ai/cli-execution/validate/index");
    const reports = await Promise.all([runValidate(file, deps), runValidate(file, deps)]);
    expect(reports.map(result => result.report.ok)).toEqual([true, true]);
    expect(buildRegistry).toHaveBeenCalledTimes(1);
  });

  it("retries registration after a failed load", async () => {
    vi.resetModules();
    buildRegistry.mockClear();
    buildRegistry.mockRejectedValueOnce(new Error("pack initialization failed"));
    const { runValidate } = await import("@nodetool-ai/cli-execution/validate/index");
    await expect(runValidate(file, deps)).rejects.toThrow("pack initialization failed");
    await expect(runValidate(file, deps)).resolves.toMatchObject({ report: { ok: true } });
    expect(buildRegistry).toHaveBeenCalledTimes(2);
  });
});
