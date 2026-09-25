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
    applications: { get: { query: jest.fn() } },
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
    jest.mocked(trpcClient.applications.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
    jest.mocked(trpcClient.assets.get.query).mockImplementation(async ({ id }) => ({ id, project_id: "p-1" }) as never);
  });

  it.each([
    ["workflow", "workflow"],
    ["timeline", "timeline"],
    ["storyboard", "storyboard"],
    ["sketch", "sketch"],
    ["script", "script"],
    ["app", "application"],
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

  it.each(["asset", "collection", "thread"] as const)(
    "opens nothing for %s",
    async (kind) => {
      await expect(openResource({ kind, id: "r_1" })).resolves.toBe(false);
      expect(openTab).not.toHaveBeenCalled();
    }
  );
});
