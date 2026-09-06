/**
 * The twelve shipped style presets: seeding and read-only enforcement.
 *
 * Seeding runs against the real database, because the property that matters —
 * a second seed adds nothing — is a property of the rows, not of the function's
 * return value.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  ENTITY_METADATA_KEY,
  STYLE_PRESETS,
  isSystemEntityMetadata
} from "@nodetool-ai/protocol";

import {
  seedStylePresets,
  stylePresetAssetId
} from "../src/lib/style-presets.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";
const OTHER_USER = "user-2";

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

describe("style presets", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  it("ships twelve presets, each with a distinct descriptor and thumbnail", () => {
    expect(STYLE_PRESETS).toHaveLength(12);
    expect(new Set(STYLE_PRESETS.map((p) => p.id)).size).toBe(12);
    expect(new Set(STYLE_PRESETS.map((p) => p.descriptor)).size).toBe(12);
    for (const preset of STYLE_PRESETS) {
      expect(preset.name).not.toBe("");
      expect(preset.descriptor.length).toBeGreaterThan(60);
      expect(preset.thumbnail).toMatch(/^package:\/\/[^\s]+\.jpg$/);
    }
  });

  it("seeds one style entity per preset", async () => {
    const seeded = await seedStylePresets(USER_ID);

    expect(seeded).toHaveLength(STYLE_PRESETS.length);
    const rows = await entityRows(USER_ID);
    expect(rows).toHaveLength(STYLE_PRESETS.length);
    for (const preset of STYLE_PRESETS) {
      const row = rows.find(
        (asset) => asset.id === stylePresetAssetId(USER_ID, preset.id)
      );
      expect(row, `no row for ${preset.id}`).toBeDefined();
      const marker = row?.metadata?.[ENTITY_METADATA_KEY] as Record<
        string,
        unknown
      >;
      expect(marker.kind).toBe("style");
      expect(marker.descriptor).toBe(preset.descriptor);
      expect(marker.thumbnail).toBe(preset.thumbnail);
      expect(marker.system).toBe(true);
    }
  });

  it("is idempotent — seeding twice leaves one row per preset", async () => {
    const first = await seedStylePresets(USER_ID);
    const second = await seedStylePresets(USER_ID);

    expect(await entityRows(USER_ID)).toHaveLength(STYLE_PRESETS.length);
    expect(second.map((a) => a.id)).toEqual(first.map((a) => a.id));
  });

  it("gives each user their own rows", async () => {
    await seedStylePresets(USER_ID);
    await seedStylePresets(OTHER_USER);

    expect(await entityRows(USER_ID)).toHaveLength(STYLE_PRESETS.length);
    expect(await entityRows(OTHER_USER)).toHaveLength(STYLE_PRESETS.length);
    expect(stylePresetAssetId(USER_ID, "noir")).not.toBe(
      stylePresetAssetId(OTHER_USER, "noir")
    );
  });

  it("marks every seeded row as a system entity", async () => {
    const seeded = await seedStylePresets(USER_ID);
    for (const asset of seeded) {
      expect(isSystemEntityMetadata(asset.metadata)).toBe(true);
      expect(Asset.systemEntityRefusal(asset)).not.toBeNull();
    }
  });

  it("leaves an ordinary asset writable", async () => {
    const asset = new Asset({
      user_id: USER_ID,
      name: "my-look.jpg",
      content_type: "image/jpeg",
      metadata: {
        [ENTITY_METADATA_KEY]: {
          kind: "style",
          name: "My look",
          descriptor: "hand-held super 8"
        }
      }
    });
    await asset.save();
    expect(Asset.systemEntityRefusal(asset)).toBeNull();
  });

  describe("read-only enforcement", () => {
    it("refuses a patch of a seeded preset through the assets router", async () => {
      const [preset] = await seedStylePresets(USER_ID);
      const caller = createCaller(makeCtx(USER_ID));

      await expect(
        caller.assets.update({
          id: preset.id,
          metadata: {
            [ENTITY_METADATA_KEY]: {
              kind: "style",
              name: "Hijacked",
              descriptor: "whatever I want"
            }
          }
        })
      ).rejects.toThrow(/shipped style preset/);

      const reread = await Asset.find(USER_ID, preset.id);
      const marker = reread?.metadata?.[ENTITY_METADATA_KEY] as Record<
        string,
        unknown
      >;
      expect(marker.descriptor).toBe(STYLE_PRESETS[0].descriptor);
    });

    it("refuses a delete of a seeded preset through the assets router", async () => {
      const [preset] = await seedStylePresets(USER_ID);
      const caller = createCaller(makeCtx(USER_ID));

      await expect(
        caller.assets.delete({ id: preset.id })
      ).rejects.toThrow(/shipped style preset/);
      expect(await Asset.find(USER_ID, preset.id)).not.toBeNull();
    });
  });

  describe("storyboards.stylePresets", () => {
    it("seeds on first call and returns the ids the style step applies", async () => {
      const caller = createCaller(makeCtx(USER_ID));

      const presets = await caller.storyboards.stylePresets();
      expect(presets.map((p) => p.presetId)).toEqual(
        STYLE_PRESETS.map((p) => p.id)
      );
      for (const preset of presets) {
        expect(preset.entityId).toBe(
          stylePresetAssetId(USER_ID, preset.presetId)
        );
      }

      const again = await caller.storyboards.stylePresets();
      expect(again).toEqual(presets);
      expect(await entityRows(USER_ID)).toHaveLength(STYLE_PRESETS.length);
    });
  });
});
