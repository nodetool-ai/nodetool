import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const ASSET_FILE = "775ac6fedf9e4c9db271148c6e853b4d.png";

let ownsAsset: (userId: string, assetId: string) => boolean;
vi.mock("@nodetool-ai/models", () => ({
  Asset: {
    find: async (userId: string, assetId: string) =>
      ownsAsset(userId, assetId) ? { id: assetId, user_id: userId } : null
  }
}));

import { createStorageHandler } from "../src/storage-api.js";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-api-flat-regress-"));
  ownsAsset = (userId, assetId) => userId === "user-1" && assetId === "775ac6fedf9e4c9db271148c6e853b4d";
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeHandler() {
  return createStorageHandler({ storagePath: tmpDir });
}
function makeRequest(urlPath: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${urlPath}`, { method: "GET", headers });
}

describe("storage-api flat asset reference regression", () => {
  it("serves flat asset:// reference via owner-prefixed object", async () => {
    const handler = makeHandler();
    await fs.mkdir(path.join(tmpDir, "user-1"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "user-1", ASSET_FILE), "prefixed-bytes");
    // Also create flat file to ensure prefixed is preferred
    await fs.writeFile(path.join(tmpDir, ASSET_FILE), "flat-bytes");

    const res = await handler(makeRequest(`/api/storage/${ASSET_FILE}`, { "x-user-id": "user-1" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("prefixed-bytes");
  });

  it("falls back to flat when prefixed missing", async () => {
    const handler = makeHandler();
    await fs.writeFile(path.join(tmpDir, ASSET_FILE), "flat-only");

    const res = await handler(makeRequest(`/api/storage/${ASSET_FILE}`, { "x-user-id": "user-1" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("flat-only");
  });

  it("still hides flat asset from non-owner", async () => {
    const handler = makeHandler();
    await fs.mkdir(path.join(tmpDir, "user-1"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "user-1", ASSET_FILE), "secret");

    const res = await handler(makeRequest(`/api/storage/${ASSET_FILE}`, { "x-user-id": "user-2" }));
    expect(res.status).toBe(404);
  });
});
