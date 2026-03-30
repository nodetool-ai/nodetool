import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, get, post, put, del } from "./setup.js";

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

function createAsset(
  name: string,
  contentType: string,
  extra: Record<string, unknown> = {}
) {
  return post("/assets", {
    name,
    content_type: contentType,
    parent_id: "",
    ...extra,
  });
}

describe("Asset CRUD", () => {
  it("creates an asset (folder)", async () => {
    const res = await createAsset("my-folder", "folder");
    expect(res.status).toBe(200);
    const asset = await res.json();
    expect(asset.id).toBeTypeOf("string");
    expect(asset.name).toBe("my-folder");
    expect(asset.content_type).toBe("folder");
  });

  it("lists assets by parent", async () => {
    await createAsset("file-1", "text/plain");
    await createAsset("file-2", "text/plain");

    // Assets with parent_id="" are listed under that parent
    const res = await get("/assets?parent_id=");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assets.length).toBeGreaterThanOrEqual(2);
  });

  it("gets an asset by ID", async () => {
    const created = await (await createAsset("doc.txt", "text/plain")).json();

    const res = await get(`/assets/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("doc.txt");
  });

  it("updates an asset name", async () => {
    const created = await (await createAsset("old.txt", "text/plain")).json();

    const res = await put(`/assets/${created.id}`, {
      ...created,
      name: "new.txt",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("new.txt");
  });

  it("deletes an asset", async () => {
    const created = await (await createAsset("tmp.txt", "text/plain")).json();

    const delRes = await del(`/assets/${created.id}`);
    expect([200, 204]).toContain(delRes.status);

    const getRes = await get(`/assets/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for non-existent asset", async () => {
    const res = await get("/assets/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("Asset hierarchy", () => {
  it("lists children of a parent folder", async () => {
    const folder = await (await createAsset("parent", "folder")).json();

    await createAsset("child-1", "text/plain", { parent_id: folder.id });
    await createAsset("child-2", "text/plain", { parent_id: folder.id });

    const res = await get(`/assets/${folder.id}/children`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assets).toHaveLength(2);
  });
});

describe("Asset user isolation", () => {
  it("user cannot see another user's assets", async () => {
    const created = await (
      await createAsset("private.txt", "text/plain")
    ).json();

    const res = await get(`/assets/${created.id}`, { userId: "other-user" });
    expect(res.status).toBe(404);
  });
});
