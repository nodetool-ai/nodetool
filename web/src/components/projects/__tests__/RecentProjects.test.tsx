/**
 * The start page's recent projects: the newest four, newest first, each
 * opening its project, and nothing at all before the first project exists.
 */
import { render, screen, waitFor } from "@testing-library/react";
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
let activeTabId: string | null = null;

jest.mock("../../../hooks/useProjects", () => ({
  useProjectSummaries: () => summaries,
  useOpenProject: () => openProject
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  PROJECT_LIST_REF: "projects",
  useWorkspaceTabsStore: Object.assign(
    (selector: (state: { openTab: jest.Mock }) => unknown) =>
      selector({ openTab }),
    { getState: () => ({ activeTabId }) }
  )
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
  openProject.mockResolvedValue(true);
  activeTabId = null;
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

  // Study 11: six of six people clicked the open project's card to find its
  // board, and the page did not move, because the project opens onto it.
  it("scrolls to the project's documents when the project opens onto this page", async () => {
    summaries = { data: [summary("a", "Aurora", "2026-10-19T00:00:00.000Z")] };
    const documents = document.createElement("div");
    documents.id = "project-documents";
    documents.scrollIntoView = jest.fn();
    document.body.appendChild(documents);
    renderRecent();
    await userEvent.click(screen.getByRole("button", { name: "Aurora" }));
    await waitFor(() => expect(documents.scrollIntoView).toHaveBeenCalled());
    documents.remove();
  });

  it("leaves the page alone when the project reopens a document", async () => {
    summaries = { data: [summary("a", "Aurora", "2026-10-19T00:00:00.000Z")] };
    activeTabId = "storyboard:sb-1";
    const documents = document.createElement("div");
    documents.id = "project-documents";
    documents.scrollIntoView = jest.fn();
    document.body.appendChild(documents);
    renderRecent();
    await userEvent.click(screen.getByRole("button", { name: "Aurora" }));
    await waitFor(() => expect(openProject).toHaveBeenCalled());
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(documents.scrollIntoView).not.toHaveBeenCalled();
    documents.remove();
  });
});
