/**
 * The delete confirmation states what happens to the project folder, which
 * depends on who made it, and shows the folder's path.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

interface DeleteResult {
  ok: true;
  folder: { action: string; path: string | null };
}

const deleteProject = jest.fn(
  (
    _input: { id: string },
    _options?: { onSuccess?: (result: DeleteResult) => void }
  ) => undefined
);
const addNotification = jest.fn();

jest.mock("../../../hooks/useProjects", () => ({
  useArchiveProject: () => ({ mutate: jest.fn(), isPending: false }),
  useRestoreProject: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: deleteProject, isPending: false }),
  useExportProject: () => ({ mutate: jest.fn(), isPending: false }),
  useCollectProjectFiles: () => ({ mutate: jest.fn(), isPending: false })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification })
}));

import ProjectLifecycleActions from "../ProjectLifecycleActions";

type Folder = {
  path: string | null;
  origin: "created" | "adopted";
  is_accessible: boolean;
  on_delete: "trash" | "remove" | "keep";
};

const TRASH_TEXT = "The project folder moves to the trash.";
const KEEP_TEXT =
  "The project folder stays where it is with every file in it. NodeTool removes only the .nodetool folder inside it.";
const REMOVE_TEXT =
  "The project folder and every file in it are deleted from cloud storage.";
const MISSING_TEXT =
  "The project folder cannot be reached, so NodeTool leaves it as it is.";

/** Open the delete dialog for a project with `folder` and return its text. */
async function openDeleteDialog(folder: Folder | null): Promise<HTMLElement> {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectLifecycleActions
        project={{
          id: "p1",
          name: "My Film",
          isPersonal: false,
          archivedAt: null,
          folder
        }}
      />
    </ThemeProvider>
  );
  await user.click(screen.getByRole("button", { name: "Delete" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ProjectLifecycleActions delete confirmation", () => {
  it("says a folder NodeTool created moves to the trash, and shows its path", async () => {
    const dialog = await openDeleteDialog({
      path: "/home/me/NodeTool/My Film",
      origin: "created",
      is_accessible: true,
      on_delete: "trash"
    });

    expect(within(dialog).getByText(TRASH_TEXT)).toBeInTheDocument();
    expect(
      within(dialog).getByText("/home/me/NodeTool/My Film")
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(KEEP_TEXT)).not.toBeInTheDocument();
  });

  it("says a folder the user brought stays, minus .nodetool, and shows its path", async () => {
    const dialog = await openDeleteDialog({
      path: "/Volumes/Footage/shoot",
      origin: "adopted",
      is_accessible: true,
      on_delete: "keep"
    });

    expect(within(dialog).getByText(KEEP_TEXT)).toBeInTheDocument();
    expect(
      within(dialog).getByText("/Volumes/Footage/shoot")
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(TRASH_TEXT)).not.toBeInTheDocument();
  });

  it("follows the server's plan, not the origin, for a folder from before project folders", async () => {
    // Such a row reads `created` from the column default, and the server
    // keeps the folder.
    const dialog = await openDeleteDialog({
      path: "/home/me/my-own-footage",
      origin: "created",
      is_accessible: true,
      on_delete: "keep"
    });

    expect(within(dialog).getByText(KEEP_TEXT)).toBeInTheDocument();
    expect(within(dialog).queryByText(TRASH_TEXT)).not.toBeInTheDocument();
  });

  it("says a cloud folder is deleted, with no path to show", async () => {
    const dialog = await openDeleteDialog({
      path: null,
      origin: "created",
      is_accessible: true,
      on_delete: "remove"
    });

    expect(within(dialog).getByText(REMOVE_TEXT)).toBeInTheDocument();
  });

  it("says an unreachable folder is left as it is", async () => {
    const dialog = await openDeleteDialog({
      path: "/Volumes/Unplugged/My Film",
      origin: "created",
      is_accessible: false,
      on_delete: "trash"
    });

    expect(within(dialog).getByText(MISSING_TEXT)).toBeInTheDocument();
    expect(within(dialog).queryByText(TRASH_TEXT)).not.toBeInTheDocument();
  });

  it("says nothing about a folder when the project has none", async () => {
    const dialog = await openDeleteDialog(null);

    for (const text of [TRASH_TEXT, KEEP_TEXT, REMOVE_TEXT, MISSING_TEXT]) {
      expect(within(dialog).queryByText(text)).not.toBeInTheDocument();
    }
    expect(
      within(dialog).getByText("This cannot be undone.")
    ).toBeInTheDocument();
  });

  it("reports where the folder went when the OS trash was out of reach", async () => {
    const dialog = await openDeleteDialog({
      path: "/home/me/NodeTool/My Film",
      origin: "created",
      is_accessible: true,
      on_delete: "trash"
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete project" })
    );
    expect(deleteProject).toHaveBeenCalledWith(
      { id: "p1" },
      expect.any(Object)
    );
    const onSuccess = deleteProject.mock.calls[0]?.[1]?.onSuccess;

    onSuccess?.({
      ok: true,
      folder: {
        action: "moved_aside",
        path: "/home/me/NodeTool/.trash/My Film-20261115-161642"
      }
    });

    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        content:
          "The trash could not be reached. The project folder moved to /home/me/NodeTool/.trash/My Film-20261115-161642."
      })
    );
  });

  it("stays quiet after a delete that did what the dialog said", async () => {
    const dialog = await openDeleteDialog({
      path: "/home/me/NodeTool/My Film",
      origin: "created",
      is_accessible: true,
      on_delete: "trash"
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete project" })
    );
    const onSuccess = deleteProject.mock.calls[0]?.[1]?.onSuccess;

    onSuccess?.({
      ok: true,
      folder: { action: "trashed", path: "/home/me/.local/share/Trash/files/My Film" }
    });

    expect(addNotification).not.toHaveBeenCalled();
  });
});
