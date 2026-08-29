/**
 * The tab bar's project scope chip: it names the group, and its menu is the
 * one place to leave the group or switch to another project.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const projects = [
  { id: "p1", name: "Aurora", kind: "", createdAt: "", updatedAt: "" },
  { id: "p2", name: "Meridian", kind: "", createdAt: "", updatedAt: "" }
];

const openProject = jest.fn();
jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: projects }),
  useOpenProject: () => openProject
}));

const openTab = jest.fn();
const closeProject = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(
    selector: (s: { openTab: jest.Mock; closeProject: jest.Mock }) => T
  ) => selector({ openTab, closeProject })
}));

import ProjectScopeChip from "../ProjectScopeChip";

const renderChip = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectScopeChip projectId="p1" fallbackName="Project" />
    </ThemeProvider>
  );

beforeEach(() => jest.clearAllMocks());

describe("ProjectScopeChip", () => {
  it("names the project the group belongs to", () => {
    renderChip();
    expect(screen.getByRole("button", { name: "Project Aurora" })).toBeInTheDocument();
  });

  it("opens the overview into the same group", async () => {
    renderChip();
    await userEvent.click(screen.getByRole("button", { name: "Project Aurora" }));
    await userEvent.click(screen.getByText("Open overview"));
    expect(openTab).toHaveBeenCalledWith({
      type: "project",
      ref: "p1",
      mode: "view",
      title: "Aurora",
      projectId: "p1"
    });
  });

  it("closes the group", async () => {
    renderChip();
    await userEvent.click(screen.getByRole("button", { name: "Project Aurora" }));
    await userEvent.click(screen.getByText("Close group"));
    expect(closeProject).toHaveBeenCalledWith("p1");
  });

  it("switches to another project, and does not offer the open one", async () => {
    renderChip();
    await userEvent.click(screen.getByRole("button", { name: "Project Aurora" }));
    expect(
      screen.getByRole("menu").textContent?.includes("Aurora")
    ).toBe(false);
    await userEvent.click(screen.getByText("Meridian"));
    await waitFor(() =>
      expect(openProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p2" })
      )
    );
  });
});
