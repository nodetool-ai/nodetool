import { openResource } from "../openResource";
import { trpcClient } from "../../../trpc/client";

const openTab = jest.fn();
const setActiveProjectId = jest.fn();
const addNotification = jest.fn();

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: {
    getState: () => ({ openTab, setActiveProjectId })
  }
}));
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workflows: { get: { query: jest.fn() } },
    timeline: { get: { query: jest.fn() } },
    storyboards: { get: { query: jest.fn() } },
    sketch: { get: { query: jest.fn() } },
    scripts: { get: { query: jest.fn() } },
    jsScripts: { get: { query: jest.fn() } },
    applications: { get: { query: jest.fn() } },
    games: { get: { query: jest.fn() } },
    assets: { get: { query: jest.fn() } }
  }
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: { getState: () => ({ addNotification }) }
}));

describe("openResource", () => {
  beforeEach(() => {
    openTab.mockClear();
    setActiveProjectId.mockClear();
    addNotification.mockClear();
    jest.mocked(trpcClient.workflows.get.query).mockImplementation(async ({ id }) => ({ id, project_id: "p-1" }) as never);
    jest.mocked(trpcClient.timeline.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.storyboards.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.sketch.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.scripts.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.jsScripts.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.applications.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.games.get.query).mockImplementation(async ({ id }) => ({ game: { id, projectId: "p-1" } }) as never);
    jest.mocked(trpcClient.assets.get.query).mockImplementation(async ({ id }) => ({ id, project_id: "p-1" }) as never);
  });

  it.each([
    ["workflow", "workflow"],
    ["timeline", "timeline"],
    ["storyboard", "storyboard"],
    ["sketch", "sketch"],
    ["script", "script"],
    ["jsscript", "jsscript"],
    ["app", "application"],
    ["game", "game"],
    ["model3d", "model3d"]
  ] as const)("opens a %s document in its project", async (kind, tabType) => {
    await expect(openResource({ kind, id: "r_1" })).resolves.toBe(true);
    expect(setActiveProjectId).toHaveBeenCalledWith("p-1");
    expect(openTab).toHaveBeenCalledWith({
      type: tabType,
      ref: "r_1",
      mode: "edit",
      projectId: "p-1"
    });
  });

  it("ignores the sub-target", async () => {
    await openResource({
      kind: "timeline",
      id: "tl_1",
      subTarget: { key: "clip", value: "cl_9" }
    });

    expect(openTab).toHaveBeenCalledWith({
      type: "timeline",
      ref: "tl_1",
      mode: "edit",
      projectId: "p-1"
    });
  });

  it("reports a failed lookup instead of leaving a clicked chip inert", async () => {
    jest.mocked(trpcClient.timeline.get.query).mockRejectedValue(new Error("Not found"));
    await expect(openResource({ kind: "timeline", id: "missing" })).resolves.toBe(false);
    expect(openTab).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
      content: expect.stringContaining("Not found")
    }));
  });

  it.each([
    ["image/png", "render.png", "image"],
    ["image/svg+xml", "logo.svg", "svg"],
    ["audio/mpeg", "take.mp3", "audio"],
    ["model/gltf-binary", "robot.glb", "model3d"],
    ["text/markdown", "notes.md", "text"]
  ])("opens a %s asset in its %s tab", async (contentType, name, tabType) => {
    const assetId = "3b9f0c2e7d4a41c6a8e5f1d2c3b4a596";
    jest.mocked(trpcClient.assets.get.query).mockResolvedValue({
      id: assetId,
      name,
      content_type: contentType,
      project_id: "p-1"
    } as never);

    await expect(
      openResource({ kind: "asset", id: `${assetId}.${name.split(".")[1]}` })
    ).resolves.toBe(true);
    // The locator's extension is not part of the asset row's id.
    expect(trpcClient.assets.get.query).toHaveBeenCalledWith({ id: assetId });
    expect(openTab).toHaveBeenCalledWith({
      type: tabType,
      ref: assetId,
      mode: "edit",
      title: name,
      projectId: "p-1"
    });
  });

  it("opens a file with no workspace surface in a browser tab", async () => {
    const open = jest.spyOn(window, "open").mockReturnValue(null);
    jest.mocked(trpcClient.assets.get.query).mockResolvedValue({
      id: "as_1",
      name: "report.pdf",
      content_type: "application/pdf",
      project_id: "p-1",
      get_url: "https://files.test/report.pdf"
    } as never);

    await expect(openResource({ kind: "asset", id: "as_1.pdf" })).resolves.toBe(true);
    expect(openTab).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      "https://files.test/report.pdf",
      "_blank",
      "noopener,noreferrer"
    );
    open.mockRestore();
  });

  it.each(["collection", "thread"] as const)(
    "opens nothing for %s",
    async (kind) => {
      await expect(openResource({ kind, id: "r_1" })).resolves.toBe(false);
      expect(openTab).not.toHaveBeenCalled();
    }
  );
});
