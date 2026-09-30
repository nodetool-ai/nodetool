import { describe, expect, it } from "vitest";

import type { Entity, Scene, Shot } from "../src/creative.js";
import { productionRequirement } from "../src/production-authoring.js";
import {
  currentRenderInputs,
  entityConditioningHash,
  isVersionStale,
  shotStaleness,
  stampRenderInputs,
  staleClipShots,
  staleKeyframeShots,
  versionId,
  type BoardRenderContext
} from "../src/render-record.js";

const SCENE: Scene = {
  type: "scene",
  id: "sc-1",
  slugline: "EXT. HARBOUR — DUSK",
  lighting: "last light, sodium spill from the road"
};

const BOARD: BoardRenderContext = {
  aspect_ratio: "16:9",
  image_model: "fal-ai/flux/dev",
  video_model: "fal-ai/kling-video/v1.6",
  style_entity_id: "ent-style-noir",
  style: "grainy 16mm, muted palette",
  scenes: [SCENE]
};

const ENTITY: Entity = {
  type: "entity",
  id: "character",
  kind: "character",
  name: "Mara",
  descriptor: "a lighthouse keeper in a wool coat",
  reference_images: [{ type: "image", asset_id: "reference-a" }]
};

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    type: "shot",
    id: "s1",
    index: 0,
    scene_id: SCENE.id,
    action: "a lighthouse against the swell",
    camera: { framing: "wide", angle: "low angle", lens: "85mm" },
    motion: "slow push in",
    status: "keyframe_ready",
    ...overrides
  };
}

/** A shot carrying a still and a clip, each stamped with today's inputs. */
function makeRenderedShot(board: BoardRenderContext = BOARD): Shot {
  const base = makeShot();
  const keyframe = {
    type: "image" as const,
    asset_id: "asset-still-1",
    render_inputs: stampRenderInputs(
      currentRenderInputs(base, board, "keyframe"),
      "2026-01-01T00:00:00.000Z"
    )
  };
  const withStill: Shot = { ...base, keyframe, keyframe_versions: [keyframe] };
  const clip = {
    type: "video" as const,
    asset_id: "asset-clip-1",
    render_inputs: stampRenderInputs(
      currentRenderInputs(withStill, board, "clip"),
      "2026-01-01T00:00:00.000Z"
    )
  };
  return { ...withStill, clip, clip_versions: [clip] };
}

describe("versionId", () => {
  it("prefers the stored asset id, falls back to the uri", () => {
    expect(versionId({ type: "image", asset_id: "a1", uri: "u1" })).toBe("a1");
    expect(versionId({ type: "image", uri: "u1" })).toBe("u1");
    expect(versionId(null)).toBe("");
  });
});
describe("currentRenderInputs", () => {
  it("names the still a keyframe-mode clip would animate", () => {
    const shot = makeRenderedShot();
    expect(currentRenderInputs(shot, BOARD, "clip").source_version_id).toBe(
      "asset-still-1"
    );
  });

  it("leaves a direct-mode clip without a source", () => {
    const shot = { ...makeRenderedShot(), render_mode: "direct" as const };
    expect(
      currentRenderInputs(shot, BOARD, "clip").source_version_id
    ).toBeUndefined();
  });

  it("hashes the composed prompt, so a rewritten action changes the record", () => {
    const shot = makeShot();
    const rewritten = makeShot({ action: "a lighthouse at first light" });
    expect(currentRenderInputs(shot, BOARD, "keyframe").prompt_hash).not.toBe(
      currentRenderInputs(rewritten, BOARD, "keyframe").prompt_hash
    );
  });

  it("hashes a reference-mode clip the way it is rendered", () => {
    // A reference clip has no still, so its prompt carries framing, lens,
    // lighting and style — the same composition a direct clip uses. Hashing
    // the keyframe-mode prompt instead left a style or framing edit invisible
    // to staleness, and `stale_only` skipped the re-render.
    const shot = makeShot({ render_mode: "reference" });
    expect(currentRenderInputs(shot, BOARD, "clip").prompt_hash).toBe(
      currentRenderInputs({ ...shot, render_mode: "direct" }, BOARD, "clip")
        .prompt_hash
    );
  });

  it("takes the image model for a still and the video model for a clip", () => {
    const shot = makeShot();
    expect(currentRenderInputs(shot, BOARD, "keyframe").model).toBe(
      BOARD.image_model
    );
    expect(currentRenderInputs(shot, BOARD, "clip").model).toBe(
      BOARD.video_model
    );
  });

  it("uses the shot's saved model before the board default", () => {
    const shot = makeShot({
      still_model: { id: "still-model", provider: "fal" },
      clip_model: { id: "clip-model", provider: "fal" }
    });
    expect(currentRenderInputs(shot, BOARD, "keyframe").model).toBe(
      "still-model"
    );
    expect(currentRenderInputs(shot, BOARD, "clip").model).toBe("clip-model");
  });
});

