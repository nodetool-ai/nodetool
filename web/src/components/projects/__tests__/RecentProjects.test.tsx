/**
 * The start page's recent projects: the newest four, newest first, each
 * opening its project, and nothing at all before the first project exists.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const summary = (id: string, name: string, updatedAt: string) => ({
  project: { id, name, kind: "spot", createdAt: updatedAt, updatedAt },
  documents: [],
  spend: { totalUsd: 0, unpricedCount: 0, byCategory: [] }
});

let summaries: { data: unknown } = { data: [] };
const openProject = jest.fn();
const openTab = jest.fn();

jest.mock("../../../hooks/useProjects", () => ({
  useProjectSummaries: () => summaries,
  useOpenProject: () => openProject
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  PROJECT_LIST_REF: "projects",
  useWorkspaceTabsStore: (selector: (state: { openTab: jest.Mock }) => unknown) =>
    selector({ openTab })
}));

jest.mock("../ProjectLifecycleActions", () => ({
  __esModule: true,
  default: () => null
}));

import RecentProjects from "../RecentProjects";

const renderRecent = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RecentProjects />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RecentProjects", () => {
  it("renders nothing before the first project exists", () => {
    summaries = { data: [] };
    const { container } = renderRecent();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the four newest projects, newest first", () => {
    summaries = {
      data: [
        summary("a", "Oldest", "2026-10-01T00:00:00.000Z"),
        summary("b", "Newest", "2026-10-19T00:00:00.000Z"),
        summary("c", "Third", "2026-10-10T00:00:00.000Z"),
        summary("d", "Second", "2026-10-15T00:00:00.000Z"),
        summary("e", "Fourth", "2026-10-05T00:00:00.000Z")
      ]
    };
    renderRecent();
    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label") !== null);
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "Newest",
      "Second",
      "Third",
      "Fourth"
    ]);
  });

  it("opens a project from its card and the list from View all", async () => {
    summaries = { data: [summary("a", "Aurora", "2026-10-19T00:00:00.000Z")] };
    renderRecent();
    await userEvent.click(screen.getByRole("button", { name: "Aurora" }));
    expect(openProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a", name: "Aurora" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "View all projects" })
    );
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "project-list", ref: "projects" })
    );
  });
});
