import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";
import DocumentSaveAsDialog from "../DocumentSaveAsDialog";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workspace: {
      listFiles: {
        query: jest.fn()
      }
    }
  }
}));

const listFilesMock = trpcClient.workspace.listFiles.query as jest.Mock;

describe("DocumentSaveAsDialog", () => {
  beforeEach(() => {
    listFilesMock.mockReset();
    listFilesMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path === ".") {
        return [
          { name: ".nodetool", path: ".nodetool", is_dir: true, size: 0 },
          { name: "exports", path: "exports", is_dir: true, size: 0 },
          { name: "readme.md", path: "readme.md", is_dir: false, size: 42 }
        ];
      }
      if (path === "exports") {
        return [
          { name: "final", path: "exports/final", is_dir: true, size: 0 }
        ];
      }
      return [];
    });
  });

  it("lists project folders, drills into subfolders, and submits chosen format, folder, and name", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onSaveAs = jest.fn(async () => {});

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentSaveAsDialog
          open
          onClose={onClose}
          defaultName="Launch notes.md"
          defaultDirectory="."
          workspaceId="ws-1"
          saving={false}
          onSaveAs={onSaveAs}
        />
      </ThemeProvider>
    );

    // Stripped default name and root folders loaded (excluding .nodetool and files).
    expect(screen.getByLabelText("Filename")).toHaveValue("Launch notes");
    expect(await screen.findByText("exports")).toBeInTheDocument();
    expect(screen.queryByText(".nodetool")).toBeNull();
    expect(screen.queryByText("readme.md")).toBeNull();

    // Drill into exports -> select exports/final.
    await user.click(screen.getByRole("button", { name: "Open folder" }));
    expect(await screen.findByText("final")).toBeInTheDocument();
    await user.click(screen.getByText("final"));
    expect(screen.getByLabelText("Destination folder")).toHaveValue(
      "exports/final"
    );

    // Pick PDF format.
    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(screen.getByRole("option", { name: "PDF (.pdf)" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaveAs).toHaveBeenCalledWith({
        format: "pdf",
        directory: "exports/final",
        name: "Launch notes"
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("hides destination folder picker when Google Doc is selected", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onSaveAs = jest.fn(async () => {});

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentSaveAsDialog
          open
          onClose={onClose}
          defaultName="Spec.md"
          defaultDirectory="docs"
          workspaceId="ws-1"
          saving={false}
          onSaveAs={onSaveAs}
        />
      </ThemeProvider>
    );

    expect(screen.getByLabelText("Destination folder")).toHaveValue("docs");

    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(screen.getByRole("option", { name: "Google Doc" }));

    expect(screen.queryByLabelText("Destination folder")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onSaveAs).toHaveBeenCalledWith({
        format: "google_doc",
        directory: "",
        name: "Spec"
      });
    });
  });
});
