/**
 * @jest-environment node
 *
 * The board's cast holds every entity its shots reference. `entitiesForShot`
 * filters the board's entities by the shot's `entity_ids`, so an id an agent
 * put on a shot without casting it on the board resolves to nothing — the chip
 * shows, the picker does not list it, and the prompt is not seasoned with it.
 * Loading a board reconciles the two.
 */

import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import { useStoryboardStore } from "../StoryboardStore";

const BOARD = "board-entity-cast";

const shot = (id: string, index: number, entityIds?: string[]): Shot => {
  const s: Shot = {
    type: "shot",
    id,
    index,
    action: `${id} action`,
    status: "planned"
  };
  if (entityIds) {
    s.entity_ids = entityIds;
  }
  return s;
};

const load = (entityIds: string[], shots: Shot[]): void => {
  useStoryboardStore.getState().loadBoard(BOARD, {
    screenplay: null,
    shots,
    title: "Fixture",
    brief: "",
    style: "",
    entityIds,
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("board cast on load", () => {
  it("adds shot entities the board is missing", () => {
    load(["e_style"], [shot("s1", 0, ["e_style", "e_hero"]), shot("s2", 1, ["e_prop"])]);
    expect(useStoryboardStore.getState().getBoard(BOARD)?.entityIds).toEqual([
      "e_style",
      "e_hero",
      "e_prop"
    ]);
  });

  it("leaves an already-consistent cast alone", () => {
    load(["e_a", "e_b"], [shot("s1", 0, ["e_b"]), shot("s2", 1)]);
    expect(useStoryboardStore.getState().getBoard(BOARD)?.entityIds).toEqual([
      "e_a",
      "e_b"
    ]);
  });

  it("keeps shot entities when a screenplay replaces the cast", () => {
    const shots = [shot("s1", 0, ["e_hero"])];
    load([], shots);
    const screenplay: Screenplay = {
      type: "screenplay",
      id: "play-1",
      title: "Fixture",
      shots,
      entity_ids: ["e_style"]
    };
    useStoryboardStore.getState().setScreenplay(BOARD, screenplay);
    expect(useStoryboardStore.getState().getBoard(BOARD)?.entityIds).toEqual([
      "e_style",
      "e_hero"
    ]);
  });
});