describe("isVersionStale", () => {
  it("keeps a promoted production clip fresh and detects changed board bindings", () => {
    const shot = makeShot({ render_mode: "direct" });
    const board = { ...BOARD, production_reference_asset_ids: ["product-a"] };
    const clip = {
      type: "video" as const,
      asset_id: "production-clip",
      render_inputs: stampRenderInputs({
        ...currentRenderInputs(shot, board, "clip"),
        render_mode: "reference",
        reference_asset_ids: ["product-a"]
      })
    };
    expect(isVersionStale(clip, shot, board)).toBe(false);
    expect(
      isVersionStale(clip, shot, {
        ...board,
        production_reference_asset_ids: ["product-b"]
      })
    ).toBe(true);
  });

  it("detects changed shot production bindings and local direction", () => {
    const shot = makeShot({
      render_mode: "direct",
      production: productionRequirement.parse({
        local_direction: "rotate the product slowly",
        reference_bindings: [{ kind: "product", asset_id: "product-a" }]
      })
    });
    const clip = {
      type: "video" as const,
      asset_id: "production-clip",
      render_inputs: stampRenderInputs(currentRenderInputs(shot, BOARD, "clip"))
    };
    expect(isVersionStale(clip, shot, BOARD)).toBe(false);
    expect(
      isVersionStale(
        clip,
        {
          ...shot,
          production: {
            ...shot.production!,
            local_direction: "hold the product still"
          }
        },
        BOARD
      )
    ).toBe(true);
    expect(
      isVersionStale(
        clip,
        {
          ...shot,
          production: {
            ...shot.production!,
            reference_bindings: [{ kind: "product", asset_id: "product-b" }]
          }
        },
        BOARD
      )
    ).toBe(true);
  });

  it.each([
    {
      name: "descriptor",
      change: { descriptor: "a lighthouse keeper in a raincoat" }
    },
    {
      name: "reference identity",
      change: {
        reference_images: [{ type: "image" as const, asset_id: "reference-b" }]
      }
    },
    {
      name: "inline reference content",
      change: {
        reference_images: [
          {
            type: "image" as const,
            asset_id: "reference-a",
            data: new Uint8Array([1, 2, 3])
          }
        ]
      }
    }
  ])("marks a still stale when only entity $name changes", ({ change }) => {
    const board = {
      ...BOARD,
      entity_conditioning_hash: entityConditioningHash([ENTITY])
    };
    const shot = makeRenderedShot(board);
    expect(isVersionStale(shot.keyframe, shot, board)).toBe(false);
    expect(
      isVersionStale(shot.keyframe, shot, {
        ...board,
        entity_conditioning_hash: entityConditioningHash([
          { ...ENTITY, ...change }
        ])
      })
    ).toBe(true);
  });

  it("marks a rendered still stale when only its reference image changes", () => {
    const board = { ...BOARD, reference_asset_ids: ["reference-a"] };
    const shot = makeRenderedShot(board);
    expect(isVersionStale(shot.keyframe, shot, board)).toBe(false);
    expect(
      isVersionStale(shot.keyframe, shot, {
        ...board,
        reference_asset_ids: ["reference-b"]
      })
    ).toBe(true);
  });

  const referencePromptChanges: Array<{
    name: string;
    board?: Partial<BoardRenderContext>;
    shot?: Partial<Shot>;
  }> = [
    {
      name: "framing",
      shot: { camera: { framing: "close", angle: "low angle", lens: "85mm" } }
    },
    {
      name: "scene lighting",
      board: { scenes: [{ ...SCENE, lighting: "hard noon sun" }] }
    },
    { name: "board style text", board: { style: "high-key, clean" } }
  ];

  for (const change of referencePromptChanges) {
    it(`reads a reference-mode clip as stale after changing ${change.name}`, () => {
      const shot = makeShot({ render_mode: "reference" });
      const clip = {
        type: "video" as const,
        asset_id: "asset-clip-1",
        render_inputs: stampRenderInputs(
          currentRenderInputs(shot, BOARD, "clip"),
          "2026-01-01T00:00:00.000Z"
        )
      };
      const rendered: Shot = { ...shot, clip, clip_versions: [clip] };
      expect(isVersionStale(clip, rendered, BOARD)).toBe(false);
      expect(
        isVersionStale(
          clip,
          { ...rendered, ...change.shot },
          { ...BOARD, ...change.board }
        )
      ).toBe(true);
    });
  }

  it.each([
    { recordedMode: "keyframe" as const, changedMode: "direct" as const },
    { recordedMode: "direct" as const, changedMode: "keyframe" as const }
  ])(
    "keeps an unchanged legacy $recordedMode clip fresh and detects a change to $changedMode",
    ({ recordedMode, changedMode }) => {
      const withStill = makeRenderedShot();
      const original: Shot = { ...withStill, render_mode: recordedMode };
      const renderInputs = stampRenderInputs(
        currentRenderInputs(original, BOARD, "clip"),
        "2026-01-01T00:00:00.000Z"
      );
      delete renderInputs.render_mode;
      const legacyClip = {
        type: "video" as const,
        asset_id: `legacy-${recordedMode}`,
        render_inputs: renderInputs
      };
      const rendered: Shot = {
        ...original,
        clip: legacyClip,
        clip_versions: [legacyClip]
      };

      expect(isVersionStale(legacyClip, rendered, BOARD)).toBe(false);
      expect(
        isVersionStale(
          legacyClip,
          { ...rendered, render_mode: changedMode },
          BOARD
        )
      ).toBe(true);
    }
  );

  it("reads a version rendered from today's inputs as current", () => {
    const shot = makeRenderedShot();
    expect(shotStaleness(shot, BOARD)).toEqual({
      keyframe: false,
      clip: false
    });
  });

  it("never reads a version without a record as stale", () => {
    const shot = makeShot({
      // An upload, a flip and an image-editor edit all land like this.
      keyframe: { type: "image", asset_id: "uploaded" }
    });
    expect(isVersionStale(shot.keyframe, shot, BOARD)).toBe(false);
  });

  it("does not treat a recovered render with unknown provenance as fresh", () => {
    const shot = makeShot({
      keyframe: {
        type: "image",
        asset_id: "recovered",
        render_provenance: "unknown"
      }
    });
    expect(isVersionStale(shot.keyframe, shot, BOARD)).toBe(true);
  });

  // One case per input the record carries (PRD § 7.7.4).
  const changes: Array<{
    name: string;
    board?: Partial<BoardRenderContext>;
    shot?: Partial<Shot>;
    kind: "keyframe" | "clip";
  }> = [
    {
      name: "the prompt",
      shot: { action: "a different lighthouse" },
      kind: "keyframe"
    },
    {
      name: "the image model",
      board: { image_model: "other/model" },
      kind: "keyframe"
    },
    {
      name: "the video model",
      board: { video_model: "other/model" },
      kind: "clip"
    },
    {
      name: "the aspect ratio",
      board: { aspect_ratio: "9:16" },
      kind: "keyframe"
    },
    {
      name: "the style entity",
      board: { style_entity_id: "ent-style-warm" },
      kind: "keyframe"
    },
    {
      name: "the style descriptor",
      board: { style: "clean digital, high key" },
      kind: "keyframe"
    },
    {
      name: "the scene's lighting",
      board: { scenes: [{ ...SCENE, lighting: "hard noon sun" }] },
      kind: "keyframe"
    }
  ];

  for (const change of changes) {
    it(`reads a version stale after ${change.name} changes`, () => {
      const rendered = makeRenderedShot();
      const shot = { ...rendered, ...change.shot };
      const board = { ...BOARD, ...change.board };
      const version = change.kind === "keyframe" ? shot.keyframe : shot.clip;
      expect(isVersionStale(version, shot, board)).toBe(true);
    });
  }

  it("reads a keyframe-mode clip stale when another take is selected", () => {
    const rendered = makeRenderedShot();
    const other = { type: "image" as const, asset_id: "asset-still-2" };
    const shot: Shot = {
      ...rendered,
      keyframe: other,
      keyframe_versions: [...(rendered.keyframe_versions ?? []), other]
    };
    expect(isVersionStale(shot.clip, shot, BOARD)).toBe(true);
    // The still itself did not change — only which one the clip should animate.
    expect(isVersionStale(rendered.keyframe, shot, BOARD)).toBe(false);
  });

  it("keeps a landing render stale when the style moved while it was in flight", () => {
    // The job was enqueued against the old style and stamped then; the asset
    // lands after `setStylePreset` ran (criterion 8).
    const enqueued = makeRenderedShot();
    const afterStyleChange: BoardRenderContext = {
      ...BOARD,
      style_entity_id: "ent-style-warm",
      style: "warm tungsten, soft halation"
    };
    expect(isVersionStale(enqueued.keyframe, enqueued, afterStyleChange)).toBe(
      true
    );
  });

  it("ignores recorded_at, which is a fact about the job and not an input", () => {
    const shot = makeRenderedShot();
    const later = {
      ...shot.keyframe!,
      render_inputs: {
        ...shot.keyframe!.render_inputs!,
        recorded_at: "2027-06-06T12:00:00.000Z"
      }
    };
    expect(isVersionStale(later, shot, BOARD)).toBe(false);
  });
});

