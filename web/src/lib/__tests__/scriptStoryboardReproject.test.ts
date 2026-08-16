/**
 * @jest-environment node
 *
 * Re-projection: the script's words onto the board (design §2.5). The opposite
 * direction from extraction, so these tests pin that script text wins and that
 * snapshot plus projected text move together in one board write.
 */

import type { Shot } from "@nodetool-ai/protocol";
import type { scripts } from "@nodetool-ai/protocol/api-schemas";

import {
  driftedShotIds,
  projectionSource,
  reprojectShot,
  reprojectedShots
} from "../scriptStoryboardLink";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

const line = (
  id: string,
  text: string,
  speakerId: string | null = "speaker_kim"
): scripts.ScriptLine => ({ id, text, speakerId, takes: [] });

const document = (lines: scripts.ScriptLine[]): scripts.ScriptDocumentSchema => ({
  cast: [
    { id: "speaker_kim", name: "Kim", voice: null },
    { id: "speaker_narrator", name: "Narrator", voice: null }
  ],
  sections: [{ id: "sec-1", title: "Scene", lines }]
});

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

describe("reprojectShot", () => {
  it("re-reads a drifted shot's dialogue and snapshot from the script", () => {
    const source = projectionSource(document([line("l1", "We are open.")]));
    const before = shot({
      dialogue: "We are closed.",
      script_line_ids: ["l1"],
      script_text_snapshot: "We are closed."
    });

    const after = reprojectShot(before, source);

    expect(after.dialogue).toBe("We are open.");
    expect(after.script_text_snapshot).toBe("We are open.");
  });

  it("splits narrator lines into narration and cast lines into dialogue", () => {
    const source = projectionSource(
      document([
        line("l1", "Kim speaks."),
        line("l2", "The sea is grey.", "speaker_narrator")
      ])
    );

    const after = reprojectShot(
      shot({
        script_line_ids: ["l1", "l2"],
        script_text_snapshot: "old"
      }),
      source
    );

    expect(after.dialogue).toBe("Kim speaks.");
    expect(after.narration).toBe("The sea is grey.");
    expect(after.script_text_snapshot).toBe("Kim speaks.\nThe sea is grey.");
  });

  it("drops a projected field the script no longer fills", () => {
    const source = projectionSource(
      document([line("l1", "Just narration now.", null)])
    );

    const after = reprojectShot(
      shot({
        dialogue: "We are closed.",
        script_line_ids: ["l1"],
        script_text_snapshot: "We are closed."
      }),
      source
    );

    expect(after.narration).toBe("Just narration now.");
    expect("dialogue" in after).toBe(false);
  });

  it("returns the same shot when the script matches what was projected", () => {
    const source = projectionSource(document([line("l1", "We are closed.")]));
    const before = shot({
      dialogue: "We are closed.",
      script_line_ids: ["l1"],
      script_text_snapshot: "We are closed."
    });

    expect(reprojectShot(before, source)).toBe(before);
  });

  it("returns the same shot when it links no lines", () => {
    const source = projectionSource(document([line("l1", "We are open.")]));
    const before = shot({ dialogue: "We are closed." });

    expect(reprojectShot(before, source)).toBe(before);
  });

  it("treats a missing line as contributing nothing, like drift does", () => {
    const source = projectionSource(document([line("l1", "We are open.")]));
    const before = shot({
      dialogue: "We are open.\nAnd busy.",
      script_line_ids: ["l1", "gone"],
      script_text_snapshot: "We are open.\nAnd busy."
    });

    const after = reprojectShot(before, source);

    expect(after.dialogue).toBe("We are open.");
    expect(after.script_text_snapshot).toBe("We are open.");
  });
});

describe("reprojectedShots", () => {
  const source = projectionSource(
    document([line("l1", "We are open."), line("l2", "Come in.")])
  );

  const drifted = shot({
    id: "drifted",
    dialogue: "We are closed.",
    script_line_ids: ["l1"],
    script_text_snapshot: "We are closed."
  });
  const settled = shot({
    id: "settled",
    index: 1,
    dialogue: "Come in.",
    script_line_ids: ["l2"],
    script_text_snapshot: "Come in."
  });

  it("re-projects the drifted shot and leaves the settled one untouched", () => {
    const next = reprojectedShots([drifted, settled], source);

    expect(next[0].dialogue).toBe("We are open.");
    expect(next[1]).toBe(settled);
  });

  it("returns the same array when nothing drifted", () => {
    const shots = [settled];
    expect(reprojectedShots(shots, source)).toBe(shots);
  });

  it("passes over only the named shots when ids are given", () => {
    const next = reprojectedShots([drifted, settled], source, ["settled"]);

    expect(next[0]).toBe(drifted);
    expect(next[1]).toBe(settled);
  });

  it("names the drifted shots", () => {
    expect(driftedShotIds([drifted, settled], source.linesById)).toEqual([
      "drifted"
    ]);
  });
});

describe("StoryboardStore.reprojectShots", () => {
  const BOARD = "board-reproject";

  const seed = (): void => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.loadBoard(BOARD, {
      screenplay: {
        type: "screenplay",
        id: "sp-1",
        title: "My film",
        script_id: "script-1",
        shots: []
      },
      shots: [
        shot({
          id: "shot-1",
          dialogue: "We are closed.",
          script_line_ids: ["l1"],
          script_text_snapshot: "We are closed."
        })
      ],
      title: "My film",
      brief: "",
      style: "",
      entityIds: [],
      aspectRatio: "16:9",
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

  it("writes the text and its snapshot in one board update", () => {
    seed();
    const source = projectionSource(document([line("l1", "We are open.")]));
    let writes = 0;
    const unsubscribe = useStoryboardStore.subscribe((state, prev) => {
      if (state.boards[BOARD] !== prev.boards[BOARD]) writes += 1;
    });

    useStoryboardStore.getState().reprojectShots(BOARD, source);
    unsubscribe();

    const board = useStoryboardStore.getState().getBoard(BOARD);
    expect(writes).toBe(1);
    expect(board?.shots[0].dialogue).toBe("We are open.");
    expect(board?.shots[0].script_text_snapshot).toBe("We are open.");
    // The screenplay carries the same shots the surface renders.
    expect(board?.screenplay?.shots).toBe(board?.shots);
  });

  it("does not touch the board when no shot drifted", () => {
    seed();
    const before = useStoryboardStore.getState().getBoard(BOARD);
    const source = projectionSource(document([line("l1", "We are closed.")]));

    useStoryboardStore.getState().reprojectShots(BOARD, source);

    expect(useStoryboardStore.getState().getBoard(BOARD)).toBe(before);
  });

  it("re-projects only the shots it is given", () => {
    seed();
    const source = projectionSource(document([line("l1", "We are open.")]));

    useStoryboardStore.getState().reprojectShots(BOARD, source, ["other"]);

    expect(
      useStoryboardStore.getState().getBoard(BOARD)?.shots[0].dialogue
    ).toBe("We are closed.");
  });
});
