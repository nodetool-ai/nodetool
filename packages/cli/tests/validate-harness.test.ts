import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

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

const { runValidate } = await import("../src/validate/index.js");
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
