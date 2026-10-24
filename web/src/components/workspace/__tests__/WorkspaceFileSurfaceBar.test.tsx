import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { WorkspaceTab } from "../../../stores/WorkspaceTabsStore";

jest.mock("../../../hooks/useRenameDocument", () => ({
  useRenameDocument: () => jest.fn()
}));
jest.mock("../../asset_viewer/ImageViewer", () => ({
  __esModule: true,
  default: () => <div>Image viewer</div>
}));

import WorkspaceFileSurface from "../WorkspaceFileSurface";

describe("WorkspaceFileSurface document bar", () => {
  it("gives a binary file a bar with only its name", () => {
    const tab: WorkspaceTab = {
      id: "workspace-file:ws::art/cover.png",
      type: "workspace-file",
      ref: "ws::art/cover.png",
      mode: "view",
      title: "cover.png"
    };
    render(
      <ThemeProvider theme={mockTheme}>
        <WorkspaceFileSurface refId={tab.ref} mode="view" active tab={tab} />
      </ThemeProvider>
    );

    expect(screen.getByText("Image viewer")).toBeInTheDocument();
    const bar = screen.getByRole("toolbar", { name: "cover.png document" });
    expect(bar).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });
});
