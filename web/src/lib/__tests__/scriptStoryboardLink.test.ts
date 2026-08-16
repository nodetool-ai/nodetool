/**
 * @jest-environment node
 */

import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import {
  boardLinkIssues,
  extractScriptFromBoard,
  lineTextsById,
  linkedScriptId,
  scaffoldShots,
  unlinkedShots
} from "../scriptStoryboardLink";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../stores/script/ScriptStore";

const shot = (id: string, overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const board = (overrides: Partial<StoryboardBoard> = {}): StoryboardBoard => {
  const shots = overrides.shots ?? [shot("shot-1", { dialogue: "We are closed." })];
  const screenplay: Screenplay = {
    type: "screenplay",
    id: "sp-1",
    title: "My film",
    shots
  };
  return {
    id: "board-1",
    screenplay,
    shots,
    title: "My film",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null,
    updatedAt: 0,
    ...overrides
  };
};

describe("extractScriptFromBoard", () => {
  it("writes one line per shot dialogue and maps it back to the shot", () => {
    const extracted = extractScriptFromBoard(board(), []);

    const lines = extracted.document.sections.flatMap((s) => s.lines);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("We are closed.");
    expect(extracted.lineIdsByShotId["shot-1"]).toEqual([lines[0].id]);
    expect(lineTextsById(extracted.document).get(lines[0].id)).toBe(
      "We are closed."
    );
  });

  it("refuses a board whose shots carry no words", () => {
    expect(() => extractScriptFromBoard(board({ shots: [shot("s")] }), [])).toThrow(
      /nothing to extract/i
    );
  });

  it("refuses a board with no screenplay", () => {
    expect(() =>
      extractScriptFromBoard(board({ screenplay: null }), [])
    ).toThrow(/no screenplay/i);
  });
});

describe("link validation", () => {
  it("passes a board linked to the script it was extracted from", () => {
    const extracted = extractScriptFromBoard(board(), []);
    const lineId = extracted.document.sections[0].lines[0].id;
    const linked = board({
      shots: [
        shot("shot-1", {
          dialogue: "We are closed.",
          script_line_ids: [lineId]
        })
      ]
    });
    linked.screenplay = { ...linked.screenplay!, script_id: "script-1" };

    expect(boardLinkIssues(linked, extracted.document).errors).toEqual([]);
  });

  it("reports a line two shots claim and a line the script lacks", () => {
    const linked = board({
      shots: [
        shot("shot-1", { script_line_ids: ["line-x"] }),
        shot("shot-2", { index: 1, script_line_ids: ["line-x"] })
      ]
    });
    linked.screenplay = { ...linked.screenplay!, script_id: "script-1" };

    const codes = boardLinkIssues(linked, { sections: [] }).errors.map(
      (issue) => issue.code
    );
    expect(codes).toContain("duplicate_line_reference");
    expect(codes).toContain("unknown_line_reference");
  });

  it("reports shot references on a board that links nothing", () => {
    const unlinked = board({
      shots: [shot("shot-1", { script_line_ids: ["line-x"] })]
    });

    expect(
      boardLinkIssues(unlinked, null).errors.map((issue) => issue.code)
    ).toContain("unlinked_board_reference");
  });
});

describe("scaffoldShots", () => {
  it("derives one shot per line, linked, with the words projected", () => {
    const store = useScriptStore.getState();
    store.ensureScript("script-1");
    const sectionId = store.addSection("script-1");
    const lineId = store.insertLine("script-1", sectionId, 0);
    store.patchLine("script-1", lineId, { text: "We are closed." });

    let counter = 0;
    const shots = scaffoldShots(
      useScriptStore.getState().getScript("script-1")!,
      () => `shot-${(counter += 1)}`
    );

    expect(shots).toHaveLength(1);
    expect(shots[0].script_line_ids).toEqual([lineId]);
    expect(shots[0].script_text_snapshot).toBe("We are closed.");
    expect(shots[0].narration).toBe("We are closed.");
    expect(shots[0].duration_source).toBe("audio");
  });
});

describe("StoryboardStore link mutations", () => {
  const BOARD = "store-board";

  beforeEach(() => {
    useStoryboardStore.setState({
      boards: {},
      serverRevisions: {},
      history: {}
    });
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-1",
      title: "My film",
      shots: [shot("shot-1", { dialogue: "We are closed." })]
    });
  });

  it("stamps the script, the covered lines, and the projected text", () => {
    useStoryboardStore
      .getState()
      .setScriptLink(
        BOARD,
        "script-1",
        { "shot-1": ["line-1"] },
        new Map([["line-1", "We are closed."]])
      );

    const linked = useStoryboardStore.getState().getBoard(BOARD)!;
    expect(linkedScriptId(linked)).toBe("script-1");
    expect(linked.shots[0].script_line_ids).toEqual(["line-1"]);
    expect(linked.shots[0].script_text_snapshot).toBe("We are closed.");
    expect(linked.screenplay?.shots[0].script_line_ids).toEqual(["line-1"]);
  });

  it("clears the link but keeps the words", () => {
    const store = useStoryboardStore.getState();
    store.setScriptLink(
      BOARD,
      "script-1",
      { "shot-1": ["line-1"] },
      new Map([["line-1", "We are closed."]])
    );
    store.clearScriptLink(BOARD);

    const unlinked = useStoryboardStore.getState().getBoard(BOARD)!;
    expect(linkedScriptId(unlinked)).toBeNull();
    expect(unlinked.shots[0].script_line_ids).toBeUndefined();
    expect(unlinked.shots[0].dialogue).toBe("We are closed.");
    expect(unlinkedShots(unlinked.shots)).toBe(unlinked.shots);
  });
});
