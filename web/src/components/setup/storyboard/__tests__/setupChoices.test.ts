/**
 * What a re-direct keeps so the review step can put it back (F15, F2).
 *
 * `board.screenplay.shots` is what the Director wrote; every review edit —
 * an action line, an added shot, a reorder, the title — lands on the board
 * instead. Saving the screenplay object as-is therefore offered the creator a
 * restore that dropped exactly the edits the restore is for.
 */
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { boardScreenplaySnapshot } from "../setupChoices";

const BOARD_ID = "b1";

const shot = (id: string, index: number, action: string): Shot => ({
  type: "shot",
  id,
  index,
  action,
  status: "planned"
});

const screenplay = (shots: Shot[]): Screenplay => ({
  type: "screenplay",
  id: "sp1",
  title: "The Director's title",
  shots
});

beforeEach(() => {
  useStoryboardStore.setState({ boards: {} });
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
});

describe("boardScreenplaySnapshot", () => {
  it("takes the shots the creator edited, not the Director's originals", () => {
    const store = useStoryboardStore.getState();
    store.setScreenplay(BOARD_ID, screenplay([shot("s1", 0, "A lamp, wide")]));
    store.updateShot(BOARD_ID, "s1", { action: "A lamp, macro on the switch" });
    store.upsertShot(BOARD_ID, shot("s2", 1, "Cut to the desk"));
    store.setTitle(BOARD_ID, "My title");

    const kept = boardScreenplaySnapshot(
      useStoryboardStore.getState().getBoard(BOARD_ID)
    );

    expect(kept?.title).toBe("My title");
    expect(kept?.shots.map((s) => s.action)).toEqual([
      "A lamp, macro on the switch",
      "Cut to the desk"
    ]);
    // The original is still on the board, untouched — that is the bug: it is
    // what the snapshot used to hand back.
    expect(
      useStoryboardStore.getState().getBoard(BOARD_ID)?.screenplay?.shots
    ).toHaveLength(1);
  });

  it("carries the board's own look and cast", () => {
    const store = useStoryboardStore.getState();
    store.setScreenplay(BOARD_ID, screenplay([shot("s1", 0, "A lamp, wide")]));
    store.setStyle(BOARD_ID, "high contrast black and white");
    store.setAspectRatio(BOARD_ID, "9:16");
    store.setEntityIds(BOARD_ID, ["ent-lamp"]);
    store.setBrief(BOARD_ID, "a lamp at night");

    const kept = boardScreenplaySnapshot(
      useStoryboardStore.getState().getBoard(BOARD_ID)
    );

    expect(kept?.style_bible).toBe("high contrast black and white");
    expect(kept?.aspect_ratio).toBe("9:16");
    expect(kept?.entity_ids).toEqual(["ent-lamp"]);
    expect(kept?.brief).toBe("a lamp at night");
  });

  it("keeps a hand-built board's shots, which have no screenplay at all", () => {
    useStoryboardStore.getState().upsertShot(BOARD_ID, shot("s1", 0, "A lamp"));

    const kept = boardScreenplaySnapshot(
      useStoryboardStore.getState().getBoard(BOARD_ID)
    );

    expect(kept?.shots.map((s) => s.id)).toEqual(["s1"]);
  });

  it("keeps nothing for a board with neither", () => {
    expect(
      boardScreenplaySnapshot(
        useStoryboardStore.getState().getBoard(BOARD_ID)
      )
    ).toBeNull();
  });
});
