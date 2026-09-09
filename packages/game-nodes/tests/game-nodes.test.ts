/**
 * The three template nodes, against the shipped platformer template and the
 * golden project in `@nodetool-ai/godot`.
 *
 * The export test is the load-bearing one: it lays a whole project down in a
 * real directory and compares every resource the writer produced against the
 * golden byte for byte, so a change in the writer or in the layout shows up
 * here rather than in a Godot import error.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";

import {
  gameAssetManifest,
  filledManifest,
  SLOT_METADATA_KEY,
  type Entity,
  type FilledManifest,
  type GameSlotSpec
} from "@nodetool-ai/protocol";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  createLocalWorkspace,
  createWorkspace,
  MemoryCache,
  ProcessingContext,
  type ProcessingContextModelInterfaces
} from "@nodetool-ai/runtime";

import {
  ExportGodotProjectNode,
  LoadGameTemplateNode,
  SlotPromptNode,
  resolveFills
} from "../src/index.js";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../protocol/fixtures/game-assets/${name}`, import.meta.url)
      ),
      "utf8"
    )
  );

const MANIFEST = gameAssetManifest.parse(fixture("platformer.manifest.json"));
const FILLED: FilledManifest = filledManifest.parse(
  fixture("platformer.filled.json")
);
const GOLDEN_DIR = fileURLToPath(
  new URL("../../godot/tests/golden/platformer", import.meta.url)
);

const temps: string[] = [];
function tempWorkspaceContext(): ProcessingContext {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-game-nodes-"));
  temps.push(dir);
  return new ProcessingContext({
    jobId: "game-nodes-test",
    userId: "tester",
    cache: new MemoryCache(),
    workspace: createLocalWorkspace(dir)
  });
}

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop() as string, { recursive: true, force: true });
  }
});

/**
 * The checker `output` handles the export takes: the fixture's asset id and
 * uri, the fill on `metadata`, and bytes that identify which slot they came
 * from so a mis-copied asset is visible.
 */
function stampedRefs(): Array<Record<string, unknown>> {
  return FILLED.slots.map((slot) => ({
    type: slot.asset.type,
    uri: slot.asset.uri,
    asset_id: slot.asset.asset_id,
    data: new TextEncoder().encode(`bytes for ${slot.slot_id}`),
    metadata: { [SLOT_METADATA_KEY]: slot.fill }
  }));
}

const slot = (id: string): GameSlotSpec => {
  const spec = MANIFEST.slots.find((s) => s.id === id);
  if (!spec) throw new Error(`fixture has no slot ${id}`);
  return spec;
};

/** Every key a node declares an output slot for. */
const declaredOutputs = (node: {
  metadataOutputTypes?: Record<string, string>;
}): string[] => Object.keys(node.metadataOutputTypes ?? {});

describe("LoadGameTemplate", () => {
  it("reads the shipped platformer manifest with no model interfaces", async () => {
    const node = new LoadGameTemplateNode({ template: "platformer" });
    const result = await node.process();
    expect(result.manifest.template).toBe("platformer");
    expect(result.slots.map((s) => s.id)).toEqual(
      MANIFEST.slots.map((s) => s.id)
    );
    expect(result.slot).toEqual(MANIFEST.slots[0]);
  });

  it("populates every declared output slot", async () => {
    const result = await new LoadGameTemplateNode({
      template: "platformer"
    }).process();
    for (const key of declaredOutputs(LoadGameTemplateNode)) {
      expect(result[key as keyof typeof result], key).toBeDefined();
    }
    for (const key of Object.keys(result)) {
      expect(declaredOutputs(LoadGameTemplateNode), key).toContain(key);
    }
  });

  it("streams one slot per manifest slot, then the aggregate", async () => {
    const yields: Array<Record<string, unknown>> = [];
    for await (const value of new LoadGameTemplateNode({
      template: "platformer"
    }).genProcess()) {
      yields.push(value as Record<string, unknown>);
    }
    expect(yields).toHaveLength(MANIFEST.slots.length + 1);
    expect(yields.slice(0, -1).map((y) => (y.slot as GameSlotSpec).id)).toEqual(
      MANIFEST.slots.map((s) => s.id)
    );
    const last = yields[yields.length - 1];
    expect(Object.keys(last).sort()).toEqual(["manifest", "slots"]);
  });

  it("prefers the context's template list when one is wired", async () => {
    const context = tempWorkspaceContext();
    const interfaces: ProcessingContextModelInterfaces = {
      listGameTemplates: async () => [
        { id: "house-style", manifest: { ...MANIFEST, template: "house-style" } }
      ]
    };
    context.setModelInterfaces(interfaces);
    const result = await new LoadGameTemplateNode({
      template: "house-style"
    }).process(context);
    expect(result.manifest.template).toBe("house-style");

    await expect(
      new LoadGameTemplateNode({ template: "platformer" }).process(context)
    ).rejects.toThrow(/unknown template platformer\. Templates: house-style/);
  });

  it("names the templates it has when asked for one it does not", async () => {
    await expect(
      new LoadGameTemplateNode({ template: "roguelike" }).process()
    ).rejects.toThrow(/unknown template roguelike\. Templates: .*platformer/);
  });
});

