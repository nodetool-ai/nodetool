/**
 * @jest-environment node
 */

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    storyboards: {
      list: { query: jest.fn() },
      get: { query: jest.fn() },
      update: { mutate: jest.fn() }
    },
    scripts: {
      list: { query: jest.fn() },
      get: { query: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

import {
  downgradeBoardsLinkedToScript,
  downgradeScriptsLinkedToBoard
} from "../scriptStoryboardDowngrade";
import { trpcClient } from "../../trpc/client";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

const list = trpcClient.storyboards.list.query as jest.Mock;
const get = trpcClient.storyboards.get.query as jest.Mock;
const update = trpcClient.storyboards.update.mutate as jest.Mock;
const scriptList = trpcClient.scripts.list.query as jest.Mock;
const scriptGet = trpcClient.scripts.get.query as jest.Mock;
const scriptUpdate = trpcClient.scripts.update.mutate as jest.Mock;

const screenplayFor = (id: string, scriptId: string | null) => {
  const screenplay: Record<string, unknown> = {
    type: "screenplay",
    id: `sp-${id}`,
    title: "My film",
    shots: []
  };
  if (scriptId) {
    screenplay.script_id = scriptId;
  }
  return screenplay;
};

const boardResponse = (id: string, scriptId: string | null) => ({
  id,
  updatedAt: "2026-08-16T00:00:00.000Z",
  document: {
    screenplay: screenplayFor(id, scriptId),
    shots: [
      {
        type: "shot",
        id: "shot-1",
        index: 0,
        action: "A lighthouse at dusk",
        dialogue: "We are closed.",
        status: "planned",
        script_line_ids: ["line-1"],
        script_text_snapshot: "We are closed.",
        duration_source: "audio"
      }
    ],
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null
  }
});

describe("downgradeBoardsLinkedToScript", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    useStoryboardStore.setState({
      boards: {},
      serverRevisions: {},
      history: {}
    });
  });

  it("clears the link and keeps the projected words", async () => {
    list.mockResolvedValue([{ id: "board-1" }]);
    get.mockResolvedValue(boardResponse("board-1", "script-1"));
    update.mockResolvedValue({});

    const downgraded = await downgradeBoardsLinkedToScript("script-1");

    expect(downgraded).toEqual(["board-1"]);
    const written = update.mock.calls[0][0];
    expect(written.id).toBe("board-1");
    expect(written.baseUpdatedAt).toBe("2026-08-16T00:00:00.000Z");
    expect(written.document.screenplay.script_id).toBeUndefined();
    expect(written.document.shots[0].script_line_ids).toBeUndefined();
    expect(written.document.shots[0].script_text_snapshot).toBeUndefined();
    expect(written.document.shots[0].duration_source).toBeUndefined();
    // The words the extraction projected stay as ordinary shot text.
    expect(written.document.shots[0].dialogue).toBe("We are closed.");
  });

  it("leaves boards that link a different script alone", async () => {
    list.mockResolvedValue([{ id: "board-2" }]);
    get.mockResolvedValue(boardResponse("board-2", "other-script"));

    expect(await downgradeBoardsLinkedToScript("script-1")).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports nothing and never throws when the write fails", async () => {
    list.mockResolvedValue([{ id: "board-1" }]);
    get.mockResolvedValue(boardResponse("board-1", "script-1"));
    update.mockRejectedValue(new Error("409 revision conflict"));

    await expect(downgradeBoardsLinkedToScript("script-1")).resolves.toEqual([]);
  });

  it("never throws when the boards cannot be listed", async () => {
    list.mockRejectedValue(new Error("offline"));

    await expect(downgradeBoardsLinkedToScript("script-1")).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("downgradeScriptsLinkedToBoard", () => {
  const scriptResponse = (id: string, storyboardId: string | null) => ({
    id,
    name: id,
    document: { cast: [], sections: [] },
    storyboardId: storyboardId ?? undefined,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: `rev-${id}`
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    useScriptStore.setState({ scripts: {}, serverRevisions: {}, history: {} });
    scriptUpdate.mockImplementation(async ({ id }: { id: string }) => ({
      ...scriptResponse(id, null),
      updatedAt: `rev-${id}-next`
    }));
  });

  it("clears the back-pointer of every script naming the deleted board", async () => {
    const store = useScriptStore.getState();
    store.ensureScript("script-1");
    store.ensureScript("script-2");
    store.setStoryboardLink("script-1", "board-1");
    store.setStoryboardLink("script-2", "board-2");
    scriptList.mockResolvedValue([{ id: "script-1" }, { id: "script-2" }]);
    scriptGet.mockImplementation(async ({ id }: { id: string }) =>
      scriptResponse(id, id === "script-1" ? "board-1" : "board-2")
    );

    expect(await downgradeScriptsLinkedToBoard("board-1")).toEqual(["script-1"]);

    const scripts = useScriptStore.getState().scripts;
    expect(scripts["script-1"]?.storyboardId).toBeNull();
    expect(scripts["script-2"]?.storyboardId).toBe("board-2");
    // Persisted, so a reload does not resurrect the pointer.
    expect(scriptUpdate).toHaveBeenCalledTimes(1);
    expect(scriptUpdate).toHaveBeenCalledWith({
      id: "script-1",
      baseUpdatedAt: "rev-script-1",
      storyboardId: null
    });
  });

  it("never throws when a script cannot be cleared", async () => {
    scriptList.mockResolvedValue([{ id: "script-1" }]);
    scriptGet.mockResolvedValue(scriptResponse("script-1", "board-1"));
    scriptUpdate.mockRejectedValue(new Error("409 revision conflict"));

    await expect(downgradeScriptsLinkedToBoard("board-1")).resolves.toEqual([]);
  });

  it("never throws when the scripts cannot be listed", async () => {
    scriptList.mockRejectedValue(new Error("offline"));

    await expect(downgradeScriptsLinkedToBoard("board-1")).resolves.toEqual([]);
    expect(scriptGet).not.toHaveBeenCalled();
  });
});
