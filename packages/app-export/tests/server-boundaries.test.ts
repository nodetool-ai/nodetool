import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
// @ts-expect-error Template modules run as plain ESM.
import { createNodeInputBoundary, guardExecutor } from "../template/server/input-boundary.mjs";
// @ts-expect-error Template modules run as plain ESM.
import { createInputResolver } from "../template/server/media.mjs";
// @ts-expect-error Template modules run as plain ESM.
import { createLocalStore } from "../template/server/store.mjs";
// @ts-expect-error Template modules run as plain ESM.
import { applyPropertyOverrides } from "../template/server/properties.mjs";
// @ts-expect-error Template modules run as plain ESM.
import { observeSessionCancellation } from "../template/server/lifecycle.mjs";
// @ts-expect-error Template modules run as plain ESM.
import { storageResponseHeaders } from "../template/server/storage-policy.mjs";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { getAssetFileName } from "@nodetool-ai/protocol";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "export-boundary-"));
  roots.push(root);
  const storage = new FileStorageAdapter(join(root, "storage"));
  await mkdir(storage.rootDir, { recursive: true });
  return { root, storage };
}

test("HTTP media inputs reject host paths and preserve uploaded and remote media", async () => {
  const { storage } = await fixture();
  const resolve = createInputResolver(storage);
  for (const uri of ["file:///etc/passwd", ".env", "/etc/passwd", "../credentials", "/api/storage/%2e%2e/credentials"]) {
    expect(() => resolve({ document: { type: "document", uri } })).toThrow();
  }
  expect(resolve({ document: { uri: "/api/storage/uploads/document.txt" } })).toEqual({ document: { uri: pathToFileURL(join(storage.rootDir, "uploads/document.txt")).href } });
  expect(resolve({ image: { uri: "https://example.com/image.png" } })).toEqual({ image: { uri: "https://example.com/image.png" } });
});

test("native readers stay in storage even for plain paths and symlinks", async () => {
  const { root, storage } = await fixture();
  await writeFile(join(root, ".env"), "fixture secret");
  await storage.store("document.txt", Buffer.from("uploaded"), "text/plain");
  await symlink(join(root, ".env"), join(storage.rootDir, "escape"));
  const boundary = createNodeInputBoundary([storage.rootDir]);
  const metadata = { properties: [{ name: "path" }] };
  const guarded = guardExecutor({ process: async (inputs: { path: string }) => inputs }, metadata, boundary);
  expect(await guarded.process({ path: ".env" })).toEqual({ path: join(storage.rootDir, ".env") });
  expect(await guarded.process({ path: "document.txt" })).toEqual({ path: join(storage.rootDir, "document.txt") });
  for (const path of [join(root, ".env"), "../.env", "escape", pathToFileURL(join(root, ".env")).href]) {
    await expect(guarded.process({ path })).rejects.toThrow("storage");
  }
  const reader = guardExecutor({ process: async (inputs: { path: string }) => readFile(inputs.path, "utf8") }, metadata, boundary);
  expect(await reader.process({ path: "document.txt" })).toBe("uploaded");
  await expect(reader.process({ path: ".env" })).rejects.toMatchObject({ code: "ENOENT" });
  await expect(boundary({ image: pathToFileURL(join(root, ".env")).href }, { properties: [{ name: "image", type: { type: "image" } }] })).rejects.toThrow("storage");
  await expect(boundary({ folder: { path: root } }, { properties: [{ name: "folder", type: { type: "folder" } }] })).rejects.toThrow("storage");
  expect(await boundary({}, { properties: [{ name: "folder", type: { type: "folder" }, default: { type: "folder", uri: "" } }] })).toEqual({ folder: { type: "folder", uri: pathToFileURL(storage.rootDir).href } });
});

test("asset storage keys agree with MIME-based runtime readers after updates", async () => {
  const { root, storage } = await fixture();
  const store = createLocalStore({ dataDir: root, storage });
  const asset = await store.interfaces.createAsset({ userId: "1", name: "photo.jpeg", contentType: "image/jpeg", content: Uint8Array.of(1) });
  expect(store.assetKey(asset.uri)).toBe(`1/${getAssetFileName(asset.id, "image/jpeg")}`);
  await store.interfaces.updateAssetBytes({ assetId: asset.id, contentType: "image/png", content: Uint8Array.of(2) });
  expect(store.assetKey(asset.uri)).toBe(`1/${getAssetFileName(asset.id, "image/png")}`);
});

test("property overlays change only exposed properties on a per-run graph", () => {
  const workflow = { key: "w", graph: { nodes: [{ id: "n", type: "fixture", data: { model: "old", code: "trusted" } }], edges: [] } };
  const bundle = { app: { operations: [{ id: "run", workflowId: "w" }], ui: { content: [{ props: { binding: "op:run/prop:n#model" } }] } } };
  const graph = applyPropertyOverrides(bundle, workflow, "run", { "n#model": { value: "new" } });
  expect(graph.nodes[0].data.model).toBe("new");
  expect(workflow.graph.nodes[0].data.model).toBe("old");
  expect(() => applyPropertyOverrides(bundle, workflow, "run", { "n#code": { value: "untrusted" } })).toThrow("not exposed");
});

test("session creation cannot lose an earlier abort", async () => {
  const controller = new AbortController();
  const reasons: string[] = [];
  const pending = Promise.resolve({ cancel: (reason: string) => reasons.push(reason) });
  controller.abort();
  const session = await pending;
  const cleanup = observeSessionCancellation(session, controller.signal);
  expect(reasons).toEqual(["cancelled"]);
  cleanup();
});

