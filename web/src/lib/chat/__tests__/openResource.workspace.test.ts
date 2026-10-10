import { openResource } from "../openResource";
import { trpcClient } from "../../../trpc/client";
import {
  isTabInScope,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: { get: { query: jest.fn() } }
  }
}));

const FULL_ID = "e15ec32298e34cc9883cd81af4f943b2";
const SHORT_ID = FULL_ID.slice(0, 12);

const activeTab = () => {
  const { tabs, activeTabId, activeProjectId } =
    useWorkspaceTabsStore.getState();
  return (
    tabs.find(
      (tab) => tab.id === activeTabId && isTabInScope(tab, activeProjectId)
    ) ?? null
  );
};

describe.each([
  ["a project", "p-1", "p-1"],
  ["the personal project", "personal:u1", "personal:u1"],
  ["the loose bucket", undefined, "default"]
])("openResource in %s", (_label, tabProject, rowProject) => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      tabs: [],
      activeTabId: null,
      activeProjectId: null,
      projectSessions: {}
    });
    jest
      .mocked(trpcClient.timeline.get.query)
      .mockResolvedValue({ id: FULL_ID, projectId: rowProject } as never);
  });

  it("activates the open tab a short id names", async () => {
    const tabs = useWorkspaceTabsStore.getState();
    tabs.setActiveProjectId(tabProject ?? null);
    tabs.openTab({
      type: "chat",
      ref: "thread-1",
      projectId: tabProject ?? "default"
    });
    tabs.openTab({
      type: "timeline",
      ref: FULL_ID,
      projectId: tabProject ?? "default"
    });
    tabs.setActiveTab("chat:thread-1");

    await expect(
      openResource({ kind: "timeline", id: SHORT_ID })
    ).resolves.toBe(true);

    expect(activeTab()?.id).toBe(`timeline:${FULL_ID}`);
  });

  it("opens a closed timeline by its short id", async () => {
    await expect(
      openResource({ kind: "timeline", id: SHORT_ID })
    ).resolves.toBe(true);

    expect(activeTab()?.id).toBe(`timeline:${FULL_ID}`);
  });
});
