import { renameTitledDocument } from "../renameTitledDocument";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    storyboards: { update: { mutate: jest.fn() } },
    scripts: { update: { mutate: jest.fn() } }
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
  useStoryboardStore.getState().ensureBoard("board");
  useStoryboardStore.getState().setTitle("board", "Original board");
  useStoryboardStore.getState().setServerRevision("board", "v1");
  useScriptStore.getState().ensureScript("script");
  useScriptStore.getState().setTitle("script", "Original script");
  useScriptStore.getState().setServerRevision("script", "v1");
});

it("persists storyboard rename with its loaded revision and updates the editor title", async () => {
  const request = jest.mocked(trpcClient.storyboards.update.mutate);
  request.mockResolvedValue({ updatedAt: "v2" } as Awaited<
    ReturnType<typeof request>
  >);
  await renameTitledDocument("storyboard", "board", "New board");
  expect(request).toHaveBeenCalledWith({
    id: "board",
    name: "New board",
    baseUpdatedAt: "v1"
  });
  expect(useStoryboardStore.getState().boards.board.title).toBe("New board");
  expect(useStoryboardStore.getState().serverRevisions.board).toBe("v2");
});

it("persists script rename and updates the editor title", async () => {
  const request = jest.mocked(trpcClient.scripts.update.mutate);
  request.mockResolvedValue({ updatedAt: "v2" } as Awaited<
    ReturnType<typeof request>
  >);
  await renameTitledDocument("script", "script", "New script");
  expect(request).toHaveBeenCalledWith({
    id: "script",
    name: "New script",
    baseUpdatedAt: "v1"
  });
  expect(useScriptStore.getState().scripts.script.title).toBe("New script");
  expect(useScriptStore.getState().serverRevisions.script).toBe("v2");
});

it.each(["storyboard", "script"] as const)(
  "keeps the %s editor title when the server rejects rename",
  async (type) => {
    const request =
      type === "storyboard"
        ? trpcClient.storyboards.update.mutate
        : trpcClient.scripts.update.mutate;
    jest.mocked(request).mockRejectedValue(new Error("Denied"));
    await expect(
      renameTitledDocument(
        type,
        type === "storyboard" ? "board" : "script",
        "Rejected"
      )
    ).rejects.toThrow("Denied");
    expect(useStoryboardStore.getState().boards.board.title).toBe(
      "Original board"
    );
    expect(useScriptStore.getState().scripts.script.title).toBe(
      "Original script"
    );
  }
);
