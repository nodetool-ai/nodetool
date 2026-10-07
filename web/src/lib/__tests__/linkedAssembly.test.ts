import { loadLinkedBoard, loadLinkedScript } from "../linkedAssembly";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

const mockScriptsGet = jest.fn();
const mockStoryboardsGet = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    scripts: { get: { query: (...args: unknown[]) => mockScriptsGet(...args) } },
    storyboards: {
      get: { query: (...args: unknown[]) => mockStoryboardsGet(...args) }
    }
  }
}));

const setOpenScript = (script: unknown) =>
  jest
    .spyOn(useScriptStore, "getState")
    .mockReturnValue({ getScript: () => script } as never);
const setOpenBoard = (board: unknown) =>
  jest
    .spyOn(useStoryboardStore, "getState")
    .mockReturnValue({ getBoard: () => board } as never);

describe("linkedAssembly", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    mockScriptsGet.mockReset();
    mockStoryboardsGet.mockReset();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("loadLinkedScript", () => {
    it("prefers the open script when it has sections", async () => {
      setOpenScript({ cast: ["c"], sections: [{ id: "s" }] });
      await expect(loadLinkedScript("sc1")).resolves.toEqual({
        scriptId: "sc1",
        cast: ["c"],
        sections: [{ id: "s" }]
      });
      expect(mockScriptsGet).not.toHaveBeenCalled();
    });

    it("fetches when the open script has no sections yet", async () => {
      setOpenScript({ cast: [], sections: [] });
      mockScriptsGet.mockResolvedValue({
        document: { cast: ["srv"], sections: [{ id: "x" }] }
      });
      await expect(loadLinkedScript("sc1")).resolves.toEqual({
        scriptId: "sc1",
        cast: ["srv"],
        sections: [{ id: "x" }]
      });
      expect(mockScriptsGet).toHaveBeenCalledWith({ id: "sc1" });
    });

    it("returns null and warns when the fetch fails", async () => {
      setOpenScript(undefined);
      mockScriptsGet.mockRejectedValue(new Error("gone"));
      await expect(loadLinkedScript("sc1")).resolves.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("sc1"),
        "gone"
      );
    });
  });

  describe("loadLinkedBoard", () => {
    it("prefers the open board when it has shots", async () => {
      setOpenBoard({
        shots: [{ id: "s1" }],
        screenplay: { music_prompt: "calm" }
      });
      await expect(loadLinkedBoard("b1")).resolves.toEqual({
        boardId: "b1",
        shots: [{ id: "s1" }],
        musicPrompt: "calm"
      });
      expect(mockStoryboardsGet).not.toHaveBeenCalled();
    });

    it("fetches the server copy when the board is not open", async () => {
      setOpenBoard(undefined);
      mockStoryboardsGet.mockResolvedValue({
        document: { shots: [{ id: "s2" }], screenplay: { music_prompt: "epic" } }
      });
      await expect(loadLinkedBoard("b1")).resolves.toEqual({
        boardId: "b1",
        shots: [{ id: "s2" }],
        musicPrompt: "epic"
      });
    });

    it("leaves musicPrompt undefined when the document has no screenplay", async () => {
      setOpenBoard(undefined);
      mockStoryboardsGet.mockResolvedValue({
        document: { shots: [], screenplay: null }
      });
      const result = await loadLinkedBoard("b1");
      expect(result?.musicPrompt).toBeUndefined();
    });

    it("returns null and warns when the fetch fails", async () => {
      setOpenBoard(undefined);
      mockStoryboardsGet.mockRejectedValue(new Error("offline"));
      await expect(loadLinkedBoard("b1")).resolves.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("b1"),
        "offline"
      );
    });
  });
});
