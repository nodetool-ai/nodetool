import { act, renderHook } from "@testing-library/react";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";
import {
  useWorkspaceDocumentTitle,
  workspaceDocumentTitle
} from "../useWorkspaceDocumentTitle";

const tab = (id: string, title: string): WorkspaceTab =>
  ({ id, title, type: "page", ref: id, mode: "view" }) as WorkspaceTab;

describe("useWorkspaceDocumentTitle", () => {
  it("follows the active tab when the user leaves a game", () => {
    useWorkspaceTabsStore.setState({
      tabs: [tab("game", "Lumen"), tab("personal", "Personal")],
      activeTabId: "game"
    });
    renderHook(() => useWorkspaceDocumentTitle());
    expect(document.title).toBe("Lumen · NodeTool");

    act(() => {
      useWorkspaceTabsStore.setState({ activeTabId: "personal" });
    });
    expect(document.title).toBe("Personal · NodeTool");
  });

  it("falls back to the app name without an active tab", () => {
    expect(workspaceDocumentTitle(null)).toBe("NodeTool");
    expect(workspaceDocumentTitle("  ")).toBe("NodeTool");
  });
});