describe("entityConditioningHash", () => {
  it("ignores entity notes and secondary images absent from the still request", () => {
    expect(entityConditioningHash([ENTITY])).toBe(
      entityConditioningHash([
        {
          ...ENTITY,
          description: "notes for the crew",
          updated_at: "2027-01-01",
          reference_images: [
            ENTITY.reference_images![0],
            { type: "image", asset_id: "secondary" }
          ]
        }
      ])
    );
  });

  it("tracks URI and inline content changes for images without stored asset ids", () => {
    const withImage = (uri: string, data: Uint8Array): Entity => ({
      ...ENTITY,
      reference_images: [{ type: "image", uri, data }]
    });
    const before = entityConditioningHash([
      withImage("file://reference.png", new Uint8Array([1]))
    ]);
    expect(
      entityConditioningHash([
        withImage("file://other.png", new Uint8Array([1]))
      ])
    ).not.toBe(before);
    expect(
      entityConditioningHash([
        withImage("file://reference.png", new Uint8Array([2]))
      ])
    ).not.toBe(before);
  });

  it("leaves unconditioned stills compatible with legacy records", () => {
    expect(entityConditioningHash([])).toBeUndefined();
  });
});

describe("stale selections across a board", () => {
  it("returns only the shots whose selection is out of date", () => {
    const current = makeRenderedShot();
    const outdated: Shot = {
      ...makeRenderedShot(),
      id: "s2",
      index: 1,
      action: "the keeper climbs the stair"
    };
    const untouched = makeShot({
      id: "s3",
      index: 2,
      keyframe: null,
      clip: null
    });
    const shots = [current, outdated, untouched];

    expect(staleKeyframeShots(shots, BOARD).map((s) => s.id)).toEqual(["s2"]);
    expect(staleClipShots(shots, BOARD).map((s) => s.id)).toEqual(["s2"]);
  });
});
