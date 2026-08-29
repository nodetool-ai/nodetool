import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { asMock } from "../../../test-utils/doubles";
import { trpcClient } from "../../../trpc/client";
import FileBrowserDialog from "../FileBrowserDialog";

const listQuery = asMock(trpcClient.files.list.query);
const createFolderMutate = asMock(trpcClient.files.createFolder.mutate);

function renderDialog(onConfirm = jest.fn()) {
  render(
    <ThemeProvider theme={mockTheme}>
      <FileBrowserDialog
        open
        onClose={jest.fn()}
        onConfirm={onConfirm}
        title="Select Workspace Folder"
        initialPath="/home/me"
        selectionMode="directory"
      />
    </ThemeProvider>
  );
  return onConfirm;
}

describe("FileBrowserDialog — new folder", () => {
  beforeEach(() => {
    listQuery.mockReset();
    listQuery.mockResolvedValue([]);
    createFolderMutate.mockReset();
    createFolderMutate.mockResolvedValue({
      name: "Renders",
      path: "/home/me/Renders",
      size: 0,
      is_dir: true,
      modified_at: "2026-01-01T00:00:00.000Z"
    });
  });

  it("creates a folder in the open path and selects it", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(screen.getByLabelText("New folder here"));
    await user.type(
      screen.getByPlaceholderText("New folder name"),
      "Renders"
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createFolderMutate).toHaveBeenCalledWith({
        path: "/home/me",
        name: "Renders"
      })
    );
    // Navigating into the new folder is what selects it, so Select confirms
    // the folder that did not exist a moment ago.
    await waitFor(() =>
      expect(screen.getByText("Selected: /home/me/Renders")).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(onConfirm).toHaveBeenCalledWith("/home/me/Renders");
  });

  it("keeps the name and reports why the server refused", async () => {
    const user = userEvent.setup();
    createFolderMutate.mockRejectedValue(
      new Error('"Renders" already exists here')
    );
    renderDialog();

    await user.click(screen.getByLabelText("New folder here"));
    await user.type(screen.getByPlaceholderText("New folder name"), "Renders");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByText('"Renders" already exists here')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New folder name")).toHaveValue(
      "Renders"
    );
  });

  it("is not offered until asked for, and cancels back out", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.queryByPlaceholderText("New folder name")
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("New folder here"));
    // The dialog footer has a Cancel of its own; this is the row's.
    const row = screen.getByPlaceholderText("New folder name").closest(
      ".new-folder-row"
    ) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByPlaceholderText("New folder name")
    ).not.toBeInTheDocument();
    expect(createFolderMutate).not.toHaveBeenCalled();
  });
});
