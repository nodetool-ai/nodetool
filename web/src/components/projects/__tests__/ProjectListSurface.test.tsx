/**
 * The projects list: what a card says, and that a loose document dropped on
 * one is moved into that project.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const summaries = {
  data: [
    {
      project: {
        id: "p1",
        name: "Aurora Launch Spot",
        kind: "spot",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z"
      },
      documents: [
        {
          type: "storyboard",
          ref: "b1",
          name: "Board",
          updatedAt: "2026-08-29T00:00:00.000Z",
          status: { kind: "storyboard", shots: 8, stills: 8, clips: 6 },
          spendUsd: 4.12,
          unpricedCount: 0,
          thumbnails: []
        }
      ],
      spend: { totalUsd: 4.12, unpricedCount: 0, byCategory: [] }
    }
  ],
  isPending: false
};

const unassigned = {
  data: [
    {
      type: "script",
      ref: "s1",
      name: "Scratch VO",
      updatedAt: "2026-08-28T00:00:00.000Z"
    }
  ]
};

const assignDocument = jest.fn();
const openProject = jest.fn();
const openNewProject = jest.fn();

jest.mock("../../../hooks/useProjects", () => ({
  useProjectSummaries: () => summaries,
  useUnassignedDocuments: () => unassigned,
  useAssignDocument: () => ({ mutate: assignDocument }),
  useOpenProject: () => openProject,
  useOpenNewProjectTab: () => openNewProject
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T) =>
    selector({ openTab })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
}));

import ProjectListSurface from "../ProjectListSurface";

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectListSurface />
    </ThemeProvider>
  );

beforeEach(() => jest.clearAllMocks());

describe("ProjectListSurface", () => {
  it("shows each project's derived status and spend", () => {
    renderSurface();
    expect(screen.getByText("Aurora Launch Spot")).toBeInTheDocument();
    expect(screen.getByText("8 shots · stills 8/8")).toBeInTheDocument();
    expect(screen.getByText("clips 6/8")).toBeInTheDocument();
    expect(screen.getByText("$4.12")).toBeInTheDocument();
  });

  it("opens the project as a tab group when its card is clicked", async () => {
    renderSurface();
    await userEvent.click(screen.getByLabelText("Aurora Launch Spot"));
    expect(openProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Aurora Launch Spot" })
    );
  });

  it("filters the cards by the search box", async () => {
    renderSurface();
    await userEvent.type(screen.getByPlaceholderText("Search projects"), "zzz");
    await waitFor(() =>
      expect(screen.queryByText("Aurora Launch Spot")).not.toBeInTheDocument()
    );
  });

  it("moves a loose document into the project it is dropped on", () => {
    renderSurface();
    const payload = JSON.stringify(unassigned.data[0]);
    fireEvent.drop(screen.getByLabelText("Aurora Launch Spot"), {
      dataTransfer: { getData: () => payload }
    });
    expect(assignDocument).toHaveBeenCalledWith(
      { projectId: "p1", type: "script", ref: "s1" },
      expect.anything()
    );
  });

  it("ignores a drop carrying something that is not one of its documents", () => {
    renderSurface();
    fireEvent.drop(screen.getByLabelText("Aurora Launch Spot"), {
      dataTransfer: { getData: () => "workflow:some-id" }
    });
    expect(assignDocument).not.toHaveBeenCalled();
  });

  it("starts a project on the new-project surface", async () => {
    renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "+ New project" }));
    expect(openNewProject).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Start a project/ }));
    expect(openNewProject).toHaveBeenCalledTimes(2);
  });
});
