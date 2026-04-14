import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, Asset } from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function makeRequest(
  url: string,
  opts: { method?: string; userId?: string; body?: unknown } = {}
): Request {
  const { method = "GET", userId = "user-1", body } = opts;
  const headers: Record<string, string> = { "x-user-id": userId };
  let requestBody: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: requestBody
  });
}

describe("HTTP API: assets", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("creates an asset via POST /api/assets", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "photo.png",
          content_type: "image/png",
          parent_id: "user-1",
          metadata: { width: 800 }
        }
      })
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.name).toBe("photo.png");
    expect(data.content_type).toBe("image/png");
    expect(data.parent_id).toBe("user-1");
    expect(data.user_id).toBe("user-1");
    expect(data.metadata).toEqual({ width: 800 });
    expect(typeof data.id).toBe("string");
  });

  it("gets an asset by ID via GET /api/assets/:id", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "doc.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const assetId = String(created.id);

    const getRes = await handleApiRequest(
      makeRequest(`/api/assets/${assetId}`)
    );
    expect(getRes.status).toBe(200);
    const got = (await jsonBody(getRes)) as Record<string, unknown>;
    expect(got.id).toBe(assetId);
    expect(got.name).toBe("doc.txt");
  });

  it("returns virtual Home folder when id equals user_id", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets/user-1", { userId: "user-1" })
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.id).toBe("user-1");
    expect(data.name).toBe("Home");
    expect(data.content_type).toBe("folder");
    expect(data.parent_id).toBe("");
  });

  it("returns 404 for non-existent asset", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets/does-not-exist")
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when wrong user tries to access asset (user isolation)", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        userId: "user-1",
        body: {
          name: "secret.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const assetId = String(created.id);

    // user-2 tries to access user-1's asset
    const getRes = await handleApiRequest(
      makeRequest(`/api/assets/${assetId}`, { userId: "user-2" })
    );
    expect(getRes.status).toBe(404);
  });

  it("lists assets with default home folder filter", async () => {
    // Create asset in user's home folder
    await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "home-file.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );

    // Create asset in a subfolder
    await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "sub-file.txt",
          content_type: "text/plain",
          parent_id: "some-folder-id"
        }
      })
    );

    // List with no filters => defaults to parent_id = user_id
    const listRes = await handleApiRequest(makeRequest("/api/assets"));
    expect(listRes.status).toBe(200);
    const data = (await jsonBody(listRes)) as {
      assets: Array<Record<string, unknown>>;
      next: string | null;
    };
    expect(data.assets.length).toBe(1);
    expect(data.assets[0].name).toBe("home-file.txt");
    expect(data.next).toBeNull();
  });

  it("lists assets filtered by content_type", async () => {
    await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "photo.png",
          content_type: "image/png",
          parent_id: "user-1"
        }
      })
    );
    await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "doc.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );

    const listRes = await handleApiRequest(
      makeRequest("/api/assets?content_type=image/png")
    );
    expect(listRes.status).toBe(200);
    const data = (await jsonBody(listRes)) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(data.assets.length).toBe(1);
    expect(data.assets[0].name).toBe("photo.png");
  });

  it("lists assets filtered by workflow_id", async () => {
    await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "wf-asset.txt",
          content_type: "text/plain",
          parent_id: "user-1",
          workflow_id: "wf-123"
        }
      })
    );
    await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "other.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );

    const listRes = await handleApiRequest(
      makeRequest("/api/assets?workflow_id=wf-123")
    );
    expect(listRes.status).toBe(200);
    const data = (await jsonBody(listRes)) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(data.assets.length).toBe(1);
    expect(data.assets[0].name).toBe("wf-asset.txt");
  });

  it("updates an asset via PUT /api/assets/:id", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "original.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const assetId = String(created.id);

    const updateRes = await handleApiRequest(
      makeRequest(`/api/assets/${assetId}`, {
        method: "PUT",
        body: {
          name: "renamed.txt",
          metadata: { key: "value" }
        }
      })
    );
    expect(updateRes.status).toBe(200);
    const updated = (await jsonBody(updateRes)) as Record<string, unknown>;
    expect(updated.name).toBe("renamed.txt");
    expect(updated.metadata).toEqual({ key: "value" });
    // content_type unchanged
    expect(updated.content_type).toBe("text/plain");
  });

  it("returns 404 when updating non-existent asset", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets/nonexistent", {
        method: "PUT",
        body: { name: "new-name" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("deletes a single asset via DELETE /api/assets/:id", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "to-delete.txt",
          content_type: "text/plain",
          parent_id: "user-1"
        }
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const assetId = String(created.id);

    const deleteRes = await handleApiRequest(
      makeRequest(`/api/assets/${assetId}`, { method: "DELETE" })
    );
    expect(deleteRes.status).toBe(200);
    const deleteData = (await jsonBody(deleteRes)) as {
      deleted_asset_ids: string[];
    };
    expect(deleteData.deleted_asset_ids).toEqual([assetId]);

    // Verify it's gone
    const getRes = await handleApiRequest(
      makeRequest(`/api/assets/${assetId}`)
    );
    expect(getRes.status).toBe(404);
  });

  it("deletes a folder recursively", async () => {
    // Create a folder
    const folderRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "My Folder",
          content_type: "folder",
          parent_id: "user-1"
        }
      })
    );
    const folder = (await jsonBody(folderRes)) as Record<string, unknown>;
    const folderId = String(folder.id);

    // Create files inside the folder
    const file1Res = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "file1.txt",
          content_type: "text/plain",
          parent_id: folderId
        }
      })
    );
    const file1 = (await jsonBody(file1Res)) as Record<string, unknown>;

    const file2Res = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "file2.txt",
          content_type: "text/plain",
          parent_id: folderId
        }
      })
    );
    const file2 = (await jsonBody(file2Res)) as Record<string, unknown>;

    // Create a subfolder with a file
    const subfolderRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "Subfolder",
          content_type: "folder",
          parent_id: folderId
        }
      })
    );
    const subfolder = (await jsonBody(subfolderRes)) as Record<string, unknown>;
    const subfolderId = String(subfolder.id);

    const subfileRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "subfile.txt",
          content_type: "text/plain",
          parent_id: subfolderId
        }
      })
    );
    const subfile = (await jsonBody(subfileRes)) as Record<string, unknown>;

    // Delete the folder
    const deleteRes = await handleApiRequest(
      makeRequest(`/api/assets/${folderId}`, { method: "DELETE" })
    );
    expect(deleteRes.status).toBe(200);
    const deleteData = (await jsonBody(deleteRes)) as {
      deleted_asset_ids: string[];
    };

    // Should contain all 5 items: file1, file2, subfile, subfolder, folder
    expect(deleteData.deleted_asset_ids).toContain(String(file1.id));
    expect(deleteData.deleted_asset_ids).toContain(String(file2.id));
    expect(deleteData.deleted_asset_ids).toContain(String(subfile.id));
    expect(deleteData.deleted_asset_ids).toContain(subfolderId);
    expect(deleteData.deleted_asset_ids).toContain(folderId);
    expect(deleteData.deleted_asset_ids.length).toBe(5);

    // Verify everything is gone
    const getFolder = await handleApiRequest(
      makeRequest(`/api/assets/${folderId}`)
    );
    expect(getFolder.status).toBe(404);
    const getFile = await handleApiRequest(
      makeRequest(`/api/assets/${String(file1.id)}`)
    );
    expect(getFile.status).toBe(404);
  });

  it("returns 404 when deleting non-existent asset", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets/nonexistent", { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });

  it("creates an asset with workflow_id, node_id, and job_id", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "output.png",
          content_type: "image/png",
          parent_id: "user-1",
          workflow_id: "wf-1",
          node_id: "node-1",
          job_id: "job-1"
        }
      })
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.workflow_id).toBe("wf-1");
    expect(data.node_id).toBe("node-1");
    expect(data.job_id).toBe("job-1");
  });

  it("returns 400 for POST with missing required fields", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: { name: "incomplete" }
      })
    );
    expect(res.status).toBe(400);
  });

  it("respects page_size parameter", async () => {
    // Create 3 assets
    for (let i = 0; i < 3; i++) {
      await handleApiRequest(
        makeRequest("/api/assets", {
          method: "POST",
          body: {
            name: `file-${i}.txt`,
            content_type: "text/plain",
            parent_id: "user-1"
          }
        })
      );
    }

    const listRes = await handleApiRequest(
      makeRequest("/api/assets?parent_id=user-1&page_size=2")
    );
    expect(listRes.status).toBe(200);
    const data = (await jsonBody(listRes)) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(data.assets.length).toBe(2);
  });
});

