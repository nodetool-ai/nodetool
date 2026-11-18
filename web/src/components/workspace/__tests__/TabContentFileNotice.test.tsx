import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { WorkspaceTab } from "../../../stores/WorkspaceTabsStore";

jest.mock("../WorkflowEditorSurface", () => ({
  __esModule: true,
  default: () => <div>Workflow surface</div>
}));
jest.mock("../TimelineSurface", () => ({
  __esModule: true,
  default: () => <div>Timeline surface</div>
}));
jest.mock("../ScriptSurface", () => ({
  __esModule: true,
  default: () => <div>Script surface</div>
}));
jest.mock("../SketchSurface", () => ({
  __esModule: true,
  default: () => <div>Sketch surface</div>
}));
jest.mock("../SkillSurface", () => ({
  __esModule: true,
  default: () => <div>Skill surface</div>
}));
jest.mock("../DocumentFileNotice", () => ({
  __esModule: true,
  default: (props: { type: string; refId: string; projectId?: string }) => (
    <div data-testid="file-notice">
      {`${props.type}:${props.refId}:${props.projectId ?? "loose"}`}
    </div>
  )
}));

import TabContent from "../TabContent";

const renderTab = (tab: WorkspaceTab) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TabContent tab={tab} active />
    </ThemeProvider>
  );

describe("TabContent file notice", () => {
  it.each<WorkspaceTab>([
    { id: "workflow:wf-1", type: "workflow", ref: "wf-1", mode: "edit", title: "Fox", projectId: "film" },
    { id: "timeline:tl-1", type: "timeline", ref: "tl-1", mode: "edit", title: "Cut", projectId: "film" },
    { id: "script:sc-1", type: "script", ref: "sc-1", mode: "edit", title: "Lines", projectId: "film" }
  ])("puts the file notice of a $type above its editor", async (tab) => {
    renderTab(tab);

    const surface = await screen.findByText(/surface/);
    const notice = screen.getByTestId("file-notice");
    expect(notice).toHaveTextContent(`${tab.type}:${tab.ref}:film`);
    // The notice comes first in the document, above the editor.
    expect(
      notice.compareDocumentPosition(surface) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each<WorkspaceTab>([
    { id: "workflow:wf-1", type: "workflow", ref: "wf-1", mode: "edit", title: "Fox", projectId: "film" },
    { id: "timeline:tl-1", type: "timeline", ref: "tl-1", mode: "edit", title: "Cut", projectId: "film" }
  ])("puts the $type surface in a column that bounds its height", async (tab) => {
    renderTab(tab);

    await screen.findByText(/surface/);
    // Surfaces fill the tab with `flex: 1`. In a block box that rule does
    // nothing, the surface grows to its content, and a guided flow's action
    // row is clipped off the bottom of the tab.
    const body = screen.getByTestId("file-notice").nextElementSibling;
    expect(body).not.toBeNull();
    const style = window.getComputedStyle(body as Element);
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("column");
    expect(style.minHeight).toBe("0");
  });

  it("adds no file notice to a document that is not a file", async () => {
    renderTab({ id: "skill:a", type: "skill", ref: "a", mode: "edit", title: "Draft" });

    expect(await screen.findByText("Skill surface")).toBeInTheDocument();
    expect(screen.queryByTestId("file-notice")).toBeNull();
  });
});
