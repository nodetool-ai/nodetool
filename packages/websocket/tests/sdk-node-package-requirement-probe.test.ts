import { describe, expect, it, vi } from "vitest";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { createNodeToolSdkV1NodePackageProbe } from "../src/sdk/sdk-node-package-requirement-probe.js";

const requirement: SdkV1Requirement = {
  kind: "node_pack",
  id: "@nodetool-ai/image-nodes",
  name: "@nodetool-ai/image-nodes",
  status: "unknown",
  blocking: true,
  message: null
};

describe("NodeTool SDK v1 node package probe", () => {
  it("uses exact package identities in the principal's local inventory", async () => {
    const listInstalledPackageIds = vi.fn(async () => [
      "@nodetool-ai/image-nodes"
    ]);
    const probe = createNodeToolSdkV1NodePackageProbe({
      userId: "alice",
      listInstalledPackageIds
    });

    await expect(probe(requirement)).resolves.toEqual({
      status: "available",
      message: null
    });
    expect(listInstalledPackageIds).toHaveBeenCalledExactlyOnceWith("alice");
  });

  it("does not treat namespace-like partial matches as installed", async () => {
    const probe = createNodeToolSdkV1NodePackageProbe({
      userId: "alice",
      listInstalledPackageIds: () => ["image-nodes"]
    });

    await expect(probe(requirement)).resolves.toEqual({
      status: "missing",
      message: "Required node package is not installed."
    });
  });

  it("reports inventory failures conservatively", async () => {
    const probe = createNodeToolSdkV1NodePackageProbe({
      userId: "alice",
      listInstalledPackageIds: async () => {
        throw new Error("private package path");
      }
    });

    const result = await probe(requirement);
    expect(result).toEqual({
      status: "unknown",
      message: "Node package inventory could not be checked."
    });
    expect(JSON.stringify(result)).not.toContain("private package path");
  });
});
