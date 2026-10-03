import { expect, it } from "vitest";
import { storyboardResponse } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import { Storyboard, emptyStoryboardDocument } from "../src/storyboard.js";

it("returns a valid screenplay for an existing board with a stale screenplay shot list", () => {
  const shots = ["first", "second"].map((id, index) => ({
    type: "shot", id, index, action: id, status: "planned"
  }));
  const board = new Storyboard({
    user_id: "u1", project_id: "default", name: "Price Drop",
    document: JSON.stringify({
      ...emptyStoryboardDocument(), shots,
      screenplay: {type: "screenplay", id: "screenplay", title: "", shots: [],
        motion_design: {
          transitions: [{from_shot_id: "first", to_shot_id: "second", direction: "fade"}],
          continuities: [{id: "background", shot_ids: ["first", "second"], direction: "continue"}]
        }
      }
    })
  });
  expect(storyboardResponse.safeParse(board.toResponse()).success).toBe(true);
  expect(board.toDocument().screenplay?.shots).toEqual(shots);
});
