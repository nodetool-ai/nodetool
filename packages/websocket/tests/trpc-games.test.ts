/**
 * The `games` router: the manifests the design step reads, and the six game
 * style presets the look step applies (game-prd § 6.1, § 5.6).
 *
 * Seeding runs against the real database, because the property that matters —
 * a second seed adds nothing — is a property of the rows, not of the function's
 * return value. The templates half is read off the shipped manifests, so a
 * template whose slots stop parsing fails here rather than in the flow.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  ENTITY_METADATA_KEY,
  GAME_STYLE_PRESETS,
  STYLE_PRESETS,
  isSystemEntityMetadata
} from "@nodetool-ai/protocol";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";

const createCaller = createCallerFactory(appRouter);

const makeCtx = (userId: string): Context =>
  ({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  }) as Context;

/** Every asset row in the user's library that carries an entity marker. */
async function entityRows(userId: string): Promise<Asset[]> {
  const [assets] = await Asset.paginate(userId, { limit: 1000 });
  return assets.filter((asset) => !!asset.metadata?.[ENTITY_METADATA_KEY]);
}

describe("games.templates", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("returns the three shipped templates with their slots and hooks", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const templates = await caller.games.templates();
    expect(templates.map((t) => t.id).sort()).toEqual([
      "platformer",
      "shmup",
      "topdown"
    ]);
    for (const template of templates) {
      expect(template.godot).toMatch(/^\d+\.\d+$/);
      expect(template.slots.length).toBeGreaterThan(0);
      expect(template.hooks.length).toBeGreaterThan(0);
    }
    const platformer = templates.find((t) => t.id === "platformer");
    expect(platformer?.slots).toHaveLength(8);
    expect(platformer?.hooks).toContain("scripts/player.gd");
  });

  it("writes nothing", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    await caller.games.templates();
    expect(await entityRows(USER_ID)).toHaveLength(0);
  });
});

describe("games.stylePresets", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("ships six presets, each with a distinct descriptor and tile", () => {
    expect(GAME_STYLE_PRESETS).toHaveLength(6);
    expect(new Set(GAME_STYLE_PRESETS.map((p) => p.id)).size).toBe(6);
    expect(new Set(GAME_STYLE_PRESETS.map((p) => p.descriptor)).size).toBe(6);
    for (const preset of GAME_STYLE_PRESETS) {
      expect(preset.thumbnail).toMatch(
        /^package:\/\/nodetool-base\/styles\/game-[a-z0-9-]+\.png$/
      );
    }
    // The two sets share one seeder, so their ids must not collide.
    const storyboard = new Set(STYLE_PRESETS.map((p) => p.id));
    for (const preset of GAME_STYLE_PRESETS) {
      expect(storyboard.has(preset.id)).toBe(false);
    }
  });

  it("seeds six read-only rows and returns them in shipped order", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const seeded = await caller.games.stylePresets();
    expect(seeded.map((entity) => entity.presetId)).toEqual(
      GAME_STYLE_PRESETS.map((preset) => preset.id)
    );
    const rows = await entityRows(USER_ID);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(isSystemEntityMetadata(row.metadata)).toBe(true);
    }
  });

  it("is idempotent: a second call adds no rows and keeps the ids", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const first = await caller.games.stylePresets();
    const second = await caller.games.stylePresets();
    expect(second.map((e) => e.entityId)).toEqual(first.map((e) => e.entityId));
    expect(await entityRows(USER_ID)).toHaveLength(6);
  });

  it("seeds beside the storyboard presets rather than replacing them", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    await caller.storyboards.stylePresets();
    await caller.games.stylePresets();
    expect(await entityRows(USER_ID)).toHaveLength(
      STYLE_PRESETS.length + GAME_STYLE_PRESETS.length
    );
  });
});
