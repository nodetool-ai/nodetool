import type { Entity } from "@nodetool-ai/protocol";

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
      scenes: []
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

  it("falls back to 16:9 and empty models for a board that has none", () => {
    expect(boardRenderContext(undefined, LIBRARY)).toEqual({
      aspect_ratio: "16:9",
      image_model: "",
      video_model: "",
      style_entity_id: null,
      style: "",
      scenes: null
    });
  });
});
