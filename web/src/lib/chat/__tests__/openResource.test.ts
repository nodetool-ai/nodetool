import { openResource } from "../openResource";

const openTab = jest.fn();

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: {
    getState: () => ({ openTab })
  }
}));

describe("openResource", () => {
  beforeEach(() => {
    openTab.mockClear();
  });

  it.each([
    ["workflow", "workflow"],
    ["timeline", "timeline"],
    ["storyboard", "storyboard"],
    ["sketch", "sketch"],
    ["script", "script"],
    ["app", "application"],
    ["model3d", "model3d"]
  ] as const)("opens a %s document in a %s tab", (kind, tabType) => {
    expect(openResource({ kind, id: "r_1" })).toBe(true);
    expect(openTab).toHaveBeenCalledWith({
      type: tabType,
      ref: "r_1",
      mode: "edit"
    });
  });

  it("ignores the sub-target", () => {
    openResource({
      kind: "timeline",
      id: "tl_1",
      subTarget: { key: "clip", value: "cl_9" }
    });

    expect(openTab).toHaveBeenCalledWith({
      type: "timeline",
      ref: "tl_1",
      mode: "edit"
    });
  });

  it.each(["asset", "collection", "thread"] as const)(
    "opens nothing for %s",
    (kind) => {
      expect(openResource({ kind, id: "r_1" })).toBe(false);
      expect(openTab).not.toHaveBeenCalled();
    }
  );
});
