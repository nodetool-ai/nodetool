import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { DocumentRef } from "@nodetool-ai/protocol";
import { createMinimalServer, type MinimalFeatureHost } from "../src/index.js";

it("resolves uploaded DocumentRefs with nullable asset IDs through their URI", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minimal-asset-ref-"));
  const token = "a".repeat(32);
  let featureHost: MinimalFeatureHost | undefined;
  const app = await createMinimalServer({
    directory,
    masterKey: "fixture-key".repeat(8),
    tokens: { [token]: "alice" },
    features: [{ id: "test-reader", load: async () => ({ descriptor: { id: "test-reader", apiVersion: 1 }, activate: host => { featureHost = host; } }) }]
  });
  try {
    const bytes = Buffer.from("document bytes");
    const uploaded = await app.inject({ method: "POST", url: "/api/assets", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, payload: bytes });
    expect(uploaded.statusCode).toBe(200);
    const id: string = uploaded.json().id;
    const reference: DocumentRef = { type: "document", asset_id: null, uri: `asset://${id}` };
    if (!featureHost) {
      throw new Error("Feature host was not activated");
    }
    expect(await featureHost.readAsset("alice", reference)).toEqual(new Uint8Array(bytes));
    expect(await featureHost.readAsset("alice", { ...reference, asset_id: "" })).toEqual(new Uint8Array(bytes));
    expect(await featureHost.readAsset("alice", { ...reference, asset_id: id.slice(0, 12) })).toEqual(new Uint8Array(bytes));
    await expect(featureHost.readAsset("bob", reference)).rejects.toThrow("Asset not found");
    const created=await featureHost.writeAsset("alice",{name:"../../outside.bin",contentType:"application/octet-stream",content:new Uint8Array([0,255,128]),metadata:{source:"feature"}});
    expect(created.id).toMatch(/^[a-f0-9]{32}$/);
    expect(created.uri).toBe(`asset://${created.id}`);
    expect(await featureHost.readAsset("alice",created.uri)).toEqual(new Uint8Array([0,255,128]));
    expect((await featureHost.getAssetInfo("alice",created.id.slice(0,12))).metadata).toEqual({source:"feature"});
    await expect(featureHost.getAssetInfo("bob",created.id)).rejects.toThrow("Asset not found");
    await expect(featureHost.readAsset("alice","asset://../../outside.bin")).rejects.toThrow();
    await expect(featureHost.readAsset("alice","file:///etc/passwd")).rejects.toThrow();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