describe("SlotPrompt", () => {
  const STYLE: Entity = {
    type: "entity",
    id: "style-1",
    kind: "style",
    name: "Cave Pixel",
    descriptor: "8-bit cave palette, hard pixel edges"
  };

  it("populates every declared output slot and nothing else", async () => {
    const result = await new SlotPromptNode({ slot: slot("player") }).process();
    for (const key of declaredOutputs(SlotPromptNode)) {
      expect(result[key as keyof typeof result], key).toBeDefined();
    }
    expect(Object.keys(result).sort()).toEqual(
      declaredOutputs(SlotPromptNode).sort()
    );
  });

  it("carries the slot's kind and canvas", async () => {
    const sheet = await new SlotPromptNode({ slot: slot("player") }).process();
    expect([sheet.kind, sheet.width, sheet.height, sheet.seconds]).toEqual([
      "spritesheet",
      256,
      128,
      0
    ]);
    const music = await new SlotPromptNode({
      slot: slot("music.level")
    }).process();
    expect([music.kind, music.width, music.height, music.seconds]).toEqual([
      "music",
      0,
      0,
      60
    ]);
  });

  it("hands the checker its prop bag", async () => {
    const result = await new SlotPromptNode({
      slot: slot("tiles.ground")
    }).process();
    expect(result.checker).toEqual({
      slot_id: "tiles.ground",
      cell_width: 16,
      cell_height: 16,
      count: 12
    });
  });

  it("seasons the prompt with the style and the cast", async () => {
    const result = await new SlotPromptNode({
      slot: slot("player"),
      style: STYLE,
      cast: [
        {
          type: "entity",
          id: "char-1",
          kind: "character",
          name: "Pip",
          descriptor: "a small round explorer"
        }
      ]
    }).process();
    expect(result.prompt).toContain("Cave Pixel: 8-bit cave palette");
    expect(result.prompt).toContain("Pip: a small round explorer");
  });

  it("fills a bare entity pointer from the library before injecting", async () => {
    const context = tempWorkspaceContext();
    context.setModelInterfaces({
      getEntity: async ({ id }) => (id === STYLE.id ? STYLE : null)
    });
    const result = await new SlotPromptNode({
      slot: slot("bg.far"),
      style: { type: "entity", id: STYLE.id, kind: "style", name: "", descriptor: "" }
    }).process(context);
    expect(result.prompt).toContain("Cave Pixel: 8-bit cave palette");
  });

  it("refuses a slot that is not a slot", async () => {
    await expect(
      new SlotPromptNode({ slot: { id: "player", kind: "spritesheet" } }).process()
    ).rejects.toThrow(/slot is not a game slot spec/);
  });
});

describe("resolveFills", () => {
  it("refuses a bare fill and names the handle to wire instead", () => {
    expect(() => resolveFills("platformer", [FILLED.slots[0].fill])).toThrow(
      /bare spritesheet fill for slot player.*output handle instead of its fill handle/s
    );
  });

  it("refuses an asset that was never run through a checker", () => {
    expect(() =>
      resolveFills("platformer", [{ type: "image", uri: "asset://x.png" }])
    ).toThrow(/carries no slot fill/);
  });

  it("reads an empty list as a manifest with no slots", () => {
    // The blank-template export: nothing generated, the template's own art.
    const { manifest, refs } = resolveFills("platformer", []);
    expect(manifest.slots).toEqual([]);
    expect(refs.size).toBe(0);
  });

  it("derives an asset id from the slot when a hermetic run stored none", () => {
    const { manifest, refs } = resolveFills("platformer", [
      {
        type: "audio",
        uri: "",
        data: new Uint8Array([1, 2, 3]),
        metadata: { [SLOT_METADATA_KEY]: FILLED.slots[4].fill }
      }
    ]);
    expect(manifest.slots[0].asset).toEqual({
      type: "audio",
      uri: "asset://sfx_jump.wav",
      asset_id: "sfx_jump"
    });
    expect(refs.get("sfx_jump")).toBeDefined();
  });

  it("takes a whole {slot_id, asset, fill} record as it stands", () => {
    const { manifest } = resolveFills("platformer", [FILLED.slots[0]]);
    expect(manifest.slots[0]).toEqual(FILLED.slots[0]);
  });
});

