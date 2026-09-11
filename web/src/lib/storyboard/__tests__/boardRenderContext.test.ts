import {
  currentRenderInputs,
  isVersionStale,
  stampRenderInputs
} from "@nodetool-ai/protocol";
import type { Entity, Shot } from "@nodetool-ai/protocol";

import { boardRenderContext } from "../boardRenderContext";

const entity = (id: string, kind: Entity["kind"]): Entity => ({
  type: "entity",
  id,
  kind,
  name: id,
  descriptor: `${id} descriptor`
});

const LIBRARY: Entity[] = [
  entity("char-1", "character"),
  entity("style-a", "style"),
  entity("loc-1", "location"),
  entity("style-b", "style")
];

const BOARD = {
  aspectRatio: "9:16",
  style: "grainy 16mm",
  entityIds: ["char-1", "style-a"],
  imageModel: { id: "fal-ai/flux/dev" },
  videoModel: { id: "fal-ai/kling/v1.6" },
  screenplay: { scenes: [] }
};

describe("boardRenderContext", () => {
  it("projects the board's models, aspect and style", () => {
    expect(boardRenderContext(BOARD, LIBRARY)).toEqual({
      aspect_ratio: "9:16",
      image_model: "fal-ai/flux/dev",
      video_model: "fal-ai/kling/v1.6",
      style_entity_id: "style-a",
      style: "grainy 16mm",
      scenes: [],
      reference_asset_ids: []
    });
  });

  it("uses the shot's remembered models ahead of board defaults", () => {
    const shot: Shot = {
      type: "shot",
      id: "shot-models",
      index: 0,
      action: "A model-aware shot",
      status: "planned",
      still_model: { id: "shot/still", provider: "atlascloud" },
      clip_model: { id: "shot/clip", provider: "atlascloud" }
    };

    expect(boardRenderContext(BOARD, LIBRARY, shot)).toMatchObject({
      image_model: "shot/still",
      video_model: "shot/clip"
    });
  });

  it("ignores entities that are not styles", () => {
    const board = { ...BOARD, entityIds: ["char-1", "loc-1"] };
    expect(boardRenderContext(board, LIBRARY).style_entity_id).toBeNull();
  });

  // The case the two old derivations disagreed on: one took the first style
  // entity, the other the last. A board carrying two would have compared its
  // records against a different style than the one they were stamped with, and
  // read stale forever.
  it("takes the last style entity when a board carries more than one", () => {
    const board = { ...BOARD, entityIds: ["style-a", "char-1", "style-b"] };
    expect(boardRenderContext(board, LIBRARY).style_entity_id).toBe("style-b");
  });

  it("reads no style entity from an empty selection or an empty library", () => {
    expect(
      boardRenderContext({ ...BOARD, entityIds: [] }, LIBRARY).style_entity_id
    ).toBeNull();
    expect(boardRenderContext(BOARD, []).style_entity_id).toBeNull();
  });

  it("includes selected entity references, including URI-only assets", () => {
    const library = [
      {
        ...entity("char-1", "character"),
        reference_images: [
          { type: "image" as const, asset_id: "first" },
          { type: "image" as const, uri: "asset://second.png" }
        ]
      }
    ];
    expect(boardRenderContext(BOARD, library).reference_asset_ids).toEqual([
      "first",
      "second"
    ]);
  });

  it("matches generation selection and order, and marks changed references stale", () => {
    const shot: Shot = {
      type: "shot",
      id: "shot",
      index: 0,
      action: "char-1 walks",
      status: "planned",
      render_mode: "reference"
    };
    const library: Entity[] = [
      {
        ...entity("outside", "style"),
        reference_images: [{ type: "image", asset_id: "outside" }]
      },
      {
        ...entity("style-a", "style"),
        reference_images: [{ type: "image", asset_id: "style" }]
      },
      {
        ...entity("char-1", "character"),
        reference_images: [{ type: "image", asset_id: "character" }]
      }
    ];
    const context = boardRenderContext(BOARD, library, shot);
    expect(context.reference_asset_ids).toEqual(["character", "style"]);
    const clip = {
      type: "video" as const,
      asset_id: "clip",
      render_inputs: stampRenderInputs(
        currentRenderInputs(shot, context, "clip")
      )
    };
    expect(isVersionStale(clip, shot, context)).toBe(false);
    const changed = library.map((entry) =>
      entry.id === "char-1"
        ? {
            ...entry,
            reference_images: [
              { type: "image" as const, asset_id: "new-character" }
            ]
          }
        : entry
    );
    expect(
      isVersionStale(clip, shot, boardRenderContext(BOARD, changed, shot))
    ).toBe(true);
    expect(
      boardRenderContext(BOARD, library, {
        ...shot,
        entity_ids: ["style-a", "char-1"]
      }).reference_asset_ids
    ).toEqual(["character", "style"]);
  });

  it("falls back to 16:9 and empty models for a board that has none", () => {
    expect(boardRenderContext(undefined, LIBRARY)).toEqual({
      aspect_ratio: "16:9",
      image_model: "",
      video_model: "",
      style_entity_id: null,
      style: "",
      scenes: null,
      reference_asset_ids: []
    });
  });
});
