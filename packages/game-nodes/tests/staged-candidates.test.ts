import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { SLOT_METADATA_KEY } from "@nodetool-ai/protocol";
import { createLocalWorkspace, MemoryCache, ProcessingContext } from "@nodetool-ai/runtime";
import { derivedStagedBinding2D, listStagedGameCandidates, recordStagedGameCandidate, StageGameAssetsNode } from "../src/index.js";

const dirs: string[] = [];
function context(): ProcessingContext {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-staged-candidates-"));
  dirs.push(dir);
  return new ProcessingContext({ jobId: "staged-candidates-test", userId: "tester", cache: new MemoryCache(), workspace: createLocalWorkspace(dir) });
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("staged game candidates", () => {
  it("records the slot and binding of every asset StageGameAssets writes", async () => {
    const ctx = context();
    const gameId = "b".repeat(32);
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
    const fill = { kind: "spritesheet", slot_id: "gem", cell: [32, 32], columns: 1, rows: 1, animations: { idle: { from: 0, to: 0, fps: 8, loop: true } } };
    const node = new StageGameAssetsNode({ game_id: gameId, template: "topdown",
      fills: [{ type: "image", asset_id: "gem-asset", data: bytes, metadata: { [SLOT_METADATA_KEY]: fill } }] });
    const result = await node.process(ctx);
    const workspace = ctx.workspace;
    if (!workspace) throw new Error("test context has no workspace");
    const candidates = await listStagedGameCandidates(workspace, `games/${gameId}`);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ digest: result.bindings.gem.digest, extension: "png", mediaKind: "image",
      path: result.paths[0], record: { slot: "gem", source: "stage", binding: { digest: result.bindings.gem.digest, assetId: "gem-asset" } } });
  });

  it("lists unrecorded files with only their kind and ignores files that are not content-addressed", async () => {
    const ctx = context();
    const workspace = ctx.workspace;
    if (!workspace) throw new Error("test context has no workspace");
    const audio = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    await workspace.write(`games/g/assets/${sha(audio)}.wav`, audio);
    await workspace.write("games/g/assets/notes.txt", "not a candidate");
    await workspace.write(`games/g/assets/${"c".repeat(64)}.exe`, "unknown extension");
    await workspace.write(`games/g/candidates/${sha(audio)}.json`, "{ broken");
    const candidates = await listStagedGameCandidates(workspace, "games/g");
    expect(candidates).toEqual([expect.objectContaining({ digest: sha(audio), mediaKind: "audio", record: null })]);
    expect(await listStagedGameCandidates(workspace, "games/missing")).toEqual([]);
  });

  it("returns a recorded prompt and drops a record whose digest names other bytes", async () => {
    const ctx = context();
    const workspace = ctx.workspace;
    if (!workspace) throw new Error("test context has no workspace");
    const bytes = new Uint8Array([1, 2, 3]);
    await workspace.write(`games/g/assets/${sha(bytes)}.mp3`, bytes);
    await recordStagedGameCandidate(workspace, "games/g", { digest: sha(bytes), slot: "music.theme", prompt: "calm theme", source: "generate" });
    const [candidate] = await listStagedGameCandidates(workspace, "games/g");
    expect(candidate.record).toMatchObject({ slot: "music.theme", prompt: "calm theme", source: "generate", version: 1 });
    await workspace.write(`games/g/candidates/${sha(bytes)}.json`, JSON.stringify({ ...candidate.record, digest: "d".repeat(64) }));
    expect((await listStagedGameCandidates(workspace, "games/g"))[0].record).toBeNull();
  });

  it("derives an image binding from staged bytes and keeps the slot's pivot and sampling", async () => {
    const bytes = new Uint8Array(await sharp({ create: { width: 48, height: 16, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer());
    const binding = await derivedStagedBinding2D(bytes, { digest: sha(bytes), extension: "png", mediaKind: "image" },
      { pivot: { x: 0.5, y: 1 }, sampling: "linear" });
    expect(binding).toEqual({ assetId: `staged:${sha(bytes)}`, digest: sha(bytes), mediaKind: "image", width: 48, height: 16,
      pivot: { x: 0.5, y: 1 }, sampling: "linear" });
    await expect(derivedStagedBinding2D(bytes, { digest: sha(bytes), extension: "glb", mediaKind: "model" })).rejects.toThrow("3D preparation");
  });
});
