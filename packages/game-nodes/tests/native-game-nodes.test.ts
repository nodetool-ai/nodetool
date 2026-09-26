import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SLOT_METADATA_KEY } from "@nodetool-ai/protocol";
import { createLocalWorkspace, MemoryCache, ProcessingContext } from "@nodetool-ai/runtime";
import { getNativeTemplate, LoadGameTemplateNode, resolveFills, StageGameAssetsNode } from "../src/index.js";

const dirs: string[] = [];
function context(): ProcessingContext {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-native-game-"));
  dirs.push(dir);
  return new ProcessingContext({ jobId: "native-game-test", userId: "tester", cache: new MemoryCache(), workspace: createLocalWorkspace(dir) });
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("native game nodes", () => {
  it("loads the playable top-down template manifest", async () => {
    const node = new LoadGameTemplateNode({ template: "topdown" });
    const result = await node.process();
    expect(result.manifest.engineVersion).toBe("1");
    expect(result.slots.map((slot) => slot.id)).toEqual(["player", "wall", "gem", "sfx.collect"]);
  });

  it("rejects a bare layout fill with wiring advice", () => {
    expect(() => resolveFills("topdown", [{ kind: "sfx", slot_id: "sfx.collect", seconds: 0.4 }])).toThrow("output handle");
  });

  it("stages checked bytes by content digest without changing a game document", async () => {
    const ctx = context();
    const gameId = "a".repeat(32);
    const bytes = new TextEncoder().encode("checked image bytes");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const fill = { kind: "spritesheet", slot_id: "gem", cell: [32, 32], columns: 1, rows: 1, animations: { idle: { from: 0, to: 0, fps: 8, loop: true } } };
    const node = new StageGameAssetsNode({ game_id: gameId, template: "topdown", fills: [{ type: "image", asset_id: "gem-asset", data: bytes, metadata: { [SLOT_METADATA_KEY]: fill } }] });
    const result = await node.process(ctx);
    expect(result.bindings.gem.digest).toBe(digest);
    expect(result.paths).toEqual([`games/${gameId}/assets/${digest}.png`]);
    expect(await ctx.workspace?.read(result.paths[0])).toEqual(bytes);
    expect(await ctx.workspace?.exists(`games/${gameId}/game.json`)).toBe(false);
  });

  it("refuses candidate media for a slot absent from the native template", async () => {
    const ctx = context();
    const node = new StageGameAssetsNode({ game_id: "b".repeat(32), template: "topdown", fills: [{ type: "image", asset_id: "other", data: new Uint8Array([1]), metadata: { [SLOT_METADATA_KEY]: { kind: "image", slot_id: "other", size: [1, 1], seamless_x: false, seamless_y: false } } }] });
    await expect(node.process(ctx)).rejects.toThrow("Unknown template slot other");
    expect(getNativeTemplate("topdown").id).toBe("topdown");
  });
});
