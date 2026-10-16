import { expect, it, vi } from "vitest";
import { createWorkspace } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { GAME_BUILD_INTEGRITY_FILE, gameBuildIntegrityManifest, verifiedGameBuildCache } from "../src/game-build-integrity.js";

const fingerprint = "a".repeat(64);
const limits = { files: 256, bytes: 256 * 1024 * 1024 };

async function fixture() {
  const workspace = createWorkspace(new InMemoryStorageAdapter());
  const files = ["index.html", "game.json", "player.js", "runtime.wasm", "assets/model.glb", "assets/music.ogg", "assets/collider.json"]
    .map(path => ({ path, bytes: new TextEncoder().encode(`original ${path}`) }));
  for (const file of files) { await workspace.write(`build/${file.path}`, file.bytes); }
  const manifest = gameBuildIntegrityManifest("build", fingerprint, "index.html", files);
  await workspace.write(`build/${GAME_BUILD_INTEGRITY_FILE}`, manifest);
  return { workspace, files, manifest, verify: () => verifiedGameBuildCache(workspace, "build", fingerprint, "index.html", limits) };
}

it.each(["player.js", "runtime.wasm", "assets/model.glb", "assets/music.ogg", "assets/collider.json"])("rejects missing and same-size changed cached %s bytes", async path => {
  const { workspace, files, verify } = await fixture();
  expect(await verify()).toBe(true);
  const original = files.find(file => file.path === path);
  if (!original) { throw new Error("Cache fixture file missing"); }
  await workspace.delete(`build/${path}`);
  expect(await verify()).toBe(false);
  await workspace.write(`build/${path}`, new Uint8Array(original.bytes.length));
  expect(await verify()).toBe(false);
  await workspace.write(`build/${path}`, original.bytes);
  expect(await verify()).toBe(true);
});

it("rejects legacy entries, invalid manifests, changed runtimes and exceeded budgets", async () => {
  const { workspace, manifest, verify } = await fixture();
  const path = `build/${GAME_BUILD_INTEGRITY_FILE}`;
  await workspace.delete(path);
  expect(await verify()).toBe(false);
  await workspace.write(path, "{");
  expect(await verify()).toBe(false);
  await workspace.write(path, manifest);
  expect(await verifiedGameBuildCache(workspace, "build", "b".repeat(64), "index.html", limits)).toBe(false);
  expect(await verifiedGameBuildCache(workspace, "build", fingerprint, "index.html", { ...limits, files: 7 })).toBe(false);
  expect(await verifiedGameBuildCache(workspace, "build", fingerprint, "index.html", { ...limits, bytes: 1 })).toBe(false);
  const parsed = JSON.parse(manifest);
  await workspace.write(path, JSON.stringify({ ...parsed, buildPath: "another-revision" }));
  expect(await verify()).toBe(false);
  parsed.files.push({ ...parsed.files[0], path: "../outside" });
  await workspace.write(path, JSON.stringify(parsed));
  expect(await verify()).toBe(false);
});

it("stops a cache scan when cancelled while reading verified stored bytes", async () => {
  const { workspace } = await fixture();
  const controller = new AbortController();
  const read = workspace.read.bind(workspace);
  const calls = vi.spyOn(workspace, "read").mockImplementation(async path => {
    const bytes = await read(path);
    if (path === "build/player.js") { controller.abort(); }
    return bytes;
  });
  await expect(verifiedGameBuildCache(workspace, "build", fingerprint, "index.html", limits, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(calls.mock.calls.some(([path]) => path === "build/player.js")).toBe(true);
  expect(calls.mock.calls.some(([path]) => path === "build/runtime.wasm")).toBe(false);
});