describe("ExportGodotProject", () => {
  async function exportPlatformer(
    props: Record<string, unknown> = {}
  ): Promise<{
    context: ProcessingContext;
    result: Awaited<ReturnType<ExportGodotProjectNode["process"]>>;
  }> {
    const context = tempWorkspaceContext();
    const result = await new ExportGodotProjectNode({
      template: "platformer",
      name: "Platformer",
      fills: stampedRefs(),
      directory: "game",
      verify: false,
      ...props
    }).process(context);
    return { context, result };
  }

  it("writes the golden resources byte for byte", async () => {
    const { context, result } = await exportPlatformer();
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    expect(result.directory).toBe("game");

    // Every file the writer produces except project.godot, which the template
    // owns (it carries the input map and window settings).
    for (const path of [
      "assets/sprites/player.tres",
      "assets/sprites/enemy_walker.tres",
      "assets/tiles/tiles_ground.tres",
      "assets/audio/sfx_jump.ogg.import",
      "assets/audio/sfx_hurt.ogg.import",
      "assets/audio/music_level.ogg.import"
    ]) {
      expect(await workspace.readText(`game/${path}`), path).toBe(
        readFileSync(join(GOLDEN_DIR, path), "utf8")
      );
    }
  });

  it("copies every asset the writer asks for, to the golden paths", async () => {
    const { context, result } = await exportPlatformer();
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    const copies = JSON.parse(
      readFileSync(join(GOLDEN_DIR, "copies.json"), "utf8")
    ) as Array<{ path: string; asset_id: string }>;
    for (const copy of copies) {
      const bytes = await workspace.read(`game/${copy.path}`);
      expect(bytes, copy.path).not.toBeNull();
      expect(new TextDecoder().decode(bytes as Uint8Array), copy.path).toMatch(
        /^bytes for /
      );
      expect(result.files, copy.path).toContain(copy.path);
    }
  });

  it("keeps the template's project.godot and stamps the name on it", async () => {
    const { context } = await exportPlatformer({ name: "Cave Run" });
    const text = await context.workspace?.readText("game/project.godot");
    expect(text).toContain('config/name="Cave Run"');
    // The template's own settings, which the writer's project.godot lacks.
    expect(text).toContain("[input]");
  });

  it("rewrites the scenes when a filled slot's extension moved", async () => {
    const { context } = await exportPlatformer();
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    // The template ships .wav placeholders; the fixture fills are .ogg.
    expect(await workspace.exists("game/assets/audio/sfx_jump.wav")).toBe(false);
    expect(await workspace.exists("game/assets/audio/sfx_jump.ogg")).toBe(true);
    const level = await workspace.readText("game/scenes/player.tscn");
    expect(level).not.toContain("sfx_jump.wav");
  });

  it("leaves no dangling res:// reference behind", async () => {
    const { result } = await exportPlatformer();
    expect(result.errors.filter((e) => e.startsWith("dangling"))).toEqual([]);
  });

  it("populates every declared output slot and nothing else", async () => {
    const { result } = await exportPlatformer();
    for (const key of declaredOutputs(ExportGodotProjectNode)) {
      expect(result[key as keyof typeof result], key).toBeDefined();
    }
    expect(Object.keys(result).sort()).toEqual(
      declaredOutputs(ExportGodotProjectNode).sort()
    );
  });

  it("never reports verified from a verification that did not run", async () => {
    const { result } = await exportPlatformer();
    expect(result.verified).toBe(false);
    expect(result.errors).toContain("godot verification skipped: verify was false");
  });

  it("says why a virtual workspace cannot be verified", async () => {
    const context = new ProcessingContext({
      jobId: "virtual",
      userId: "tester",
      cache: new MemoryCache(),
      // A storage-backed workspace has no real directory, which is what a
      // cloud deployment gives a run.
      workspace: createWorkspace(new InMemoryStorageAdapter())
    });
    const result = await new ExportGodotProjectNode({
      template: "platformer",
      name: "Platformer",
      fills: stampedRefs(),
      directory: "game"
    }).process(context);
    expect(result.verified).toBe(false);
    expect(result.verification.ran).toBe(false);
    expect(result.verification.reason).toMatch(/virtual workspace/);
    expect(result.errors.join("\n")).toContain("virtual workspace");
  });

  it("keeps an edited hook script on a re-export", async () => {
    const context = tempWorkspaceContext();
    const run = (): Promise<unknown> =>
      new ExportGodotProjectNode({
        template: "platformer",
        name: "Platformer",
        fills: stampedRefs(),
        directory: "game",
        verify: false
      }).process(context);
    await run();
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    await workspace.write(
      "game/scripts/player.gd",
      "# hand edited\nextends CharacterBody2D\n",
      "text/plain"
    );
    await run();
    expect(await workspace.readText("game/scripts/player.gd")).toContain(
      "# hand edited"
    );
  }, 15_000);

  it("exports the template's own art when nothing was filled", async () => {
    // The blank-template path (game-prd § 4.1): a project that runs in Godot
    // today, with the placeholders still in it.
    const { context, result } = await exportPlatformer({ fills: [] });
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    expect(await workspace.readText("game/project.godot")).toContain(
      'config/name="Platformer"'
    );
    expect(await workspace.exists("game/assets/sprites/player.png")).toBe(true);
    expect(await workspace.exists("game/scripts/player.gd")).toBe(true);
    expect(result.errors.filter((e) => e.startsWith("dangling"))).toEqual([]);
    expect(result.archive).toBe("game.zip");
  });

  it("leaves an unfilled slot on the template's placeholder", async () => {
    // D27: keeping the template's audio is a choice, not a failure.
    const audio = new Set(["sfx.jump", "sfx.hurt", "music.level"]);
    const { context, result } = await exportPlatformer({
      fills: stampedRefs().filter(
        (_, index) => !audio.has(FILLED.slots[index].slot_id)
      )
    });
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    expect(await workspace.exists("game/assets/audio/music_level.wav")).toBe(true);
    expect(await workspace.exists("game/assets/sprites/player.tres")).toBe(true);
    expect(result.errors.filter((e) => e.startsWith("dangling"))).toEqual([]);
  });

  it("refuses a fill for a slot this template does not have, naming it", async () => {
    const context = tempWorkspaceContext();
    const stray = {
      ...stampedRefs()[0],
      metadata: {
        [SLOT_METADATA_KEY]: { ...FILLED.slots[0].fill, slot_id: "boss.final" }
      }
    };
    await expect(
      new ExportGodotProjectNode({
        template: "platformer",
        name: "Platformer",
        fills: [stray],
        directory: "game",
        verify: false
      }).process(context)
    ).rejects.toThrow(/has no slot named boss\.final/);
  });

  it("writes a zip beside the directory, every entry under the project folder", async () => {
    const { context, result } = await exportPlatformer();
    const workspace = context.workspace;
    if (!workspace) throw new Error("expected a workspace");
    expect(result.archive).toBe("game.zip");
    const bytes = await workspace.read("game.zip");
    if (!bytes) throw new Error("expected an archive");
    const entries = Object.keys(unzipSync(bytes));
    expect(entries).toContain("game/project.godot");
    expect(entries).toContain("game/assets/sprites/player.tres");
    expect(entries.length).toBe(result.files.length);
  });

  it("reports the whole export on one output handle", async () => {
    const { result } = await exportPlatformer();
    expect(result.output).toEqual({
      directory: "game",
      verified: result.verified,
      archive: "game.zip"
    });
  });

  it("refuses a run with no workspace", async () => {
    const context = new ProcessingContext({
      jobId: "no-workspace",
      userId: "tester",
      cache: new MemoryCache()
    });
    await expect(
      new ExportGodotProjectNode({
        template: "platformer",
        name: "Platformer",
        fills: stampedRefs()
      }).process(context)
    ).rejects.toThrow(/no workspace/);
  });

  it("refuses an unnamed project", async () => {
    const context = tempWorkspaceContext();
    await expect(
      new ExportGodotProjectNode({
        template: "platformer",
        fills: stampedRefs()
      }).process(context)
    ).rejects.toThrow(/name is required/);
  });
});

describe("the packaged backend's missing template directory", () => {
  it("does not stop the module from loading", async () => {
    // The dropdown's options are read while the node registry is built. This
    // asserts the read happened and stayed inside its own failure: importing
    // the module is what the packaged backend does, and it must not throw.
    const module = await import("../src/nodes/game.js");
    expect(module.LoadGameTemplateNode.nodeType).toBe(
      "nodetool.game.LoadGameTemplate"
    );
  });

  it("fails the export with the reason, not a stack", async () => {
    const context = tempWorkspaceContext();
    context.setModelInterfaces({
      listGameTemplates: async () => [
        { id: "not-installed", manifest: { ...MANIFEST, template: "not-installed" } }
      ]
    });
    await expect(
      new ExportGodotProjectNode({
        template: "not-installed",
        name: "Platformer",
        fills: stampedRefs(),
        directory: "game"
      }).process(context)
    ).rejects.toThrow(/project directory is not installed/);
  });
});
