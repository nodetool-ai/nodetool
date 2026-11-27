import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOUD_PROFILE_ENV, CLOUD_PROFILE_VALUE, NODE_ENV_VAR } from "@nodetool-ai/protocol";

const saveProjectAssetMock = vi.fn();

vi.mock("@nodetool-ai/asset-services/project-asset", () => ({
  saveProjectAsset: (...args: unknown[]) => saveProjectAssetMock(...args)
}));

vi.mock("@nodetool-ai/execution", () => ({
  generationsForNode: () => [],
  linkGenerationAssets: vi.fn()
}));

import { autoSaveAssets } from "../src/asset-autosave.js";

describe("autoSaveAssets file:// URI boundary", () => {
  let dir: string;
  let secretFile: string;
  const savedCloudProfile = process.env[CLOUD_PROFILE_ENV];
  const savedNodeEnv = process.env[NODE_ENV_VAR];

  beforeEach(async () => {
    saveProjectAssetMock.mockReset();
    saveProjectAssetMock.mockResolvedValue({
      id: "a".repeat(32),
      content_type: "image/png"
    });
    dir = await mkdtemp(join(tmpdir(), "nodetool-autosave-sec-"));
    secretFile = join(dir, "secret.txt");
    await writeFile(secretFile, "OPERATOR_SECRET=top-secret-value");
  });

  afterEach(async () => {
    if (savedCloudProfile === undefined) delete process.env[CLOUD_PROFILE_ENV];
    else process.env[CLOUD_PROFILE_ENV] = savedCloudProfile;
    if (savedNodeEnv === undefined) delete process.env[NODE_ENV_VAR];
    else process.env[NODE_ENV_VAR] = savedNodeEnv;
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses file:// URIs under the cloud profile so workflow outputs cannot read server files", async () => {
    process.env[CLOUD_PROFILE_ENV] = CLOUD_PROFILE_VALUE;
    const image: Record<string, unknown> = {
      type: "image",
      uri: pathToFileURL(secretFile).href
    };
    await autoSaveAssets(
      { image },
      { userId: "tenant-1", workflowId: null, jobId: "job-1", nodeId: "node-1" }
    );

    expect(saveProjectAssetMock).not.toHaveBeenCalled();
    expect(image.asset_id).toBeUndefined();
  });

  it("refuses file:// URIs in production mode when no profile override is set", async () => {
    delete process.env[CLOUD_PROFILE_ENV];
    process.env[NODE_ENV_VAR] = "production";
    const image: Record<string, unknown> = {
      type: "image",
      uri: pathToFileURL(secretFile).href
    };
    await autoSaveAssets(
      { image },
      { userId: "tenant-1", workflowId: null, jobId: "job-1", nodeId: "node-1" }
    );

    expect(saveProjectAssetMock).not.toHaveBeenCalled();
    expect(image.asset_id).toBeUndefined();
  });

  it("allows file:// URIs outside the cloud profile", async () => {
    process.env[CLOUD_PROFILE_ENV] = "local";
    process.env[NODE_ENV_VAR] = "development";
    const image: Record<string, unknown> = {
      type: "image",
      uri: pathToFileURL(secretFile).href
    };
    await autoSaveAssets(
      { image },
      { userId: "local-user", workflowId: null, jobId: "job-1", nodeId: "node-1" }
    );

    expect(saveProjectAssetMock).toHaveBeenCalledTimes(1);
    expect(image.asset_id).toBe("a".repeat(32));
  });
});