test("uploaded active documents download with sandbox and nosniff headers", () => {
  for (const name of ["page.html", "page.HTML", "drawing.svg", "document.xhtml"]) {
    expect(storageResponseHeaders(name)).toEqual({
      "content-security-policy": "sandbox; default-src 'none'",
      "x-content-type-options": "nosniff",
      "content-disposition": "attachment"
    });
  }
  expect(storageResponseHeaders("photo.png")["content-disposition"]).toBeUndefined();
});

test("real exported scripts read uploads through the sandbox workspace", async () => {
  const { root } = await fixture();
  const document = {
    ...emptyJsScriptDocument(),
    code: 'await output("text", await media.text(inputs.document));',
    inputs: [{ name: "document", type: "document" }],
    outputs: [{ name: "text", type: "str" }]
  };
  const nativeDocument = {
    ...emptyJsScriptDocument(),
    code: 'import { invoke_node } from "@nodetool-ai/sandbox-nodetool/flow";\nconst doc = await invoke_node({ type: "nodetool.document.LoadDocumentFile", inputs: { path: inputs.path } });\nawait output("data", doc.output.data);',
    inputs: [{ name: "path", type: "str" }],
    outputs: [{ name: "data", type: "str" }]
  };
  await writeFile(join(root, ".env"), "fixture secret");
  await writeFile(join(root, "app.bundle.json"), JSON.stringify({ app: { operations: [], ui: {} }, workflows: [], scripts: [{ key: "s", name: "Read upload", document }, { key: "native", name: "Native read", document: nativeDocument }] }));
  // @ts-expect-error Template modules run as plain ESM.
  const { createRunner } = await import("../template/server/runner.mjs");
  const runner = createRunner({ root, dataDir: join(root, "data") });
  await runner.storage.store("uploads/document.txt", Buffer.from("uploaded text"), "text/plain");
  const result = await runner.runScript({ scriptKey: "s", params: { document: { type: "document", uri: "/api/storage/uploads/document.txt" } }, send: () => {} });
  expect(result, result.error).toMatchObject({ ok: true });
  expect(result.outputs.text).toBe("uploaded text");
  const native = await runner.runScript({ scriptKey: "native", params: { path: "/api/storage/uploads/document.txt" }, send: () => {} });
  expect(native, native.error).toMatchObject({ ok: true });
  expect(native.outputs.data).toBe(Buffer.from("uploaded text").toString("base64"));
  const rejected = await runner.runScript({ scriptKey: "native", params: { path: join(root, ".env") }, send: () => {} });
  expect(rejected.ok).toBe(false);
  expect(JSON.stringify(rejected)).not.toContain(Buffer.from("fixture secret").toString("base64"));
}, 30_000);

test("real native folder defaults scan storage and reject alternate host path objects", async () => {
  const { root, storage } = await fixture();
  await writeFile(join(root, "host.csv"), "value\nsecret\n");
  const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
  const { LoadCSVAssetsNode, LoadTextAssetsNode } = await import("@nodetool-ai/base-nodes");
  const registry = new NodeRegistry();
  registry.register(LoadCSVAssetsNode);
  registry.register(LoadTextAssetsNode);
  const boundary = createNodeInputBoundary([storage.rootDir]);
  const executor = guardExecutor(registry.resolve({ id: "n", type: LoadCSVAssetsNode.nodeType, properties: {} }), registry.resolveMetadata(LoadCSVAssetsNode.nodeType), boundary);
  await executor.initialize();
  const result = await executor.process({});
  expect(result.names).toEqual([]);
  const text = guardExecutor(registry.resolve({ id: "t", type: LoadTextAssetsNode.nodeType, properties: {} }), registry.resolveMetadata(LoadTextAssetsNode.nodeType), boundary);
  await expect(text.process({ folder: { path: root } })).rejects.toThrow("storage");
}, 30_000);

test("real exported workflow cannot read project credentials through string paths", async () => {
  const { root } = await fixture();
  await writeFile(join(root, ".env"), "fixture secret");
  const workflow = {
    key: "w",
    graph: {
      nodes: [
        { id: "input", type: "nodetool.input.StringInput", data: { name: "document", value: "" } },
        { id: "load", type: "nodetool.document.LoadDocumentFile", data: {} },
        { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
      ],
      edges: [
        { source: "input", sourceHandle: "output", target: "load", targetHandle: "path" },
        { source: "load", sourceHandle: "output", target: "out", targetHandle: "value" }
      ]
    }
  };
  await writeFile(join(root, "app.bundle.json"), JSON.stringify({ app: { operations: [], ui: {} }, workflows: [workflow], scripts: [] }));
  // @ts-expect-error Template modules run as plain ESM.
  const { createRunner } = await import("../template/server/runner.mjs");
  const runner = createRunner({ root, dataDir: join(root, "data") });
  await runner.storage.store("uploads/document.txt", Buffer.from("uploaded text"), "text/plain");
  const upload = await runner.run({ workflowKey: "w", params: { document: "/api/storage/uploads/document.txt" }, send: () => {} });
  expect(upload.status).toBe("completed");
  for (const path of [".env", join(root, ".env"), pathToFileURL(join(root, ".env")).href]) {
    const result = await runner.run({ workflowKey: "w", params: { document: path }, send: () => {} });
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain(Buffer.from("fixture secret").toString("base64"));
  }
}, 30_000);
