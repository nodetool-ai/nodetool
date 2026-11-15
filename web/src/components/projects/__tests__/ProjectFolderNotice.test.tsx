/**
 * "Folder not found" and Locate on a project whose folder is unreachable, and
 * the notice shown while files are moved into a project folder.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

let canManage = true;
const relocate = jest.fn();
const pickFolder = jest.fn();
const addNotification = jest.fn();

jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
  useRelocateProject: () => ({ mutateAsync: relocate, isPending: false })
}));

jest.mock("../../../hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({ canManage })
}));

jest.mock("../../workspaces/useFolderPicker", () => ({
  useFolderPicker: () => ({ pickFolder, dialog: null })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification })
}));

import ProjectFolderNotice from "../ProjectFolderNotice";

type Moving = { done: number; total: number };

const project = (isAccessible: boolean, moving?: Moving | null) => ({
  id: "p1",
  name: "Aurora",
  folder: {
    path: "/Users/me/NodeTool/Aurora",
    origin: "created" as const,
    is_accessible: isAccessible,
    moving
  }
});

const renderNotice = (isAccessible: boolean, moving?: Moving | null) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectFolderNotice project={project(isAccessible, moving)} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  canManage = true;
});

describe("ProjectFolderNotice", () => {
  it("shows nothing while the folder is reachable", () => {
    renderNotice(true);

    expect(screen.queryByText("Folder not found")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows that files are being moved into the folder, with progress", () => {
    renderNotice(true, { done: 3, total: 12 });

    expect(
      screen.getByText("Moving files into the project folder")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "3 of 12 files moved. Your assets stay available while this runs."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Locate" })
    ).not.toBeInTheDocument();
  });

  it("shows nothing once the move has finished", () => {
    renderNotice(true, null);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a folder that is not found ahead of a move into it", () => {
    renderNotice(false, { done: 3, total: 12 });

    expect(screen.getByText("Folder not found")).toBeInTheDocument();
    expect(
      screen.queryByText("Moving files into the project folder")
    ).not.toBeInTheDocument();
  });

  it("points the project at the folder chosen with Locate", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Users/me/Aurora renamed");
    relocate.mockResolvedValue({});
    renderNotice(false);

    expect(screen.getByText("Folder not found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Locate" }));

    await waitFor(() => {
      expect(relocate).toHaveBeenCalledWith({
        project_id: "p1",
        path: "/Users/me/Aurora renamed"
      });
    });
  });

  it("reports a refused Locate", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Users/me/Other");
    relocate.mockRejectedValue(
      new Error('This folder belongs to project "Beacon"')
    );
    renderNotice(false);

    await user.click(screen.getByRole("button", { name: "Locate" }));

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          content:
            'Could not locate the folder: This folder belongs to project "Beacon"'
        })
      );
    });
  });

  it("shows the state without Locate on a server that refuses host folders", () => {
    canManage = false;
    renderNotice(false);

    expect(screen.getByText("Folder not found")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Locate" })
    ).not.toBeInTheDocument();
  });
});