describe("HTTP API: assets — get_url and thumb_url", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function snapshotDomains(): void {
    saved.ASSET_DOMAIN = process.env.ASSET_DOMAIN;
    saved.TEMP_DOMAIN = process.env.TEMP_DOMAIN;
  }

  async function createAsset(contentType: string): Promise<Record<string, unknown>> {
    const res = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "file",
          content_type: contentType,
          parent_id: "user-1"
        }
      })
    );
    return (await jsonBody(res)) as Record<string, unknown>;
  }

  it("returns /api/storage path when ASSET_DOMAIN is not configured", async () => {
    snapshotDomains();
    delete process.env.ASSET_DOMAIN;
    delete process.env.TEMP_DOMAIN;

    const asset = await createAsset("image/png");
    expect(asset.get_url).toBe(`/api/storage/${asset.id}.png`);
    expect(asset.thumb_url).toMatch(
      new RegExp(`^/api/assets/${asset.id}/thumbnail\\?t=\\d+$`)
    );
  });

  it("returns absolute URL on ASSET_DOMAIN when configured", async () => {
    snapshotDomains();
    process.env.ASSET_DOMAIN = "assets.nodetool.ai";
    delete process.env.TEMP_DOMAIN;

    const asset = await createAsset("image/jpeg");
    expect(asset.get_url).toBe(`https://assets.nodetool.ai/${asset.id}.jpg`);
  });

  it("returns null get_url for folders regardless of ASSET_DOMAIN", async () => {
    snapshotDomains();
    process.env.ASSET_DOMAIN = "assets.nodetool.ai";

    const folder = await createAsset("folder");
    expect(folder.get_url).toBeNull();
    expect(folder.thumb_url).toBeNull();
  });
});
