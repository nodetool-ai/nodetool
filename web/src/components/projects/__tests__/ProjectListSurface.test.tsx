/**
 * The projects list: what a card says, and that a loose document dropped on
 * one is moved into that project.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const auroraSummary = {
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
};

let summaries: {
  data: unknown;
  isPending: boolean;
  error: Error | null;
} = {
  data: [auroraSummary],
  isPending: false,
  error: null
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
const archiveProject = jest.fn();
const restoreProject = jest.fn();
const deleteProject = jest.fn();
const openProject = jest.fn(() => Promise.resolve(true));
const openNewProject = jest.fn();
const createProject = jest.fn();

const archiveMutation = { mutate: archiveProject, isPending: false };
const restoreMutation = { mutate: restoreProject, isPending: false };
const deleteMutation = { mutate: deleteProject, isPending: false };
const importProject = jest.fn();
const exportProject = jest.fn();

jest.mock("../../../hooks/useProjects", () => ({
  useProjectSummaries: () => summaries,
  useArchivedProjects: () => ({ data: [], isPending: false }),
  useUnassignedDocuments: () => unassigned,
  useAssignDocument: () => ({ mutate: assignDocument }),
  useArchiveProject: () => archiveMutation,
  useRestoreProject: () => restoreMutation,
  useDeleteProject: () => deleteMutation,
  useImportProject: () => ({ mutate: importProject, isPending: false }),
  useExportProject: () => ({ mutate: exportProject, isPending: false }),
  useOpenProject: () => openProject,
  useOpenNewProjectTab: () => openNewProject,
  useCreateProject: () => ({ mutateAsync: createProject, isPending: false })
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: Object.assign(
    <T,>(selector: (s: { openTab: jest.Mock }) => T) => selector({ openTab }),
    { getState: () => ({ activeTabId: null }) }
  )
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

beforeEach(() => {
  jest.clearAllMocks();
  summaries = {
    data: [auroraSummary],
    isPending: false,
    error: null
  };
});

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

  it("opens the project's latest document, not an unchanged start page", async () => {
    // Study 16: three clicks on a project card each landed back on Home.
    renderSurface();
    await userEvent.click(screen.getByLabelText("Aurora Launch Spot"));
    await waitFor(() =>
      expect(openTab).toHaveBeenCalledWith(
        expect.objectContaining({ type: "storyboard", ref: "b1", projectId: "p1" })
      )
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

  it("says when the project list failed to load", () => {
    summaries = { data: undefined, isPending: false, error: new Error("boom") };
    renderSurface();
    expect(screen.getByText("Could not load projects")).toBeInTheDocument();
    expect(screen.queryByText("Aurora Launch Spot")).not.toBeInTheDocument();
  });

  it("creates a named project and opens its home", async () => {
    createProject.mockResolvedValue({ id: "p-new", name: "Comet" });
    openProject.mockResolvedValue(true);
    renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(createProject).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Project name"), "Comet");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProject).toHaveBeenCalledWith({ name: "Comet" });
    await waitFor(() => expect(openNewProject).toHaveBeenCalled());
    expect(openProject).toHaveBeenCalledWith({ id: "p-new", name: "Comet" });
  });

  it("asks for a name from the start-a-project card too", async () => {
    renderSurface();
    await userEvent.click(screen.getByRole("button", { name: /Start a project/ }));
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
  });

  it("imports a chosen project file and opens the new project", async () => {
    importProject.mockImplementation(
      (_file: File, options: { onSuccess: (result: unknown) => void }) =>
        options.onSuccess({
          project: { id: "p9", name: "Imported" },
          counts: {},
          missing: [],
          checksum_mismatches: [],
          skipped: []
        })
    );
    renderSurface();
    const file = new File([new Uint8Array([1])], "spot.nodetool-project");
    await userEvent.upload(screen.getByLabelText("Project file"), file);
    expect(importProject).toHaveBeenCalledWith(file, expect.anything());
    expect(openProject).toHaveBeenCalledWith({ id: "p9", name: "Imported" });
  });

  it("exports a project from its card", async () => {
    renderSurface();
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Aurora Launch Spot" })
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    expect(exportProject).toHaveBeenCalledWith(
      { id: "p1", name: "Aurora Launch Spot" },
      expect.anything()
    );
    expect(openProject).not.toHaveBeenCalled();
  });
});
